#!/usr/bin/env node

// Reddit Idea Miner CLI

import { Command } from 'commander';
import { loadConfig, getConfig } from './config/loadConfig.js';
import { getDb, closeDb, getStats } from './store/db.js';
import { log } from './utils/log.js';
import { uuid } from './utils/text.js';
import { createIngestionRun, updateIngestionRun } from './store/db.js';
import { fetchSubredditListing, fetchMultipleSubreddits } from './ingest/subredditListing.js';
import { fetchThreadsFromPosts, fetchThreadsFromUrls } from './ingest/threadJson.js';
import { buildThreadDocument } from './ingest/normalize.js';
import { processThreadSignals } from './analyze/signals.js';
import { batchExtractInsights } from './analyze/llmExtract.js';
import { clusterInsights } from './analyze/cluster.js';
import { generateTopIdeas } from './analyze/ideaGen.js';
import { writeReports } from './report/renderMd.js';
import { writeJsonReport, exportJsonl } from './report/renderJson.js';
import { getThreadsForAnalysis, getPost } from './store/db.js';
import { loadDemoData } from './ingest/demoData.js';
import {
  loginToReddit,
  checkSession,
  scrapeAndStoreSubreddit,
  scrapeAndStoreThread,
  closeBrowser,
} from './ingest/playwrightScraper.js';

const program = new Command();

program
  .name('reddit-idea-miner')
  .description('Mine Reddit for SaaS ideas through structured analysis')
  .version('0.1.0');

// Generate niches command
program
  .command('gen:niches')
  .description('Generate 500+ niche subreddit list (already done in config)')
  .action(() => {
    log.info('CLI', 'Niche list already generated in config/subreddits.txt');
    log.info('CLI', 'See deliverables/reddit_idea_miner/NICHE_LIST_500.md for details');
  });

