// Heuristic signal extraction from thread content

import { getConfig } from '../config/loadConfig.js';
import { log } from '../utils/log.js';
import { normalizeText, findMatchingKeywords, extractMatchingPhrases, isQuestion } from '../utils/text.js';
import { upsertThreadSignals, getCommentsByPost } from '../store/db.js';
import type { ThreadDocument, ThreadSignals, Comment } from '../store/models.js';

// Pain language patterns
const PAIN_KEYWORDS = [
  // Frustration
  'frustrating', 'frustrated', 'annoying', 'annoyed', 'hate', 'hating',
  'nightmare', 'terrible', 'awful', 'horrible', 'worst', 'sucks',
  // Inefficiency
  'waste time', 'wasting time', 'time consuming', 'takes forever',
  'hours every', 'manual process', 'manually', 'tedious', 'repetitive',
  // Broken/stuck
  'broken', 'doesnt work', "doesn't work", 'stopped working', 'not working',
  'stuck', 'cant figure', "can't figure", 'impossible', 'unusable',
  // Pain verbs
  'struggling', 'suffering', 'dealing with', 'putting up with',
  'tired of', 'sick of', 'fed up', 'give up', 'giving up',
  // Workarounds
  'workaround', 'hack', 'duct tape', 'band-aid', 'kludge', 'jury-rig',
  'spreadsheet nightmare', 'excel hell', 'manual nightmare',
];

