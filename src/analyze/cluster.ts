// Clustering insights into themes

import { log } from '../utils/log.js';
import { uuid } from '../utils/text.js';
import { getConfig } from '../config/loadConfig.js';
import { generateEmbeddings, calculateCentroid, euclideanDistance } from './embed.js';
import { getAllInsights, getThreadSignals, insertCluster, getPost } from '../store/db.js';
import type { Insight, Cluster } from '../store/models.js';

interface InsightWithEmbedding {
  insight: Insight;
  embedding: number[];
  threadSignals?: {
    pain_score: number;
    intent_score: number;
  };
}

interface ClusterResult {
  id: string;
  name: string;
  description: string;
  members: InsightWithEmbedding[];
  centroid: number[];
  avgPainScore: number;
  avgIntentScore: number;
  uniqueSubreddits: Set<string>;
}

/**
 * K-means clustering implementation
 */
function kMeans(
  points: number[][],
  k: number,
  maxIterations = 100
): { assignments: number[]; centroids: number[][] } {
  if (points.length < k) {
    // If fewer points than clusters, assign each point to its own cluster
    return {
      assignments: points.map((_, i) => i),
      centroids: points,
    };
  }

  // Initialize centroids using k-means++ initialization
  const centroids: number[][] = [];
  const dim = points[0]!.length;

  // First centroid: random point
  centroids.push([...points[Math.floor(Math.random() * points.length)]!]);

  // Remaining centroids: weighted by distance to nearest centroid
  while (centroids.length < k) {
    const distances = points.map((point) => {
      const minDist = Math.min(
        ...centroids.map((c) => euclideanDistance(point, c))
      );
      return minDist * minDist; // Square for probability weighting
    });

    const totalDist = distances.reduce((a, b) => a + b, 0);
    let random = Math.random() * totalDist;

    for (let i = 0; i < points.length; i++) {
      random -= distances[i]!;
      if (random <= 0) {
        centroids.push([...points[i]!]);
        break;
      }
    }
  }

  let assignments = new Array(points.length).fill(0);
  let changed = true;
  let iterations = 0;

  while (changed && iterations < maxIterations) {
    changed = false;
    iterations++;

    // Assign points to nearest centroid
    for (let i = 0; i < points.length; i++) {
      let minDist = Infinity;
      let minCluster = 0;

      for (let j = 0; j < k; j++) {
        const dist = euclideanDistance(points[i]!, centroids[j]!);
        if (dist < minDist) {
          minDist = dist;
          minCluster = j;
        }
      }

      if (assignments[i] !== minCluster) {
        assignments[i] = minCluster;
        changed = true;
      }
    }

    // Update centroids
    for (let j = 0; j < k; j++) {
      const clusterPoints = points.filter((_, i) => assignments[i] === j);
      if (clusterPoints.length > 0) {
        centroids[j] = calculateCentroid(clusterPoints);
      }
    }
  }

  log.debug('CLUSTER', `K-means converged in ${iterations} iterations`);

  return { assignments, centroids };
}

/**
 * Calculate within-cluster sum of squares (WCSS) for elbow method
 */
function calculateWCSS(points: number[][], assignments: number[], centroids: number[][]): number {
  let wcss = 0;
  for (let i = 0; i < points.length; i++) {
    const centroid = centroids[assignments[i]!]!;
    const dist = euclideanDistance(points[i]!, centroid);
    wcss += dist * dist;
  }
  return wcss;
}

/**
 * Find optimal k using elbow method
 */
function findOptimalK(points: number[][], minK: number, maxK: number): number {
  const wcssValues: number[] = [];

  for (let k = minK; k <= maxK; k++) {
    const { assignments, centroids } = kMeans(points, k);
    const wcss = calculateWCSS(points, assignments, centroids);
    wcssValues.push(wcss);
    log.debug('CLUSTER', `k=${k}, WCSS=${wcss.toFixed(2)}`);
  }

  // Find elbow point using rate of change
  let maxDelta = 0;
  let elbowK = minK;

  for (let i = 1; i < wcssValues.length - 1; i++) {
    const delta = (wcssValues[i - 1]! - wcssValues[i]!) - (wcssValues[i]! - wcssValues[i + 1]!);
    if (delta > maxDelta) {
      maxDelta = delta;
      elbowK = minK + i;
    }
  }

  log.info('CLUSTER', `Optimal k found: ${elbowK}`);
  return elbowK;
}

/**
 * Extract common terms from pain points for cluster naming
 */
function extractClusterName(insights: Insight[]): string {
  const wordCounts = new Map<string, number>();

  for (const insight of insights) {
    for (const painPoint of insight.pain_points) {
      const words = painPoint.text
        .toLowerCase()
        .split(/\W+/)
        .filter((w) => w.length > 4);

      for (const word of words) {
        wordCounts.set(word, (wordCounts.get(word) || 0) + 1);
      }
    }
  }

  // Get top 3 words
  const topWords = [...wordCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, 3)
    .map(([word]) => word);

  if (topWords.length === 0) {
    return 'Miscellaneous';
  }

  return topWords.join(' + ');
}

