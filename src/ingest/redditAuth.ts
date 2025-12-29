// Reddit OAuth authentication

import { getConfig } from '../config/loadConfig.js';
import { log } from '../utils/log.js';

interface TokenResponse {
  access_token: string;
  token_type: string;
  expires_in: number;
  scope: string;
}

let accessToken: string | null = null;
let tokenExpiry: number = 0;

/**
 * Get Reddit OAuth access token
 *
 * Requires REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET env vars
 * Create an app at https://www.reddit.com/prefs/apps
 */
export async function getAccessToken(): Promise<string> {
  // Check if we have a valid token
  if (accessToken && Date.now() < tokenExpiry) {
    return accessToken;
  }

  const clientId = process.env.REDDIT_CLIENT_ID;
  const clientSecret = process.env.REDDIT_CLIENT_SECRET;

  if (!clientId || !clientSecret) {
    throw new Error(
      'Reddit OAuth credentials not configured. ' +
      'Set REDDIT_CLIENT_ID and REDDIT_CLIENT_SECRET env vars. ' +
      'Create an app at https://www.reddit.com/prefs/apps (type: script)'
    );
  }

  const config = getConfig();
  const userAgent = config.env.USER_AGENT;

  log.info('AUTH', 'Requesting Reddit OAuth token...');

  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');

  const response = await fetch('https://www.reddit.com/api/v1/access_token', {
    method: 'POST',
    headers: {
      'Authorization': `Basic ${auth}`,
      'Content-Type': 'application/x-www-form-urlencoded',
      'User-Agent': userAgent,
    },
    body: 'grant_type=client_credentials',
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Reddit OAuth failed: ${response.status} ${text}`);
  }

  const data = await response.json() as TokenResponse;

  accessToken = data.access_token;
  // Set expiry 5 minutes before actual expiry to be safe
  tokenExpiry = Date.now() + (data.expires_in - 300) * 1000;

  log.info('AUTH', 'Reddit OAuth token obtained successfully');

  return accessToken;
}

/**
 * Check if OAuth is configured
 */
export function isOAuthConfigured(): boolean {
  return Boolean(process.env.REDDIT_CLIENT_ID && process.env.REDDIT_CLIENT_SECRET);
}

/**
 * Clear cached token (for re-auth)
 */
export function clearToken(): void {
  accessToken = null;
  tokenExpiry = 0;
}

export default {
  getAccessToken,
  isOAuthConfigured,
  clearToken,
};
