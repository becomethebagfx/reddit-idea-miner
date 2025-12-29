// Playwright-based Reddit scraper with stealth mode

import { firefox, Browser, Page, BrowserContext } from 'playwright';
import { log } from '../utils/log.js';
import { upsertPost, upsertComments, upsertThread } from '../store/db.js';
import { cleanRedditMarkdown } from '../utils/text.js';
import type { Post, Comment, Thread } from '../store/models.js';
import { readFileSync, writeFileSync, existsSync } from 'fs';
import { join } from 'path';
import { getConfig } from '../config/loadConfig.js';

interface RedditSession {
  cookies: Array<{
    name: string;
    value: string;
    domain: string;
    path: string;
    expires: number;
    httpOnly: boolean;
    secure: boolean;
    sameSite: 'Strict' | 'Lax' | 'None';
  }>;
  localStorage: Record<string, string>;
}

let browser: Browser | null = null;
let context: BrowserContext | null = null;

const SESSION_FILE = 'data/reddit_session.json';

/**
 * Get or create browser instance
 */
async function getBrowser(): Promise<Browser> {
  if (browser) return browser;

  log.info('BROWSER', 'Launching browser in stealth mode...');

  browser = await firefox.launch({
    headless: true,
    firefoxUserPrefs: {
      'dom.webdriver.enabled': false,
      'useAutomationExtension': false,
    },
  });

  return browser;
}

/**
 * Get or create browser context with session
 */
async function getContext(): Promise<BrowserContext> {
  if (context) return context;

  const b = await getBrowser();
  const config = getConfig();

  context = await b.newContext({
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    viewport: { width: 1920, height: 1080 },
    locale: 'en-US',
    timezoneId: 'America/New_York',
  });

  // Load saved session if exists
  const sessionPath = join(config.paths.root, SESSION_FILE);
  if (existsSync(sessionPath)) {
    try {
      const session: RedditSession = JSON.parse(readFileSync(sessionPath, 'utf-8'));
      await context.addCookies(session.cookies);
      log.info('BROWSER', 'Loaded saved Reddit session');
    } catch {
      log.warn('BROWSER', 'Failed to load saved session');
    }
  }

  return context;
}

/**
 * Save session for later use
 */
async function saveSession(): Promise<void> {
  if (!context) return;

  const config = getConfig();
  const cookies = await context.cookies();

  const session: RedditSession = {
    cookies,
    localStorage: {},
  };

  const sessionPath = join(config.paths.root, SESSION_FILE);
  writeFileSync(sessionPath, JSON.stringify(session, null, 2));
  log.info('BROWSER', 'Saved Reddit session');
}

/**
 * Login to Reddit
 */
export async function loginToReddit(username: string, password: string): Promise<boolean> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  const config = getConfig();

  try {
    log.info('BROWSER', 'Logging into Reddit...');

    // Go to Reddit login
    await page.goto('https://www.reddit.com/login', { waitUntil: 'domcontentloaded', timeout: 30000 });
    await page.waitForTimeout(2000);

    // Save debug screenshot
    await page.screenshot({ path: `${config.paths.data}/debug_login.png` });

    // Reddit uses custom faceplate-text-input components
    // We need to click on them and type using keyboard
    log.info('BROWSER', 'Filling login form with keyboard...');

    // Click on username field and type
    const usernameField = page.locator('#login-username, [name="username"], faceplate-text-input[name="username"]').first();
    await usernameField.click();
    await page.waitForTimeout(300);
    await page.keyboard.type(username, { delay: 50 });

    // Click on password field and type
    const passwordField = page.locator('#login-password, [name="password"], faceplate-text-input[name="password"]').first();
    await passwordField.click();
    await page.waitForTimeout(300);
    await page.keyboard.type(password, { delay: 50 });

    await page.screenshot({ path: `${config.paths.data}/debug_login_filled.png` });

    // Click login button
    const loginBtn = page.locator('button:has-text("Log In"), button[type="submit"]').first();
    await loginBtn.click();

    // Wait for navigation/redirect
    log.info('BROWSER', 'Waiting for login response...');
    await page.waitForTimeout(5000);
    await page.screenshot({ path: `${config.paths.data}/debug_login_after.png` });

    // Check if logged in
    const currentUrl = page.url();
    const pageContent = await page.content();

    const loggedIn = !currentUrl.includes('/login') &&
                     (pageContent.includes('logout') ||
                      pageContent.includes('Log Out') ||
                      pageContent.includes('account') ||
                      pageContent.toLowerCase().includes('karma'));

    if (loggedIn) {
      log.info('BROWSER', 'Successfully logged into Reddit');
      await saveSession();
      return true;
    } else {
      log.warn('BROWSER', 'Login may have failed - check debug_login_after.png');
      // Save session anyway in case cookies were set
      await saveSession();
      return false;
    }
  } catch (error) {
    log.error('BROWSER', `Login error: ${error}`);
    await page.screenshot({ path: `${config.paths.data}/debug_login_error.png` });
    return false;
  } finally {
    await page.close();
  }
}

