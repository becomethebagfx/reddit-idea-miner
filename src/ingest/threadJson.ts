// Fetch and store full thread data

import { fetchJson, buildThreadUrl, HttpError, CacheHitError } from './http.js';
import { parseThreadJson } from './parseThread.js';
import { enqueue } from './scheduler.js';
import { upsertPost, upsertComments, upsertThread, getThread } from '../store/db.js';
import { log } from '../utils/log.js';
import { extractPostIdFromPermalink } from '../utils/text.js';
import type { Post, Thread } from '../store/models.js';

export interface FetchThreadResult {
  thread: Thread;
  post: Post;
  commentCount: number;
  isNew: boolean;
}

/**
 * Fetch a single thread by permalink
 */
export async function fetchThread(permalink: string): Promise<FetchThreadResult | null> {
  const url = buildThreadUrl(permalink);

  // Extract post ID from permalink and check if already fetched
  const postId = extractPostIdFromPermalink(permalink);
  if (postId) {
    const existingThread = getThread(postId);
    if (existingThread) {
      log.debug('THREAD', `Thread ${postId} already in database, skipping`);
      return null;
    }
  }

  try {
    const response = await enqueue(() => fetchJson<unknown[]>(url));
    const parsed = parseThreadJson(response.data);

    // Store post
    upsertPost(parsed.post);

    // Store comments
    if (parsed.comments.length > 0) {
      upsertComments(parsed.comments);
    }

    // Create thread record
    const thread: Thread = {
      id: parsed.post.id,
      post_id: parsed.post.id,
      subreddit: parsed.post.subreddit,
      comment_count: parsed.comments.length,
      unique_authors: parsed.uniqueAuthors.size,
      max_depth: parsed.maxDepth,
      truncated: parsed.truncated,
    };

    upsertThread(thread);

    log.debug('THREAD', `Fetched ${parsed.post.id}: ${parsed.comments.length} comments`);

    return {
      thread,
      post: parsed.post,
      commentCount: parsed.comments.length,
      isNew: true,
    };
  } catch (error) {
    if (error instanceof HttpError) {
      if (error.status === 404) {
        log.warn('THREAD', `Thread not found: ${permalink}`);
        return null;
      }
      if (error.status === 403) {
        log.warn('THREAD', `Thread access forbidden: ${permalink}`);
        return null;
      }
    }

    // Check if this is a cache hit (already fetched)
    if (error instanceof CacheHitError) {
      log.debug('THREAD', `Thread already fetched recently: ${permalink}`);
      return null;
    }

    log.error('THREAD', `Error fetching thread ${permalink}: ${error}`);
    throw error;
  }
}

/**
 * Fetch multiple threads from posts
 */
export async function fetchThreadsFromPosts(
  posts: Post[],
  options: {
    maxThreads?: number;
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<{
  fetched: FetchThreadResult[];
  skipped: number;
  errors: number;
}> {
  const { maxThreads = posts.length, onProgress } = options;
  const toFetch = posts.slice(0, maxThreads);

  const fetched: FetchThreadResult[] = [];
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < toFetch.length; i++) {
    const post = toFetch[i]!;

    if (onProgress) {
      onProgress(i + 1, toFetch.length);
    }

    log.progress('THREAD', i + 1, toFetch.length, post.id);

    try {
      const result = await fetchThread(post.permalink);

      if (result) {
        fetched.push(result);
      } else {
        skipped++;
      }
    } catch (error) {
      errors++;
      log.error('THREAD', `Failed to fetch ${post.id}: ${error}`);
    }
  }

  return { fetched, skipped, errors };
}

/**
 * Fetch threads from a list of URLs
 */
export async function fetchThreadsFromUrls(
  urls: string[],
  options: {
    onProgress?: (current: number, total: number) => void;
  } = {}
): Promise<{
  fetched: FetchThreadResult[];
  skipped: number;
  errors: number;
}> {
  const { onProgress } = options;

  const fetched: FetchThreadResult[] = [];
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < urls.length; i++) {
    const url = urls[i]!;

    if (onProgress) {
      onProgress(i + 1, urls.length);
    }

    log.progress('THREAD', i + 1, urls.length, url.slice(0, 50));

    // Extract permalink from URL
    const permalink = extractPermalink(url);
    if (!permalink) {
      log.warn('THREAD', `Invalid URL format: ${url}`);
      errors++;
      continue;
    }

    try {
      const result = await fetchThread(permalink);

      if (result) {
        fetched.push(result);
      } else {
        skipped++;
      }
    } catch (error) {
      errors++;
      log.error('THREAD', `Failed to fetch ${url}: ${error}`);
    }
  }

  return { fetched, skipped, errors };
}

/**
 * Extract permalink from a full Reddit URL
 */
function extractPermalink(url: string): string | null {
  // Handle full URLs
  const match = url.match(/reddit\.com(\/r\/[^/]+\/comments\/[^/]+(?:\/[^/]*)?)/);
  if (match?.[1]) {
    return match[1];
  }

  // Handle permalinks directly
  if (url.startsWith('/r/')) {
    return url;
  }

  return null;
}

export default {
  fetchThread,
  fetchThreadsFromPosts,
  fetchThreadsFromUrls,
};
