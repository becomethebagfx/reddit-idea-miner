// Request scheduler with rate limiting

import PQueue from 'p-queue';
import { getConfig } from '../config/loadConfig.js';
import { log } from '../utils/log.js';

let queue: PQueue | null = null;

/**
 * Get or create the request queue
 */
export function getQueue(): PQueue {
  if (queue) return queue;

  const config = getConfig();
  const delayMs = config.run.requestDelayMs ?? config.env.REQUEST_DELAY_MS;

  queue = new PQueue({
    concurrency: 1,
    interval: delayMs,
    intervalCap: 1,
  });

  queue.on('active', () => {
    log.debug('QUEUE', `Active: ${queue!.pending} pending, ${queue!.size} queued`);
  });

  return queue;
}

/**
 * Add a task to the queue
 */
export async function enqueue<T>(
  task: () => Promise<T>,
  priority = 0
): Promise<T> {
  const q = getQueue();
  return q.add(task, { priority }) as Promise<T>;
}

/**
 * Wait for all queued tasks to complete
 */
export async function drain(): Promise<void> {
  const q = getQueue();
  await q.onIdle();
}

/**
 * Get queue stats
 */
export function getQueueStats(): {
  pending: number;
  size: number;
  isPaused: boolean;
} {
  const q = getQueue();
  return {
    pending: q.pending,
    size: q.size,
    isPaused: q.isPaused,
  };
}

/**
 * Pause the queue
 */
export function pauseQueue(): void {
  const q = getQueue();
  q.pause();
  log.info('QUEUE', 'Queue paused');
}

/**
 * Resume the queue
 */
export function resumeQueue(): void {
  const q = getQueue();
  q.start();
  log.info('QUEUE', 'Queue resumed');
}

/**
 * Clear the queue
 */
export function clearQueue(): void {
  const q = getQueue();
  q.clear();
  log.info('QUEUE', 'Queue cleared');
}

/**
 * Sleep utility
 */
export function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export default {
  getQueue,
  enqueue,
  drain,
  getQueueStats,
  pauseQueue,
  resumeQueue,
  clearQueue,
  sleep,
};