/**
 * Check if we have a valid session
 */
export async function checkSession(): Promise<boolean> {
  const ctx = await getContext();
  const page = await ctx.newPage();

  try {
    await page.goto('https://www.reddit.com', { waitUntil: 'networkidle' });

    const loggedIn = await page.evaluate(() => {
      const text = document.body.innerText;
      return text.includes('Log Out') || !text.includes('Log In');
    });

    return loggedIn;
  } catch {
    return false;
  } finally {
    await page.close();
  }
}

interface ScrapedPost {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  author: string;
  score: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
}

/**
 * Scrape posts from a subreddit listing
 */
export async function scrapeSubredditListing(
  subreddit: string,
  sort: 'new' | 'top' | 'hot' = 'new',
  options: { limit?: number; timeframe?: string } = {}
): Promise<ScrapedPost[]> {
  const ctx = await getContext();
  const page = await ctx.newPage();
  const { limit = 25, timeframe } = options;

  try {
    let url = `https://old.reddit.com/r/${subreddit}/${sort}`;
    if (sort === 'top' && timeframe) {
      url += `?t=${timeframe}`;
    }

    log.info('BROWSER', `Scraping ${url}`);
    await page.goto(url, { waitUntil: 'networkidle', timeout: 30000 });

    // Check for age gate or interstitials
    const over18Button = await page.$('button:has-text("Yes"), a:has-text("yes")');
    if (over18Button) {
      await over18Button.click();
      await page.waitForTimeout(2000);
    }

    // Wait for posts to load - try multiple selectors
    try {
      await page.waitForSelector('.thing', { timeout: 10000 });
    } catch {
      // Take screenshot for debugging
      const config = getConfig();
      await page.screenshot({ path: `${config.paths.data}/debug_${subreddit}.png` });
      log.warn('BROWSER', `Saved debug screenshot to data/debug_${subreddit}.png`);

      // Try new Reddit selectors as fallback
      const hasShreddit = await page.$('shreddit-post');
      if (hasShreddit) {
        log.warn('BROWSER', 'Detected new Reddit - switching to new.reddit selectors');
      }
      throw new Error('Could not find Reddit posts - check debug screenshot');
    }

    // Extract post data
    const posts = await page.evaluate(() => {
      const things = document.querySelectorAll('.thing.link');
      const results: ScrapedPost[] = [];

      things.forEach((thing) => {
        try {
          const id = thing.getAttribute('data-fullname')?.replace('t3_', '') || '';
          const subreddit = thing.getAttribute('data-subreddit') || '';
          const titleEl = thing.querySelector('a.title');
          const title = titleEl?.textContent || '';
          const permalink = thing.getAttribute('data-permalink') || '';
          const author = thing.getAttribute('data-author') || '[deleted]';

          const scoreEl = thing.querySelector('.score.unvoted');
          const scoreText = scoreEl?.getAttribute('title') || '0';
          const score = parseInt(scoreText) || 0;

          const commentsEl = thing.querySelector('.comments');
          const commentsText = commentsEl?.textContent || '0';
          const numComments = parseInt(commentsText.replace(/[^\d]/g, '')) || 0;

          const timeEl = thing.querySelector('time');
          const timestamp = timeEl?.getAttribute('datetime') || '';
          const created_utc = timestamp ? new Date(timestamp).getTime() / 1000 : Date.now() / 1000;

          // Get selftext from expando if available
          const expandoEl = thing.querySelector('.expando .usertext-body');
          const selftext = expandoEl?.textContent?.trim() || '';

          results.push({
            id,
            subreddit,
            title,
            selftext,
            author,
            score,
            num_comments: numComments,
            created_utc,
            permalink,
          });
        } catch {
          // Skip problematic posts
        }
      });

      return results;
    });

    log.info('BROWSER', `Found ${posts.length} posts in r/${subreddit}`);
    return posts.slice(0, limit);
  } catch (error) {
    log.error('BROWSER', `Error scraping r/${subreddit}: ${error}`);
    return [];
  } finally {
    await page.close();
  }
}