const PAIN_PHRASES = [
  /wast(?:ing|ed?) (\d+|several|many|hours|time)/gi,
  /takes? (forever|hours|too long)/gi,
  /every (week|day|month) I have to/gi,
  /manual(?:ly)? (?:enter|input|copy|paste|export|import)/gi,
  /(?:hate|frustrat(?:ing|ed)|annoy(?:ing|ed)) (?:that|when|how)/gi,
  /(?:broken|doesn't work|not working) (?:properly|correctly|anymore)/gi,
  /can't (?:figure out|get|make|find)/gi,
  /wish (?:there was|I could|it would)/gi,
  /(?:nightmare|pain|headache) (?:to|when|every)/gi,
];

// Buying intent patterns
const INTENT_KEYWORDS = [
  // Direct purchase intent
  'looking for', 'recommend', 'recommendation', 'recommendations', 'suggestions',
  'best tool', 'best software', 'best app', 'alternatives to', 'alternative to',
  'switch from', 'switching from', 'moving from', 'migrate from', 'migrating from',
  // Evaluation
  'anyone use', 'anyone using', 'anyone tried', 'has anyone tried',
  'experience with', 'thoughts on', 'opinions on', 'reviews of', 'compared to',
  // Budget signals
  'worth it', 'worth the price', 'worth paying', 'would pay', 'willing to pay',
  'i would pay', "i'd pay", 'budget for', 'pricing', 'price',
  'subscription', 'per month', 'per user', 'per seat', 'enterprise',
  // Solution seeking
  'how do you handle', 'how do you manage', 'what do you use',
  'tool for', 'software for', 'app for', 'solution for', 'service for',
  'automate', 'automation', 'streamline',
];

const INTENT_PHRASES = [
  /looking for (?:a |an )?(?:tool|software|app|solution|service|way)/gi,
  /recommend(?:ation)?s? for (?:a |an )?(?:tool|software|app)/gi,
  /(?:what|which) (?:tool|software|app|service) (?:do you|does everyone)/gi,
  /anyone (?:use|using|tried|know of)/gi,
  /(?:worth|willing to) pay(?:ing)? (?:\$\d+|for)/gi,
  /(?:i would|i'd|we would) pay (?:\$?\d+|for)/gi,
  /alternative(?:s)? to (?:\w+)/gi,
  /switch(?:ing|ed)? (?:from|to|between)/gi,
  /(?:best|good|better) (?:tool|software|app|option|choice)/gi,
  /how (?:do you|does your team) (?:handle|manage|deal with)/gi,
];

/**
 * Calculate pain score for text
 */
function calculatePainScore(text: string): {
  score: number;
  keywords: string[];
  phrases: string[];
} {
  const normalizedText = normalizeText(text);

  // Find matching keywords
  const keywords = findMatchingKeywords(normalizedText, PAIN_KEYWORDS);

  // Find matching phrases
  const phrases = extractMatchingPhrases(text, PAIN_PHRASES);

  // Calculate base score
  let score = 0;
  score += keywords.length * 0.5; // 0.5 per keyword
  score += phrases.length * 1.0;  // 1.0 per phrase match

  // Normalize to 0-10
  score = Math.min(score, 10);

  return { score, keywords, phrases };
}

/**
 * Calculate intent score for text
 */
function calculateIntentScore(text: string, title: string): {
  score: number;
  keywords: string[];
  phrases: string[];
} {
  const normalizedText = normalizeText(text);

  // Find matching keywords
  const keywords = findMatchingKeywords(normalizedText, INTENT_KEYWORDS);

  // Find matching phrases
  const phrases = extractMatchingPhrases(text, INTENT_PHRASES);

  // Calculate base score
  let score = 0;
  score += keywords.length * 0.5; // 0.5 per keyword
  score += phrases.length * 1.0;  // 1.0 per phrase match

  // Boost if title is a question
  if (isQuestion(title)) {
    score *= 1.2;
  }

  // Normalize to 0-10
  score = Math.min(score, 10);

  return { score, keywords, phrases };
}

/**
 * Calculate engagement multiplier based on comment count
 */
function getEngagementMultiplier(commentCount: number): number {
  if (commentCount < 5) return 0.5;
  if (commentCount < 20) return 1.0;
  if (commentCount < 50) return 1.2;
  return 1.5;
}

/**
 * Extract signals from a thread document
 */
export function extractSignals(doc: ThreadDocument): ThreadSignals {
  // Combine all text for analysis
  const allText = [
    doc.title,
    doc.selftext,
    ...doc.comments.map((c) => c.body),
  ].join('\n\n');

  // Calculate scores
  const pain = calculatePainScore(allText);
  const intent = calculateIntentScore(allText, doc.title);

  // Apply engagement multiplier
  const engagementMult = getEngagementMultiplier(doc.comment_count);
  const finalPainScore = Math.min(pain.score * engagementMult, 10);
  const finalIntentScore = Math.min(intent.score * engagementMult, 10);

  // Find top evidence comments
  const evidenceComments = doc.comments
    .filter((c) => {
      const text = normalizeText(c.body);
      return (
        findMatchingKeywords(text, PAIN_KEYWORDS).length > 0 ||
        findMatchingKeywords(text, INTENT_KEYWORDS).length > 0
      );
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((c) => c.id);

  const signals: ThreadSignals = {
    thread_id: doc.thread_id,
    pain_score: Math.round(finalPainScore * 10) / 10,
    intent_score: Math.round(finalIntentScore * 10) / 10,
    keywords_matched: [...new Set([...pain.keywords, ...intent.keywords])],
    pain_phrases: pain.phrases.slice(0, 10),
    intent_phrases: intent.phrases.slice(0, 10),
    top_evidence_ids: evidenceComments,
  };

  return signals;
}

/**
 * Extract and store signals for a thread
 */
export function processThreadSignals(doc: ThreadDocument): ThreadSignals {
  const signals = extractSignals(doc);
  upsertThreadSignals(signals);
  log.debug('SIGNALS', `Thread ${doc.thread_id}: pain=${signals.pain_score}, intent=${signals.intent_score}`);
  return signals;
}

/**
 * Calculate combined priority score for ranking
 */
export function calculatePriorityScore(signals: ThreadSignals, commentCount: number): number {
  const engagement = Math.min(Math.log10(commentCount + 1) / 3, 1) * 10; // 0-10 scale
  return (
    signals.pain_score * 0.4 +
    signals.intent_score * 0.4 +
    engagement * 0.2
  );
}

export default {
  extractSignals,
  processThreadSignals,
  calculatePriorityScore,
  PAIN_KEYWORDS,
  INTENT_KEYWORDS,
};
