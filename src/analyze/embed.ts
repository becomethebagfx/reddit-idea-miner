// Text embedding generation

import OpenAI from 'openai';
import { getConfig } from '../config/loadConfig.js';
import { log } from '../utils/log.js';

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
 * Generate embedding for text
 */
export async function generateEmbedding(text: string): Promise<number[]> {
  const openai = getOpenAI();

  // Truncate text to fit embedding model limits (8191 tokens for text-embedding-3-small)
  const truncatedText = text.slice(0, 8000);

  try {
    const response = await openai.embeddings.create({
      model: 'text-embedding-3-small',
      input: truncatedText,
    });

    return response.data[0]?.embedding ?? [];
  } catch (error) {
    log.error('EMBED', `Failed to generate embedding: ${error}`);
    throw error;
  }
}

/**
 * Generate embeddings for multiple texts
 */
export async function generateEmbeddings(texts: string[]): Promise<number[][]> {
  const openai = getOpenAI();

  // Truncate texts
  const truncatedTexts = texts.map((t) => t.slice(0, 8000));

  // Batch in groups of 100 (API limit)
  const batchSize = 100;
  const allEmbeddings: number[][] = [];

  for (let i = 0; i < truncatedTexts.length; i += batchSize) {
    const batch = truncatedTexts.slice(i, i + batchSize);

    try {
      const response = await openai.embeddings.create({
        model: 'text-embedding-3-small',
        input: batch,
      });

      for (const item of response.data) {
        allEmbeddings.push(item.embedding);
      }
    } catch (error) {
      log.error('EMBED', `Failed to generate batch embeddings: ${error}`);
      throw error;
    }

    // Small delay between batches
    if (i + batchSize < truncatedTexts.length) {
      await new Promise((resolve) => setTimeout(resolve, 200));
    }
  }

  return allEmbeddings;
}

/**
 * Calculate cosine similarity between two embeddings
 */
export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same length');
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i]! * b[i]!;
    normA += a[i]! * a[i]!;
    normB += b[i]! * b[i]!;
  }

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (Math.sqrt(normA) * Math.sqrt(normB));
}

/**
 * Calculate euclidean distance between two embeddings
 */
export function euclideanDistance(a: number[], b: number[]): number {
  if (a.length !== b.length) {
    throw new Error('Embeddings must have same length');
  }

  let sum = 0;
  for (let i = 0; i < a.length; i++) {
    const diff = a[i]! - b[i]!;
    sum += diff * diff;
  }

  return Math.sqrt(sum);
}

/**
 * Calculate centroid of embeddings
 */
export function calculateCentroid(embeddings: number[][]): number[] {
  if (embeddings.length === 0) return [];

  const dim = embeddings[0]!.length;
  const centroid = new Array(dim).fill(0);

  for (const embedding of embeddings) {
    for (let i = 0; i < dim; i++) {
      centroid[i] += embedding[i]!;
    }
  }

  for (let i = 0; i < dim; i++) {
    centroid[i] /= embeddings.length;
  }

  return centroid;
}

export default {
  generateEmbedding,
  generateEmbeddings,
  cosineSimilarity,
  euclideanDistance,
  calculateCentroid,
};