// Ingest from subreddits command
program
  .command('ingest:subs')
  .description('Ingest posts and threads from configured subreddits')
  .option('--days <n>', 'Only posts from last N days', parseInt)
  .option('--max-threads <n>', 'Max threads to fetch', parseInt)
  .option('--subs <file>', 'Alternate subreddit file')
  .option('--dry-run', 'Show what would be fetched without fetching')
  .action(async (options) => {
    try {
      loadConfig();
      const config = getConfig();
      getDb(); // Initialize database

      const subreddits = config.subreddits;
      if (subreddits.length === 0) {
        log.error('CLI', 'No subreddits configured in config/subreddits.txt');
        process.exit(1);
      }

      log.info('CLI', `Starting subreddit ingestion for ${subreddits.length} subreddits`);

      // Create run record
      const runId = uuid();
      createIngestionRun({
        id: runId,
        run_type: 'subreddits',
        status: 'running',
        config_snapshot: { options },
        subreddits_processed: 0,
        threads_fetched: 0,
        comments_fetched: 0,
        errors: [],
      });

      if (options.dryRun) {
        log.info('CLI', 'Dry run - would fetch from:');
        for (const sub of subreddits.slice(0, 10)) {
          log.info('CLI', `  r/${sub}`);
        }
        log.info('CLI', `  ... and ${subreddits.length - 10} more`);
        return;
      }

      // Fetch listings from all subreddits
      const listingOptions: { maxDaysOld?: number } = {};
      if (options.days) {
        listingOptions.maxDaysOld = options.days;
      }

      const results = await fetchMultipleSubreddits(subreddits, listingOptions);

      // Collect all posts for thread fetching
      const allPosts = Array.from(results.values()).flat();
      log.info('CLI', `Found ${allPosts.length} posts across ${subreddits.length} subreddits`);

      // Fetch threads
      const maxThreads = options.maxThreads ?? config.run.maxThreadsTotalPerRun ?? 1000;
      const { fetched, skipped, errors } = await fetchThreadsFromPosts(allPosts, {
        maxThreads,
      });

      // Update run record
      const totalComments = fetched.reduce((sum, r) => sum + r.commentCount, 0);
      updateIngestionRun(runId, {
        status: 'completed',
        completed_at: new Date().toISOString(),
        subreddits_processed: subreddits.length,
        threads_fetched: fetched.length,
        comments_fetched: totalComments,
      });

      log.info('CLI', `Ingestion complete:`);
      log.info('CLI', `  Threads fetched: ${fetched.length}`);
      log.info('CLI', `  Comments stored: ${totalComments}`);
      log.info('CLI', `  Skipped: ${skipped}`);
      log.info('CLI', `  Errors: ${errors}`);
    } catch (error) {
      log.error('CLI', `Ingestion failed: ${error}`);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// Ingest from URLs command
program
  .command('ingest:urls')
  .description('Ingest threads from seed URLs')
  .option('--file <path>', 'URL file (default: config/seed_urls.txt)')
  .action(async (options) => {
    try {
      loadConfig();
      const config = getConfig();
      getDb();

      const urls = config.seedUrls;
      if (urls.length === 0) {
        log.warn('CLI', 'No seed URLs in config/seed_urls.txt');
        return;
      }

      log.info('CLI', `Ingesting ${urls.length} threads from seed URLs`);

      const { fetched, skipped, errors } = await fetchThreadsFromUrls(urls);

      log.info('CLI', `URL ingestion complete:`);
      log.info('CLI', `  Threads fetched: ${fetched.length}`);
      log.info('CLI', `  Skipped: ${skipped}`);
      log.info('CLI', `  Errors: ${errors}`);
    } catch (error) {
      log.error('CLI', `URL ingestion failed: ${error}`);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// Analyze command
program
  .command('analyze')
  .description('Run signal extraction and LLM analysis on threads')
  .option('--max-threads <n>', 'Max threads to analyze', parseInt)
  .option('--min-pain <n>', 'Minimum pain score threshold', parseFloat)
  .option('--min-intent <n>', 'Minimum intent score threshold', parseFloat)
  .action(async (options) => {
    try {
      loadConfig();
      const config = getConfig();
      getDb();

      // Get threads for analysis
      const maxThreads = options.maxThreads ?? config.run.analysis?.maxThreadsToAnalyze ?? 500;
      const threads = getThreadsForAnalysis(maxThreads);

      if (threads.length === 0) {
        log.info('CLI', 'No threads pending analysis');
        return;
      }

      log.info('CLI', `Analyzing ${threads.length} threads`);

      // Build thread documents and extract signals
      const docs = [];
      for (const thread of threads) {
        const doc = buildThreadDocument(thread.id);
        if (doc) {
          // Extract signals first
          const signals = processThreadSignals(doc);
          doc.signals = signals;
          docs.push(doc);
        }
      }

      log.info('CLI', `Extracted signals for ${docs.length} threads`);

      // Run LLM extraction
      const minPain = options.minPain ?? config.run.analysis?.minPainScore ?? 3;
      const minIntent = options.minIntent ?? config.run.analysis?.minIntentScore ?? 3;

      const { extracted, skipped, errors } = await batchExtractInsights(docs, {
        minPainScore: minPain,
        minIntentScore: minIntent,
      });

      log.info('CLI', `LLM analysis complete:`);
      log.info('CLI', `  Insights extracted: ${extracted.length}`);
      log.info('CLI', `  Skipped (low signals): ${skipped}`);
      log.info('CLI', `  Errors: ${errors}`);
    } catch (error) {
      log.error('CLI', `Analysis failed: ${error}`);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// Cluster command
program
  .command('cluster')
  .description('Cluster insights into themes')
  .action(async () => {
    try {
      loadConfig();
      getDb();

      const clusters = await clusterInsights();

      log.info('CLI', `Created ${clusters.length} clusters`);
    } catch (error) {
      log.error('CLI', `Clustering failed: ${error}`);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// Generate ideas command
program
  .command('generate')
  .description('Generate top SaaS ideas from clusters')
  .option('--count <n>', 'Number of ideas to generate', parseInt)
  .action(async (options) => {
    try {
      loadConfig();
      getDb();

      const count = options.count ?? 20;
      const ideas = await generateTopIdeas(count);

      log.info('CLI', `Generated ${ideas.length} ideas`);

      // Write reports
      writeReports();
      writeJsonReport();

      log.info('CLI', 'Reports written to deliverables/reddit_idea_miner/');
    } catch (error) {
      log.error('CLI', `Idea generation failed: ${error}`);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// Status command
program
  .command('status')
  .description('Show ingestion and analysis status')
  .action(() => {
    try {
      loadConfig();
      getDb();

      const stats = getStats();

      console.log('\n=== Reddit Idea Miner Status ===\n');
      console.log(`Subreddits tracked:    ${stats.subreddits}`);
      console.log(`Posts stored:          ${stats.posts}`);
      console.log(`Comments stored:       ${stats.comments}`);
      console.log(`Threads total:         ${stats.threads}`);
      console.log(`Threads analyzed:      ${stats.threadsAnalyzed}`);
      console.log(`Insights extracted:    ${stats.insights}`);
      console.log(`Clusters created:      ${stats.clusters}`);
      console.log(`Ideas generated:       ${stats.ideas}`);
      console.log('');
    } catch (error) {
      log.error('CLI', `Status check failed: ${error}`);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// Export command
program
  .command('export')
  .description('Export data to JSONL')
  .option('--format <format>', 'Output format (jsonl)', 'jsonl')
  .option('--output <path>', 'Output file path')
  .action((options) => {
    try {
      loadConfig();
      const config = getConfig();
      getDb();

      const outputPath = options.output ?? `${config.paths.data}/export.jsonl`;
      exportJsonl(outputPath);
    } catch (error) {
      log.error('CLI', `Export failed: ${error}`);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// Smoke test command
program
  .command('smoke-test')
  .description('Run integration smoke test (uses demo data if Reddit API unavailable)')
  .option('--demo', 'Force use of demo data')
  .action(async (options) => {
    try {
      log.info('CLI', '=== Starting Smoke Test ===');
      loadConfig();
      getDb();

      let useDemo = options.demo;

      if (!useDemo) {
        // Try real data first
        const testSubs = ['sysadmin', 'msp'];
        log.info('CLI', `Testing with subreddits: ${testSubs.join(', ')}`);

        try {
          const results = await fetchMultipleSubreddits(testSubs, { maxPosts: 5 });
          const posts = Array.from(results.values()).flat();

          if (posts.length === 0) {
            log.warn('CLI', 'Reddit API blocked, switching to demo data');
            useDemo = true;
          } else {
            const { fetched } = await fetchThreadsFromPosts(posts, { maxThreads: 5 });
            if (fetched.length === 0) {
              useDemo = true;
            }
          }
        } catch {
          log.warn('CLI', 'Reddit API error, switching to demo data');
          useDemo = true;
        }
      }

      if (useDemo) {
        log.info('CLI', '--- Using Demo Data ---');
        const demoStats = loadDemoData();
        log.info('CLI', `Loaded ${demoStats.posts} posts and ${demoStats.comments} comments`);
      }

      // Get threads for analysis
      const threads = getThreadsForAnalysis(10);
      log.info('CLI', `Found ${threads.length} threads for analysis`);

      if (threads.length === 0) {
        log.warn('CLI', 'No threads available for analysis');
        return;
      }

      // Build docs and extract signals
      const docs = threads.map((t) => {
        const doc = buildThreadDocument(t.id);
        if (doc) {
          const signals = processThreadSignals(doc);
          doc.signals = signals;
        }
        return doc;
      }).filter((d): d is NonNullable<typeof d> => d !== null);

      log.info('CLI', `Extracted signals for ${docs.length} threads`);

      // Run LLM analysis
      const { extracted, skipped, errors } = await batchExtractInsights(docs, {
        minPainScore: 0,
        minIntentScore: 0,
      });
      log.info('CLI', `Extracted ${extracted.length} insights (skipped: ${skipped}, errors: ${errors})`);

      if (extracted.length >= 3) {
        // Cluster and generate ideas
        await clusterInsights();
        const ideas = await generateTopIdeas(3);
        log.info('CLI', `Generated ${ideas.length} ideas`);

        // Write reports
        writeReports();
        writeJsonReport();
      } else {
        log.warn('CLI', 'Not enough insights for clustering (need at least 3)');
      }

      log.info('CLI', '=== Smoke Test Complete ===');

      // Show final status
      const stats = getStats();
      console.log('\nFinal Stats:');
      console.log(`  Posts: ${stats.posts}`);
      console.log(`  Comments: ${stats.comments}`);
      console.log(`  Insights: ${stats.insights}`);
      console.log(`  Ideas: ${stats.ideas}`);
    } catch (error) {
      log.error('CLI', `Smoke test failed: ${error}`);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// Full pipeline command
program
  .command('run-full')
  .description('Run complete pipeline: ingest → analyze → cluster → generate')
  .option('--max-subs <n>', 'Max subreddits to process', parseInt)
  .option('--max-threads <n>', 'Max threads to fetch', parseInt)
  .option('--ideas <n>', 'Number of ideas to generate', parseInt)
  .action(async (options) => {
    try {
      log.info('CLI', '=== Starting Full Pipeline ===');
      loadConfig();
      const config = getConfig();
      getDb();

      // Step 1: Ingest
      log.info('CLI', '\n--- Step 1: Ingestion ---');
      const subreddits = config.subreddits.slice(0, options.maxSubs ?? 50);
      const results = await fetchMultipleSubreddits(subreddits);
      const posts = Array.from(results.values()).flat();

      const maxThreads = options.maxThreads ?? 100;
      const { fetched } = await fetchThreadsFromPosts(posts, { maxThreads });
      log.info('CLI', `Ingested ${fetched.length} threads`);

      // Step 2: Analyze
      log.info('CLI', '\n--- Step 2: Analysis ---');
      const threads = getThreadsForAnalysis(fetched.length);
      const docs = threads.map((t) => {
        const doc = buildThreadDocument(t.id);
        if (doc) {
          doc.signals = processThreadSignals(doc);
        }
        return doc;
      }).filter((d): d is NonNullable<typeof d> => d !== null);

      await batchExtractInsights(docs);

      // Step 3: Cluster
      log.info('CLI', '\n--- Step 3: Clustering ---');
      await clusterInsights();

      // Step 4: Generate
      log.info('CLI', '\n--- Step 4: Idea Generation ---');
      const ideaCount = options.ideas ?? 20;
      await generateTopIdeas(ideaCount);

      // Step 5: Report
      log.info('CLI', '\n--- Step 5: Reports ---');
      writeReports();
      writeJsonReport();

      log.info('CLI', '\n=== Full Pipeline Complete ===');
      log.info('CLI', 'See deliverables/reddit_idea_miner/ for outputs');
    } catch (error) {
      log.error('CLI', `Pipeline failed: ${error}`);
      process.exit(1);
    } finally {
      closeDb();
    }
  });

// Reddit login command (Playwright)
program
  .command('login')
  .description('Login to Reddit using Playwright (stores session)')
  .requiredOption('-u, --username <username>', 'Reddit username')
  .requiredOption('-p, --password <password>', 'Reddit password')
  .action(async (options) => {
    try {
      loadConfig();
      log.info('CLI', 'Logging into Reddit via browser...');

      const success = await loginToReddit(options.username, options.password);

      if (success) {
        log.info('CLI', 'Login successful! Session saved.');
      } else {
        log.error('CLI', 'Login failed - check credentials');
        process.exit(1);
      }
    } catch (error) {
      log.error('CLI', `Login error: ${error}`);
      process.exit(1);
    } finally {
      await closeBrowser();
    }
  });

// Check session command
program
  .command('check-session')
  .description('Check if Reddit session is valid')
  .action(async () => {
    try {
      loadConfig();
      const valid = await checkSession();
      if (valid) {
        log.info('CLI', 'Session is valid');
      } else {
        log.warn('CLI', 'Session is invalid or expired - run login command');
      }
    } catch (error) {
      log.error('CLI', `Session check error: ${error}`);
    } finally {
      await closeBrowser();
    }
  });

// Playwright scrape command
program
  .command('scrape')
  .description('Scrape Reddit using Playwright browser')
  .option('--subs <subs...>', 'Subreddits to scrape')
  .option('--threads <urls...>', 'Thread URLs/permalinks to scrape')
  .option('--max-posts <n>', 'Max posts per subreddit', parseInt)
  .action(async (options) => {
    try {
      loadConfig();
      const config = getConfig();
      getDb();

      // Check session first
      log.info('CLI', 'Checking Reddit session...');
      const hasSession = await checkSession();
      if (!hasSession) {
        log.warn('CLI', 'No valid session - scraping as guest (limited)');
      }

      // Scrape subreddits
      const subreddits = options.subs ?? config.subreddits.slice(0, 5);
      const maxPosts = options.maxPosts ?? 25;

      log.info('CLI', `Scraping ${subreddits.length} subreddits with Playwright...`);

      let totalPosts = 0;
      for (const sub of subreddits) {
        log.info('CLI', `Scraping r/${sub}...`);
        const posts = await scrapeAndStoreSubreddit(sub, { maxPosts });
        totalPosts += posts.length;
        log.info('CLI', `  Got ${posts.length} posts`);

        // Scrape top threads
        const topPosts = posts.slice(0, 5);
        for (const post of topPosts) {
          if (post.permalink) {
            await scrapeAndStoreThread(post.permalink);
          }
        }

        // Rate limiting
        await new Promise((r) => setTimeout(r, 2000));
      }

      // Scrape specific threads if provided
      if (options.threads) {
        for (const url of options.threads) {
          const permalink = url.replace(/^https?:\/\/(www\.|old\.)?reddit\.com/, '');
          await scrapeAndStoreThread(permalink);
        }
      }

      log.info('CLI', `Scraping complete: ${totalPosts} posts collected`);

      const stats = getStats();
      console.log('\nDatabase Stats:');
      console.log(`  Posts: ${stats.posts}`);
      console.log(`  Comments: ${stats.comments}`);
      console.log(`  Threads: ${stats.threads}`);
    } catch (error) {
      log.error('CLI', `Scraping error: ${error}`);
      process.exit(1);
    } finally {
      await closeBrowser();
      closeDb();
    }
  });

// Full pipeline with Playwright
program
  .command('run-playwright')
  .description('Run full pipeline using Playwright scraper (no API needed)')
  .option('--subs <subs...>', 'Subreddits to scrape')
  .option('--max-posts <n>', 'Max posts per subreddit', parseInt)
  .option('--ideas <n>', 'Number of ideas to generate', parseInt)
  .action(async (options) => {
    try {
      log.info('CLI', '=== Starting Playwright Pipeline ===');
      loadConfig();
      const config = getConfig();
      getDb();

      // Step 1: Scrape with Playwright
      log.info('CLI', '\n--- Step 1: Playwright Scraping ---');
      const subreddits = options.subs ?? config.subreddits.slice(0, 10);
      const maxPosts = options.maxPosts ?? 20;

      for (const sub of subreddits) {
        log.info('CLI', `Scraping r/${sub}...`);
        const posts = await scrapeAndStoreSubreddit(sub, { maxPosts });

        // Scrape threads for top posts (increased for better B2C insights)
        for (const post of posts.slice(0, 10)) {
          if (post.permalink) {
            await scrapeAndStoreThread(post.permalink);
          }
          await new Promise((r) => setTimeout(r, 2000)); // Slower to avoid rate limits
        }
        await new Promise((r) => setTimeout(r, 3000));
      }

      await closeBrowser();

      // Step 2: Analyze
      log.info('CLI', '\n--- Step 2: Analysis ---');
      const threads = getThreadsForAnalysis(100);
      const docs = threads.map((t) => {
        const doc = buildThreadDocument(t.id);
        if (doc) {
          doc.signals = processThreadSignals(doc);
        }
        return doc;
      }).filter((d): d is NonNullable<typeof d> => d !== null);

      await batchExtractInsights(docs);

      // Step 3: Cluster
      log.info('CLI', '\n--- Step 3: Clustering ---');
      await clusterInsights();

      // Step 4: Generate
      log.info('CLI', '\n--- Step 4: Idea Generation ---');
      const ideaCount = options.ideas ?? 20;
      await generateTopIdeas(ideaCount);

      // Step 5: Report
      log.info('CLI', '\n--- Step 5: Reports ---');
      writeReports();
      writeJsonReport();

      log.info('CLI', '\n=== Playwright Pipeline Complete ===');
      log.info('CLI', 'See deliverables/reddit_idea_miner/ for outputs');
    } catch (error) {
      log.error('CLI', `Pipeline failed: ${error}`);
      process.exit(1);
    } finally {
      await closeBrowser();
      closeDb();
    }
  });

program.parse();
