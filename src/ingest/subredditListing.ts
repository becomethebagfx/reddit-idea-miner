// Fetch and process subreddit listings

import { fetchJson, buildListingUrl, HttpError } from './http.js';
import { parseListingJson } from './parseThread.js';
import { enqueue } from './scheduler.js';
import { upsertPost } from '../store/db.js';
import { getConfig } from '../config/loadConfig.js';
import { log } from '../utils/log.js';
import { countKeywordMatches, findMatchingKeywords } from '../utils/text.js';
import type { Post } from '../store/models.js';

export interface ListingOptions {
  subreddit: string;
  maxPosts?: number;
  sorts?: Array<'new' | 'top' | 'hot' | 'rising'>;
  topTimeframes?: Array<'hour' | 'day' | 'week' | 'month' | 'year' | 'all'>;
  minDaysOld?: number;
  maxDaysOld?: number;
}

export interface FetchedPost extends Post {
  priority: number;
  keywordsMatched: string[];
}

/**
 * Score a post for priority (higher = more relevant)
 */
function scorePost(post: Post, keywords: string[]): { priority: number; keywordsMatched: string[] } {
  const config = getConfig();
  const textToScore = `${post.title} ${post.selftext}`.toLowerCase();

  // Count keyword matches
  const keywordsMatched = findMatchingKeywords(textToScore, keywords);
  const keywordScore = Math.min(keywordsMatched.length * 2, 20);

  // Comment engagement score (log scale)
  const commentScore = Math.min(Math.log10(post.num_comments + 1) * 5, 15);

  // Upvote score (log scale)
  const upvoteScore = Math.min(Math.log10(Math.max(post.score, 1)) * 3, 10);

  // Recency bonus (posts from last 30 days)
  const ageInDays = (Date.now() / 1000 - post.created_utc) / 86400;
  const recencyBonus = ageInDays < 30 ? 5 : ageInDays < 90 ? 3 : 0;

  // Self-post bonus (more likely to have discussion)
  const selfPostBonus = post.is_self ? 5 : 0;

  const priority = keywordScore + commentScore + upvoteScore + recencyBonus + selfPostBonus;

  return { priority, keywordsMatched };
}

/**
 * Fetch posts from a subreddit listing
 */
export async function fetchSubredditListing(options: ListingOptions): Promise<FetchedPost[]> {
  const config = getConfig();
  const {
    subreddit,
    maxPosts = config.run.maxPostsPerSubPerRun ?? config.env.MAX_POSTS_PER_SUB_PER_RUN,
    sorts = ['new', 'top'],
    topTimeframes = ['month', 'year'],
    minDaysOld,
    maxDaysOld,
  } = options;

  const keywords = config.keywords;
  const allPosts = new Map<string, FetchedPost>();

  log.info('LISTING', `Fetching listings from r/${subreddit}`);

  // Fetch from each sort type
  for (const sort of sorts) {
    if (sort === 'top') {
      // Fetch each timeframe for top posts
      for (const timeframe of topTimeframes) {
        try {
          const url = buildListingUrl(subreddit, sort, { limit: 100, t: timeframe });
          const response = await enqueue(() => fetchJson<unknown>(url));
          const { posts } = parseListingJson(response.data as never);

          for (const post of posts) {
            // Apply age filter
            if (minDaysOld !== undefined || maxDaysOld !== undefined) {
              const ageInDays = (Date.now() / 1000 - post.created_utc) / 86400;
              if (minDaysOld !== undefined && ageInDays < minDaysOld) continue;
              if (maxDaysOld !== undefined && ageInDays > maxDaysOld) continue;
            }

            const { priority, keywordsMatched } = scorePost(post, keywords);
            const existing = allPosts.get(post.id);

            if (!existing || existing.priority < priority) {
              allPosts.set(post.id, { ...post, priority, keywordsMatched });
            }
          }

          log.debug('LISTING', `r/${subreddit}/${sort}?t=${timeframe}: ${posts.length} posts`);
        } catch (error) {
          if (error instanceof HttpError && error.status === 404) {
            log.warn('LISTING', `Subreddit r/${subreddit} not found`);
            return [];
          }
          log.warn('LISTING', `Error fetching r/${subreddit}/${sort}?t=${timeframe}: ${error}`);
        }
      }
    } else {
      // Fetch new/hot/rising
      try {
        const url = buildListingUrl(subreddit, sort, { limit: 100 });
        const response = await enqueue(() => fetchJson<unknown>(url));
        const { posts } = parseListingJson(response.data as never);

        for (const post of posts) {
          // Apply age filter
          if (minDaysOld !== undefined || maxDaysOld !== undefined) {
            const ageInDays = (Date.now() / 1000 - post.created_utc) / 86400;
            if (minDaysOld !== undefined && ageInDays < minDaysOld) continue;
            if (maxDaysOld !== undefined && ageInDays > maxDaysOld) continue;
          }

          const { priority, keywordsMatched } = scorePost(post, keywords);
          const existing = allPosts.get(post.id);

          if (!existing || existing.priority < priority) {
            allPosts.set(post.id, { ...post, priority, keywordsMatched });
          }
        }

        log.debug('LISTING', `r/${subreddit}/${sort}: ${posts.length} posts`);
      } catch (error) {
        if (error instanceof HttpError && error.status === 404) {
          log.warn('LISTING', `Subreddit r/${subreddit} not found`);
          return [];
        }
        log.warn('LISTING', `Error fetching r/${subreddit}/${sort}: ${error}`);
      }
    }
  }

  // Sort by priority and take top N
  const sortedPosts = Array.from(allPosts.values())
    .sort((a, b) => b.priority - a.priority)
    .slice(0, maxPosts);

  log.info('LISTING', `r/${subreddit}: ${sortedPosts.length}/${allPosts.size} posts selected`);

  // Store posts in database
  for (const post of sortedPosts) {
    upsertPost(post);
  }

  return sortedPosts;
}

/**
 * Fetch listings from multiple subreddits
 */
export async function fetchMultipleSubreddits(
  subreddits: string[],
  options: Omit<ListingOptions, 'subreddit'> = {}
): Promise<Map<string, FetchedPost[]>> {
  const results = new Map<string, FetchedPost[]>();

  for (let i = 0; i < subreddits.length; i++) {
    const subreddit = subreddits[i]!;
    log.progress('LISTING', i + 1, subreddits.length, `r/${subreddit}`);

    try {
      const posts = await fetchSubredditListing({ ...options, subreddit });
      results.set(subreddit, posts);
    } catch (error) {
      log.error('LISTING', `Failed to fetch r/${subreddit}: ${error}`);
      results.set(subreddit, []);
    }
  }

  return results;
}

export default {
  fetchSubredditListing,
  fetchMultipleSubreddits,
  scorePost,
};
