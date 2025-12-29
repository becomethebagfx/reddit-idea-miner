// Normalize thread data for analysis

import { getPost, getCommentsByPost, getThreadSignals } from '../store/db.js';
import type { ThreadDocument } from '../store/models.js';

/**
 * Build a ThreadDocument for analysis from stored data
 */
export function buildThreadDocument(threadId: string): ThreadDocument | null {
  const post = getPost(threadId);
  if (!post) return null;

  const comments = getCommentsByPost(threadId);
  const signals = getThreadSignals(threadId);

  // Get unique authors
  const authors = new Set<string>();
  authors.add(post.author);
  for (const comment of comments) {
    authors.add(comment.author);
  }

  // Build document
  const doc: ThreadDocument = {
    thread_id: threadId,
    subreddit: post.subreddit,
    title: post.title,
    selftext: post.selftext,
    created_utc: post.created_utc,
    score: post.score,
    url: `https://www.reddit.com${post.permalink}`,
    comments: comments
      .sort((a, b) => b.score - a.score) // Sort by score descending
      .slice(0, 50) // Limit to top 50 comments
      .map((c) => ({
        id: c.id,
        body: c.body,
        score: c.score,
        depth: c.depth,
        is_op: c.is_submitter,
      })),
    comment_count: comments.length,
    unique_authors: authors.size - (authors.has('[deleted]') ? 1 : 0),
    signals: signals ?? undefined,
  };

  return doc;
}

/**
 * Format a ThreadDocument as a string for LLM input
 */
export function formatThreadForLlm(doc: ThreadDocument): string {
  const lines: string[] = [];

  lines.push(`TITLE: ${doc.title}`);
  lines.push(`SUBREDDIT: r/${doc.subreddit}`);
  lines.push(`URL: ${doc.url}`);
  lines.push(`SCORE: ${doc.score} | COMMENTS: ${doc.comment_count}`);
  lines.push('');

  if (doc.selftext) {
    lines.push('POST BODY:');
    lines.push(doc.selftext.slice(0, 2000)); // Limit selftext
    lines.push('');
  }

  lines.push('COMMENTS (sorted by score):');
  lines.push('');

  for (const comment of doc.comments) {
    const indent = '  '.repeat(Math.min(comment.depth, 3));
    const opTag = comment.is_op ? ' [OP]' : '';
    const scoreTag = `[score: ${comment.score}]`;

    lines.push(`${indent}[${comment.id}]${opTag} ${scoreTag}`);

    // Truncate very long comments
    const body = comment.body.length > 500
      ? comment.body.slice(0, 500) + '...'
      : comment.body;

    // Indent comment body
    const indentedBody = body
      .split('\n')
      .map((line) => indent + '  ' + line)
      .join('\n');

    lines.push(indentedBody);
    lines.push('');
  }

  return lines.join('\n');
}

/**
 * Calculate combined text for embedding
 */
export function getEmbeddingText(doc: ThreadDocument): string {
  const parts: string[] = [];

  parts.push(doc.title);

  if (doc.selftext) {
    parts.push(doc.selftext.slice(0, 1000));
  }

  // Include top comments (by score)
  for (const comment of doc.comments.slice(0, 10)) {
    parts.push(comment.body.slice(0, 300));
  }

  return parts.join('\n\n').slice(0, 8000); // Limit total length
}

export default {
  buildThreadDocument,
  formatThreadForLlm,
  getEmbeddingText,
};