interface ScrapedComment {
  id: string;
  parent_id: string;
  author: string;
  body: string;
  score: number;
  depth: number;
}

interface ScrapedThread {
  post: ScrapedPost;
  comments: ScrapedComment[];
}

/**
 * Scrape a full thread with comments
 */
export async function scrapeThread(permalink: string): Promise<ScrapedThread | null> {
  const ctx = await getContext();
  const page = await ctx.newPage();

  try {
    const url = `https://old.reddit.com${permalink}`;
    log.debug('BROWSER', `Scraping thread: ${url}`);

    await page.goto(url, { waitUntil: 'networkidle' });

    // Wait for content
    await page.waitForSelector('.thing.link', { timeout: 10000 });

    // Extract thread data
    const data = await page.evaluate(() => {
      // Get post data
      const postEl = document.querySelector('.thing.link');
      if (!postEl) return null;

      const postId = postEl.getAttribute('data-fullname')?.replace('t3_', '') || '';
      const subreddit = postEl.getAttribute('data-subreddit') || '';
      const titleEl = postEl.querySelector('a.title');
      const title = titleEl?.textContent || '';
      const author = postEl.getAttribute('data-author') || '[deleted]';

      const scoreEl = postEl.querySelector('.score.unvoted');
      const scoreText = scoreEl?.getAttribute('title') || '0';
      const score = parseInt(scoreText) || 0;

      const selftextEl = postEl.querySelector('.usertext-body .md');
      const selftext = selftextEl?.textContent?.trim() || '';

      const timeEl = postEl.querySelector('time');
      const timestamp = timeEl?.getAttribute('datetime') || '';
      const created_utc = timestamp ? new Date(timestamp).getTime() / 1000 : Date.now() / 1000;

      const permalink = postEl.getAttribute('data-permalink') || '';

      // Get comments
      const comments: ScrapedComment[] = [];
      const commentEls = document.querySelectorAll('.thing.comment');

      commentEls.forEach((commentEl) => {
        try {
          const id = commentEl.getAttribute('data-fullname')?.replace('t1_', '') || '';
          const parentFullname = commentEl.getAttribute('data-parent') || '';
          const parent_id = parentFullname.replace(/^t[13]_/, '');
          const commentAuthor = commentEl.getAttribute('data-author') || '[deleted]';

          const bodyEl = commentEl.querySelector('.usertext-body .md');
          const body = bodyEl?.textContent?.trim() || '';

          const commentScoreEl = commentEl.querySelector('.score.unvoted');
          const commentScoreText = commentScoreEl?.textContent || '0';
          const commentScore = parseInt(commentScoreText.replace(/[^\d-]/g, '')) || 0;

          // Calculate depth based on nesting
          let depth = 0;
          let parent = commentEl.parentElement;
          while (parent) {
            if (parent.classList.contains('child')) depth++;
            parent = parent.parentElement;
          }

          if (id && body) {
            comments.push({
              id,
              parent_id: parent_id || postId,
              author: commentAuthor,
              body,
              score: commentScore,
              depth,
            });
          }
        } catch {
          // Skip problematic comments
        }
      });

      return {
        post: {
          id: postId,
          subreddit,
          title,
          selftext,
          author,
          score,
          num_comments: comments.length,
          created_utc,
          permalink,
        },
        comments,
      };
    });

    if (!data) {
      log.warn('BROWSER', `Could not parse thread: ${permalink}`);
      return null;
    }

    log.debug('BROWSER', `Scraped thread ${data.post.id}: ${data.comments.length} comments`);
    return data;
  } catch (error) {
    log.error('BROWSER', `Error scraping thread ${permalink}: ${error}`);
    return null;
  } finally {
    await page.close();
  }
}