/**
 * Generate cluster description from insights
 */
function generateClusterDescription(insights: Insight[]): string {
  // Collect unique personas
  const personas = [...new Set(insights.map((i) => i.who_has_problem))].slice(0, 3);

  // Collect top pain points
  const painPoints = insights
    .flatMap((i) => i.pain_points)
    .sort((a, b) => (b.severity === 'high' ? 1 : 0) - (a.severity === 'high' ? 1 : 0))
    .slice(0, 3)
    .map((p) => p.text);

  return `Personas: ${personas.join(', ')}\nTop pain points: ${painPoints.join('; ')}`;
}

/**
 * Cluster insights into themes
 */
export async function clusterInsights(): Promise<Cluster[]> {
  const config = getConfig();
  const minClusters = config.run.clustering?.minClusters ?? 15;
  const maxClusters = config.run.clustering?.maxClusters ?? 40;
  const minClusterSize = config.run.clustering?.minClusterSize ?? 3;

  // Get all insights
  const insights = getAllInsights();
  if (insights.length < minClusters) {
    log.warn('CLUSTER', `Only ${insights.length} insights, need at least ${minClusters}`);
    return [];
  }

  log.info('CLUSTER', `Clustering ${insights.length} insights`);

  // Build text for embedding
  const textsToEmbed = insights.map((insight) => {
    const painPointText = insight.pain_points.map((p) => p.text).join(' ');
    return `${painPointText} ${insight.desired_solution}`;
  });

  // Generate embeddings
  log.info('CLUSTER', 'Generating embeddings...');
  const embeddings = await generateEmbeddings(textsToEmbed);

  // Enrich insights with embeddings and signals
  const enrichedInsights: InsightWithEmbedding[] = insights.map((insight, i) => {
    const signals = getThreadSignals(insight.thread_id);
    return {
      insight,
      embedding: embeddings[i]!,
      threadSignals: signals ? {
        pain_score: signals.pain_score,
        intent_score: signals.intent_score,
      } : undefined,
    };
  });

  // Find optimal k
  log.info('CLUSTER', 'Finding optimal cluster count...');
  const optimalK = Math.min(findOptimalK(embeddings, minClusters, maxClusters), Math.floor(insights.length / minClusterSize));

  // Run final clustering
  log.info('CLUSTER', `Clustering into ${optimalK} clusters...`);
  const { assignments, centroids } = kMeans(embeddings, optimalK);

  // Build cluster results
  const clusterMap = new Map<number, ClusterResult>();

  for (let i = 0; i < enrichedInsights.length; i++) {
    const clusterIdx = assignments[i]!;
    const enriched = enrichedInsights[i]!;

    if (!clusterMap.has(clusterIdx)) {
      clusterMap.set(clusterIdx, {
        id: uuid(),
        name: '',
        description: '',
        members: [],
        centroid: centroids[clusterIdx]!,
        avgPainScore: 0,
        avgIntentScore: 0,
        uniqueSubreddits: new Set(),
      });
    }

    const cluster = clusterMap.get(clusterIdx)!;
    cluster.members.push(enriched);

    // Get subreddit from post
    const post = getPost(enriched.insight.thread_id);
    if (post) {
      cluster.uniqueSubreddits.add(post.subreddit);
    }
  }

  // Calculate cluster stats and generate names
  const clusters: Cluster[] = [];

  for (const [, result] of clusterMap) {
    // Skip small clusters
    if (result.members.length < minClusterSize) {
      log.debug('CLUSTER', `Skipping cluster with ${result.members.length} members`);
      continue;
    }

    // Calculate averages
    const painScores = result.members
      .filter((m) => m.threadSignals)
      .map((m) => m.threadSignals!.pain_score);
    const intentScores = result.members
      .filter((m) => m.threadSignals)
      .map((m) => m.threadSignals!.intent_score);

    result.avgPainScore = painScores.length > 0
      ? painScores.reduce((a, b) => a + b, 0) / painScores.length
      : 0;
    result.avgIntentScore = intentScores.length > 0
      ? intentScores.reduce((a, b) => a + b, 0) / intentScores.length
      : 0;

    // Generate name and description
    result.name = extractClusterName(result.members.map((m) => m.insight));
    result.description = generateClusterDescription(result.members.map((m) => m.insight));

    // Create cluster record
    const cluster: Cluster = {
      id: result.id,
      name: result.name,
      description: result.description,
      centroid_embedding: Buffer.from(new Float32Array(result.centroid).buffer),
      insight_ids: result.members.map((m) => m.insight.id),
      thread_count: result.members.length,
      subreddit_count: result.uniqueSubreddits.size,
      avg_pain_score: Math.round(result.avgPainScore * 10) / 10,
      avg_intent_score: Math.round(result.avgIntentScore * 10) / 10,
    };

    // Store in database
    insertCluster(cluster);
    clusters.push(cluster);

    log.info('CLUSTER', `Created cluster "${result.name}" with ${result.members.length} insights`);
  }

  log.info('CLUSTER', `Created ${clusters.length} clusters`);

  return clusters;
}

export default {
  clusterInsights,
  kMeans,
  findOptimalK,
};
