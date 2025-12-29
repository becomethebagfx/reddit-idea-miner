// LLM-based insight extraction

import OpenAI from 'openai';
import { getConfig } from '../config/loadConfig.js';
import { log } from '../utils/log.js';
import { uuid } from '../utils/text.js';
import { insertInsight, markThreadAnalyzed } from '../store/db.js';
import {
  InsightExtractionResponseSchema,
  INSIGHT_EXTRACTION_SYSTEM_PROMPT,
  buildInsightExtractionPrompt,
  type InsightExtractionResponse,
} from './llmSchemas.js';
import type { ThreadDocument, Insight } from '../store/models.js';

let openaiClient: OpenAI | null = null;

/**
 * Get or create OpenAI client
 */
function getOpenAI(): OpenAI {
  if (openaiClient) return openaiClient;

  const config = getConfig();

  openaiClient = new OpenAI({
    apiKey: config.env.LLM_API_KEY,
    baseURL: config.env.LLM_BASE_URL || undefined,
  });

  return openaiClient;
}

/**
 * Extract insights from a thread document using LLM
 */
export async function extractInsightsFromThread(doc: ThreadDocument): Promise<Insight | null> {
  const config = getConfig();
  const openai = getOpenAI();

  const model = config.run.analysis?.llmModel ?? config.env.LLM_MODEL;
  const maxTokens = config.run.analysis?.llmMaxTokens ?? config.env.LLM_MAX_TOKENS;

  // Build prompt
  const userPrompt = buildInsightExtractionPrompt(
    doc.title,
    doc.subreddit,
    doc.selftext,
    doc.comments
  );

  try {
    log.debug('LLM', `Extracting insights for thread ${doc.thread_id}`);

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: INSIGHT_EXTRACTION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.3, // Lower temperature for more consistent extraction
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      log.warn('LLM', `No response content for thread ${doc.thread_id}`);
      return null;
    }

    // Parse and validate response
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch (parseError) {
      log.error('LLM', `Failed to parse JSON response for ${doc.thread_id}: ${parseError}`);
      return null;
    }

    const validated = InsightExtractionResponseSchema.safeParse(parsed);
    if (!validated.success) {
      log.warn('LLM', `Invalid response schema for ${doc.thread_id}: ${validated.error.message}`);
      return null;
    }

    const data = validated.data;

    // Calculate confidence based on evidence count
    const totalEvidence = data.pain_points.reduce((sum, p) => sum + p.evidence_ids.length, 0);
    const confidence = Math.min(totalEvidence / 5, 1); // Max confidence at 5+ evidence IDs

    // Create insight record
    const insight: Insight = {
      id: uuid(),
      thread_id: doc.thread_id,
      pain_points: data.pain_points,
      who_has_problem: data.who_has_problem,
      current_workarounds: data.current_workarounds,
      desired_solution: data.desired_solution,
      willingness_to_pay: data.willingness_to_pay,
      job_to_be_done: data.job_to_be_done,
      confidence,
      model_used: model,
    };

    // Store insight
    insertInsight(insight);

    // Mark thread as analyzed
    markThreadAnalyzed(doc.thread_id);

    log.info('LLM', `Extracted ${data.pain_points.length} pain points from ${doc.thread_id} (confidence: ${confidence.toFixed(2)})`);

    return insight;
  } catch (error) {
    log.error('LLM', `Error extracting insights for ${doc.thread_id}: ${error}`);
    return null;
  }
}

/**
 * Batch extract insights from multiple threads
 */
export async function batchExtractInsights(
  docs: ThreadDocument[],
  options: {
    onProgress?: (current: number, total: number) => void;
    minPainScore?: number;
    minIntentScore?: number;
  } = {}
): Promise<{
  extracted: Insight[];
  skipped: number;
  errors: number;
}> {
  const { onProgress, minPainScore = 0, minIntentScore = 0 } = options;

  const extracted: Insight[] = [];
  let skipped = 0;
  let errors = 0;

  for (let i = 0; i < docs.length; i++) {
    const doc = docs[i]!;

    if (onProgress) {
      onProgress(i + 1, docs.length);
    }

    log.progress('LLM', i + 1, docs.length, doc.thread_id);

    // Check signal thresholds if signals exist
    if (doc.signals) {
      if (doc.signals.pain_score < minPainScore || doc.signals.intent_score < minIntentScore) {
        log.debug('LLM', `Skipping ${doc.thread_id}: below signal thresholds`);
        skipped++;
        continue;
      }
    }

    try {
      const insight = await extractInsightsFromThread(doc);
      if (insight) {
        extracted.push(insight);
      } else {
        skipped++;
      }
    } catch (error) {
      errors++;
      log.error('LLM', `Failed to extract from ${doc.thread_id}: ${error}`);
    }

    // Small delay between API calls to avoid rate limits
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  return { extracted, skipped, errors };
}

export default {
  extractInsightsFromThread,
  batchExtractInsights,
};