/**
 * Scrape and store posts from a subreddit
 */
export async function scrapeAndStoreSubreddit(
  subreddit: string,
  options: { maxPosts?: number; sorts?: Array<'new' | 'top' | 'hot'> } = {}
): Promise<Post[]> {
  const { maxPosts = 50, sorts = ['new', 'top'] } = options;
  const allPosts = new Map<string, Post>();

  for (const sort of sorts) {
    const timeframes = sort === 'top' ? ['month', 'year'] : [undefined];

    for (const timeframe of timeframes) {
      const scraped = await scrapeSubredditListing(subreddit, sort, {
        limit: maxPosts,
        timeframe,
      });

      for (const p of scraped) {
        if (!allPosts.has(p.id)) {
          const post: Post = {
            id: p.id,
            subreddit: p.subreddit,
            title: cleanRedditMarkdown(p.title),
            selftext: cleanRedditMarkdown(p.selftext),
            author: p.author,
            score: p.score,
            upvote_ratio: null,
            num_comments: p.num_comments,
            created_utc: p.created_utc,
            permalink: p.permalink,
            is_self: true,
          };

          upsertPost(post);
          allPosts.set(p.id, post);
        }
      }

      // Delay between requests to avoid rate limiting
      await new Promise((r) => setTimeout(r, 2500));
    }
  }

  return Array.from(allPosts.values());
}

/**
 * Scrape and store a full thread
 */
export async function scrapeAndStoreThread(permalink: string): Promise<Thread | null> {
  const scraped = await scrapeThread(permalink);
  if (!scraped) return null;

  // Store post
  const post: Post = {
    id: scraped.post.id,
    subreddit: scraped.post.subreddit,
    title: cleanRedditMarkdown(scraped.post.title),
    selftext: cleanRedditMarkdown(scraped.post.selftext),
    author: scraped.post.author,
    score: scraped.post.score,
    upvote_ratio: null,
    num_comments: scraped.post.num_comments,
    created_utc: scraped.post.created_utc,
    permalink: scraped.post.permalink,
    is_self: true,
  };
  upsertPost(post);

  // Store comments
  const comments: Comment[] = scraped.comments.map((c) => ({
    id: c.id,
    post_id: scraped.post.id,
    parent_id: c.parent_id,
    depth: c.depth,
    author: c.author,
    body: cleanRedditMarkdown(c.body),
    score: c.score,
    created_utc: scraped.post.created_utc,
    is_submitter: c.author === scraped.post.author,
  }));

  if (comments.length > 0) {
    upsertComments(comments);
  }

  // Create thread record
  const uniqueAuthors = new Set(comments.map((c) => c.author));
  uniqueAuthors.add(post.author);

  const thread: Thread = {
    id: post.id,
    post_id: post.id,
    subreddit: post.subreddit,
    comment_count: comments.length,
    unique_authors: uniqueAuthors.size,
    max_depth: Math.max(...comments.map((c) => c.depth), 0),
    truncated: false,
  };

  upsertThread(thread);

  return thread;
}

/**
 * Close browser
 */
export async function closeBrowser(): Promise<void> {
  if (context) {
    await context.close();
    context = null;
  }
  if (browser) {
    await browser.close();
    browser = null;
  }
}

export default {
  loginToReddit,
  checkSession,
  scrapeSubredditListing,
  scrapeThread,
  scrapeAndStoreSubreddit,
  scrapeAndStoreThread,
  closeBrowser,
  saveSession,
};
