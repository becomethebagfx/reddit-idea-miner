// HTTP client for Reddit API

import { getConfig } from '../config/loadConfig.js';
import { log } from '../utils/log.js';
import { retryHttp } from '../utils/retry.js';
import { logFetch, wasUrlFetched } from '../store/db.js';
import { uuid } from '../utils/text.js';
import { getAccessToken, isOAuthConfigured } from './redditAuth.js';
import crypto from 'crypto';

export interface HttpResponse<T = unknown> {
  status: number;
  data: T;
  headers: Record<string, string>;
}

export class HttpError extends Error {
  constructor(
    public readonly status: number,
    public readonly statusText: string,
    public readonly url: string
  ) {
    super(`HTTP ${status}: ${statusText} (${url})`);
    this.name = 'HttpError';
  }
}

export class CacheHitError extends Error {
  constructor(public readonly url: string) {
    super(`URL already fetched within cache window: ${url}`);
    this.name = 'CacheHitError';
  }
}

/**
 * Fetch JSON from a URL with rate limiting and retry logic
 */
export async function fetchJson<T>(
  url: string,
  options: {
    skipCache?: boolean;
    cacheMaxAgeHours?: number;
  } = {}
): Promise<HttpResponse<T>> {
  const config = getConfig();

  // Check cache unless skipCache is true
  if (!options.skipCache && wasUrlFetched(url, options.cacheMaxAgeHours ?? 24)) {
    log.debug('HTTP', `Cache hit: ${url}`);
    throw new CacheHitError(url);
  }

  log.debug('HTTP', `Fetching: ${url}`);

  // Use OAuth if configured
  let fetchUrl = url;
  const headers: Record<string, string> = {
    'User-Agent': config.env.USER_AGENT,
    'Accept': 'application/json',
  };

  if (isOAuthConfigured()) {
    const token = await getAccessToken();
    headers['Authorization'] = `Bearer ${token}`;
    // Use oauth.reddit.com for authenticated requests
    fetchUrl = url.replace('old.reddit.com', 'oauth.reddit.com')
                  .replace('www.reddit.com', 'oauth.reddit.com');
  }

  const response = await retryHttp(async () => {
    const res = await fetch(fetchUrl, { headers });

    if (!res.ok) {
      const error = new HttpError(res.status, res.statusText, fetchUrl);

      // Log the fetch attempt
      logFetch({
        id: uuid(),
        url: fetchUrl,
        status_code: res.status,
        fetched_at: new Date().toISOString(),
        error: error.message,
      });

      throw error;
    }

    return res;
  });

  const data = await response.json() as T;

  // Compute hash of response for change detection
  const responseHash = crypto
    .createHash('md5')
    .update(JSON.stringify(data))
    .digest('hex');

  // Log successful fetch
  logFetch({
    id: uuid(),
    url,
    status_code: response.status,
    fetched_at: new Date().toISOString(),
    response_hash: responseHash,
  });

  // Extract response headers
  const responseHeaders: Record<string, string> = {};
  response.headers.forEach((value, key) => {
    responseHeaders[key] = value;
  });

  return {
    status: response.status,
    data,
    headers: responseHeaders,
  };
}

/**
 * Build Reddit listing URL
 */
export function buildListingUrl(
  subreddit: string,
  sort: 'new' | 'top' | 'hot' | 'rising' = 'new',
  options: {
    limit?: number;
    after?: string;
    t?: 'hour' | 'day' | 'week' | 'month' | 'year' | 'all';
  } = {}
): string {
  const params = new URLSearchParams();
  params.set('limit', String(options.limit ?? 100));

  if (options.after) {
    params.set('after', options.after);
  }

  if (sort === 'top' && options.t) {
    params.set('t', options.t);
  }

  return `https://old.reddit.com/r/${subreddit}/${sort}.json?${params.toString()}`;
}

/**
 * Build Reddit thread URL
 */
export function buildThreadUrl(permalink: string): string {
  // Ensure permalink starts with /
  const normalizedPermalink = permalink.startsWith('/') ? permalink : `/${permalink}`;

  // Remove trailing slash
  const cleanPermalink = normalizedPermalink.replace(/\/$/, '');

  return `https://old.reddit.com${cleanPermalink}.json`;
}

export default {
  fetchJson,
  buildListingUrl,
  buildThreadUrl,
  HttpError,
  CacheHitError,
};
