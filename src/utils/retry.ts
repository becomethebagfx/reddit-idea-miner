// Retry utility with exponential backoff

import { log } from './log.js';

export interface RetryOptions {
  maxRetries?: number;
  initialDelayMs?: number;
  maxDelayMs?: number;
  backoffMultiplier?: number;
  retryCondition?: (error: unknown) => boolean;
  onRetry?: (attempt: number, error: unknown, delayMs: number) => void;
}

const DEFAULT_OPTIONS: Required<RetryOptions> = {
  maxRetries: 3,
  initialDelayMs: 1000,
  maxDelayMs: 30000,
  backoffMultiplier: 2,
  retryCondition: () => true,
  onRetry: () => {},
};

export class RetryError extends Error {
  public readonly attempts: number;
  public readonly lastError: unknown;

  constructor(message: string, attempts: number, lastError: unknown) {
    super(message);
    this.name = 'RetryError';
    this.attempts = attempts;
    this.lastError = lastError;
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export async function retry<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  let lastError: unknown;
  let delayMs = opts.initialDelayMs;

  for (let attempt = 1; attempt <= opts.maxRetries + 1; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt > opts.maxRetries) {
        throw new RetryError(
          `Failed after ${attempt} attempts`,
          attempt,
          lastError
        );
      }

      if (!opts.retryCondition(error)) {
        throw error;
      }

      opts.onRetry(attempt, error, delayMs);
      log.warn('RETRY', `Attempt ${attempt} failed, retrying in ${delayMs}ms`);

      await sleep(delayMs);
      delayMs = Math.min(delayMs * opts.backoffMultiplier, opts.maxDelayMs);
    }
  }

  throw new RetryError(`Failed after ${opts.maxRetries + 1} attempts`, opts.maxRetries + 1, lastError);
}

// Helper to check if an error is retryable (transient)
export function isTransientError(error: unknown): boolean {
  if (error instanceof Error) {
    const message = error.message.toLowerCase();

    // Network errors
    if (message.includes('econnreset') ||
        message.includes('econnrefused') ||
        message.includes('etimedout') ||
        message.includes('socket hang up') ||
        message.includes('network')) {
      return true;
    }

    // HTTP status codes
    if ('statusCode' in error || 'status' in error) {
      const status = (error as { statusCode?: number; status?: number }).statusCode ??
                     (error as { status?: number }).status;
      if (status && (status === 429 || status >= 500)) {
        return true;
      }
    }
  }

  return false;
}

// Retry specifically for HTTP requests
export async function retryHttp<T>(
  fn: () => Promise<T>,
  options: RetryOptions = {}
): Promise<T> {
  return retry(fn, {
    ...options,
    retryCondition: (error) => {
      if (options.retryCondition && !options.retryCondition(error)) {
        return false;
      }
      return isTransientError(error);
    },
  });
}

export default retry;
