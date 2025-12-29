// Text processing utilities

import crypto from 'crypto';

/**
 * Normalize text by lowercasing and removing extra whitespace
 */
export function normalizeText(text: string): string {
  return text.toLowerCase().replace(/\s+/g, ' ').trim();
}

/**
 * Extract keywords from text (simple word tokenization)
 */
export function extractWords(text: string): string[] {
  return normalizeText(text)
    .replace(/[^\w\s'-]/g, ' ')
    .split(/\s+/)
    .filter((w) => w.length > 2);
}

/**
 * Count keyword matches in text
 */
export function countKeywordMatches(text: string, keywords: string[]): number {
  const normalizedText = normalizeText(text);
  let count = 0;
  for (const keyword of keywords) {
    const normalizedKeyword = normalizeText(keyword);
    // Count occurrences (simple indexOf loop)
    let idx = 0;
    while ((idx = normalizedText.indexOf(normalizedKeyword, idx)) !== -1) {
      count++;
      idx += normalizedKeyword.length;
    }
  }
  return count;
}

/**
 * Find all matching keywords in text
 */
export function findMatchingKeywords(text: string, keywords: string[]): string[] {
  const normalizedText = normalizeText(text);
  return keywords.filter((k) => normalizedText.includes(normalizeText(k)));
}

/**
 * Extract phrases that match patterns (returns matched phrases)
 */
export function extractMatchingPhrases(text: string, patterns: RegExp[]): string[] {
  const matches: string[] = [];
  for (const pattern of patterns) {
    const globalPattern = new RegExp(pattern.source, 'gi');
    let match;
    while ((match = globalPattern.exec(text)) !== null) {
      matches.push(match[0].trim());
    }
  }
  return [...new Set(matches)];
}

/**
 * Truncate text to max length, preserving words
 */
export function truncate(text: string, maxLength: number, suffix = '...'): string {
  if (text.length <= maxLength) return text;
  const truncated = text.slice(0, maxLength - suffix.length);
  const lastSpace = truncated.lastIndexOf(' ');
  if (lastSpace > maxLength * 0.7) {
    return truncated.slice(0, lastSpace) + suffix;
  }
  return truncated + suffix;
}

/**
 * Create a URL-friendly slug from text
 */
export function slugify(text: string): string {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .replace(/\s+/g, '-')
    .replace(/-+/g, '-')
    .slice(0, 50)
    .replace(/^-|-$/g, '');
}

/**
 * Hash a string (for author anonymization if needed)
 */
export function hashString(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex').slice(0, 16);
}

/**
 * Clean Reddit markdown (basic)
 */
export function cleanRedditMarkdown(text: string): string {
  return text
    .replace(/&amp;/g, '&')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&quot;/g, '"')
    .replace(/&#x27;/g, "'")
    .replace(/\[deleted\]/g, '')
    .replace(/\[removed\]/g, '')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/**
 * Check if text is a question (simple heuristic)
 */
export function isQuestion(text: string): boolean {
  const normalizedText = normalizeText(text);
  return (
    normalizedText.includes('?') ||
    normalizedText.startsWith('how ') ||
    normalizedText.startsWith('what ') ||
    normalizedText.startsWith('why ') ||
    normalizedText.startsWith('when ') ||
    normalizedText.startsWith('where ') ||
    normalizedText.startsWith('which ') ||
    normalizedText.startsWith('who ') ||
    normalizedText.startsWith('is there ') ||
    normalizedText.startsWith('does anyone ') ||
    normalizedText.startsWith('has anyone ') ||
    normalizedText.startsWith('can anyone ') ||
    normalizedText.startsWith('anyone ')
  );
}

/**
 * Extract a short excerpt around a keyword match
 */
export function extractExcerpt(
  text: string,
  keyword: string,
  contextLength = 100
): string | null {
  const normalizedText = normalizeText(text);
  const normalizedKeyword = normalizeText(keyword);
  const idx = normalizedText.indexOf(normalizedKeyword);

  if (idx === -1) return null;

  const start = Math.max(0, idx - contextLength);
  const end = Math.min(text.length, idx + keyword.length + contextLength);

  let excerpt = text.slice(start, end).trim();
  if (start > 0) excerpt = '...' + excerpt;
  if (end < text.length) excerpt = excerpt + '...';

  return excerpt;
}

/**
 * Generate UUID v4
 */
export function uuid(): string {
  return crypto.randomUUID();
}

/**
 * Parse Reddit permalink to extract post ID
 */
export function extractPostIdFromPermalink(permalink: string): string | null {
  // /r/subreddit/comments/postid/title/
  const match = permalink.match(/\/comments\/([a-z0-9]+)\//i);
  return match?.[1] ?? null;
}

/**
 * Build Reddit JSON URL from permalink
 */
export function permalinkToJsonUrl(permalink: string): string {
  // Ensure starts with https://www.reddit.com
  let url = permalink;
  if (url.startsWith('/r/')) {
    url = `https://www.reddit.com${url}`;
  }
  // Remove trailing slash if present
  url = url.replace(/\/$/, '');
  // Add .json
  return `${url}.json`;
}
