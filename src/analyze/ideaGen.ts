// SaaS idea generation from clusters

import OpenAI from 'openai';
import { getConfig } from '../config/loadConfig.js';
import { log } from '../utils/log.js';
import { uuid, slugify, truncate } from '../utils/text.js';
import {
  getClusters,
  getAllInsights,
  getPost,
  getCommentsByPost,
  insertIdea,
  getThreadSignals,
} from '../store/db.js';
import {
  IdeaGenerationResponseSchema,
  IDEA_GENERATION_SYSTEM_PROMPT,
  buildIdeaGenerationPrompt,
} from './llmSchemas.js';
import type { Cluster, Idea, Insight, IdeaScores, EvidenceSnippet } from '../store/models.js';

let openaiClient: OpenAI | null = null;

function getOpenAI(): OpenAI {
  if (openaiClient) return openaiClient;

  const config = getConfig();
  openaiClient = new OpenAI({
    apiKey: config.env.LLM_API_KEY,
    baseURL: config.env.LLM_BASE_URL || undefined,
  });

  return openaiClient;
}

interface ClusterWithInsights {
  cluster: Cluster;
  insights: Insight[];
  score: number;
}

/**
 * Score a cluster for SaaS potential
 */
function scoreCluster(cluster: Cluster, insights: Insight[]): number {
  const frequencyScore = Math.min(Math.log10(cluster.thread_count + 1) / Math.log10(100), 1) * 10;
  const painScore = cluster.avg_pain_score;
  const intentScore = cluster.avg_intent_score;
  const crossSubScore = Math.min(cluster.subreddit_count / 10, 1) * 10;

  // Buildability heuristic (higher if solutions are more specific)
  const avgSolutionLength = insights.reduce((sum, i) => sum + i.desired_solution.length, 0) / insights.length;
  const buildabilityScore = Math.min(avgSolutionLength / 100, 1) * 10;

  return (
    frequencyScore * 0.25 +
    painScore * 0.25 +
    intentScore * 0.25 +
    crossSubScore * 0.15 +
    buildabilityScore * 0.10
  );
}

/**
 * Get top clusters ranked by score
 */
function rankClusters(count = 20): ClusterWithInsights[] {
  const clusters = getClusters();
  const allInsights = getAllInsights();

  // Map insights by ID
  const insightMap = new Map(allInsights.map((i) => [i.id, i]));

  const clustersWithInsights: ClusterWithInsights[] = clusters.map((cluster) => {
    const insights = cluster.insight_ids
      .map((id) => insightMap.get(id))
      .filter((i): i is Insight => i !== undefined);

    return {
      cluster,
      insights,
      score: scoreCluster(cluster, insights),
    };
  });

  // Sort by score descending
  clustersWithInsights.sort((a, b) => b.score - a.score);

  return clustersWithInsights.slice(0, count);
}

/**
 * Collect evidence for an idea
 */
function collectEvidence(insights: Insight[], maxUrls = 5, maxSnippets = 8): {
  urls: string[];
  snippets: EvidenceSnippet[];
} {
  const urls: string[] = [];
  const snippets: EvidenceSnippet[] = [];
  const seenThreads = new Set<string>();

  for (const insight of insights) {
    if (urls.length >= maxUrls) break;

    const post = getPost(insight.thread_id);
    if (!post || seenThreads.has(insight.thread_id)) continue;

    seenThreads.add(insight.thread_id);
    urls.push(`https://www.reddit.com${post.permalink}`);

    // Get evidence snippets from comments
    if (snippets.length < maxSnippets) {
      const comments = getCommentsByPost(insight.thread_id);
      const evidenceIds = insight.pain_points.flatMap((p) => p.evidence_ids);

      for (const evidenceId of evidenceIds) {
        if (snippets.length >= maxSnippets) break;

        const comment = comments.find((c) => c.id === evidenceId);
        if (comment) {
          snippets.push({
            comment_id: comment.id,
            text: truncate(comment.body, 400),
            thread_url: `https://www.reddit.com${post.permalink}`,
          });
        }
      }
    }
  }

  return { urls, snippets };
}

/**
 * Generate a SaaS idea for a cluster using LLM
 */
async function generateIdeaForCluster(
  clusterData: ClusterWithInsights,
  rank: number
): Promise<Idea | null> {
  const config = getConfig();
  const openai = getOpenAI();
  const model = config.run.analysis?.llmModel ?? config.env.LLM_MODEL;
  const maxTokens = config.run.analysis?.llmMaxTokens ?? config.env.LLM_MAX_TOKENS;

  const { cluster, insights, score } = clusterData;

  // Aggregate data for prompt
  const painPoints = insights
    .flatMap((i) => i.pain_points.map((p) => p.text))
    .slice(0, 15);
  const personas = [...new Set(insights.map((i) => i.who_has_problem))].slice(0, 10);
  const workarounds = [...new Set(insights.flatMap((i) => i.current_workarounds))].slice(0, 10);
  const solutions = [...new Set(insights.map((i) => i.desired_solution))].slice(0, 10);

  const userPrompt = buildIdeaGenerationPrompt(
    cluster.name,
    painPoints,
    personas,
    workarounds,
    solutions
  );

  try {
    log.debug('IDEAGEN', `Generating idea for cluster "${cluster.name}"`);

    const response = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: IDEA_GENERATION_SYSTEM_PROMPT },
        { role: 'user', content: userPrompt },
      ],
      max_tokens: maxTokens,
      temperature: 0.5,
      response_format: { type: 'json_object' },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      log.warn('IDEAGEN', `No response content for cluster "${cluster.name}"`);
      return null;
    }

    // Parse and validate
    let parsed: unknown;
    try {
      parsed = JSON.parse(content);
    } catch {
      log.error('IDEAGEN', `Failed to parse JSON for cluster "${cluster.name}"`);
      return null;
    }

    const validated = IdeaGenerationResponseSchema.safeParse(parsed);
    if (!validated.success) {
      log.warn('IDEAGEN', `Invalid response for cluster "${cluster.name}": ${validated.error.message}`);
      return null;
    }

    const data = validated.data;

    // Collect evidence
    const evidence = collectEvidence(insights);

    // Calculate scores
    const scores: IdeaScores = {
      pain: cluster.avg_pain_score,
      intent: cluster.avg_intent_score,
      frequency: Math.min(Math.log10(cluster.thread_count + 1) / Math.log10(100), 1) * 10,
      buildability: 7, // Default estimate
      total: score,
    };

    const idea: Idea = {
      id: uuid(),
      cluster_id: cluster.id,
      rank,
      name: data.name,
      one_liner: data.one_liner,
      target_persona: data.target_persona,
      mvp_workflow: data.mvp_workflow,
      mvp_features: data.mvp_features,
      pricing_hypothesis: data.pricing_hypothesis,
      why_it_wins: data.why_it_wins,
      evidence_urls: evidence.urls,
      evidence_snippets: evidence.snippets,
      scores,
    };

    // Store idea
    insertIdea(idea);

    log.info('IDEAGEN', `Generated idea #${rank}: ${data.name}`);

    return idea;
  } catch (error) {
    log.error('IDEAGEN', `Error generating idea for cluster "${cluster.name}": ${error}`);
    return null;
  }
}

/**
 * Generate top N SaaS ideas from clusters
 */
export async function generateTopIdeas(count = 20): Promise<Idea[]> {
  const config = getConfig();
  const topCount = config.run.reporting?.topIdeasCount ?? count;

  // Get ranked clusters
  const rankedClusters = rankClusters(topCount);

  if (rankedClusters.length === 0) {
    log.warn('IDEAGEN', 'No clusters available for idea generation');
    return [];
  }

  log.info('IDEAGEN', `Generating ${topCount} ideas from top clusters`);

  const ideas: Idea[] = [];

  for (let i = 0; i < rankedClusters.length; i++) {
    const clusterData = rankedClusters[i]!;

    log.progress('IDEAGEN', i + 1, rankedClusters.length, clusterData.cluster.name);

    const idea = await generateIdeaForCluster(clusterData, i + 1);
    if (idea) {
      ideas.push(idea);
    }

    // Delay between API calls
    await new Promise((resolve) => setTimeout(resolve, 500));
  }

  log.info('IDEAGEN', `Generated ${ideas.length} ideas`);

  return ideas;
}

export default {
  generateTopIdeas,
  rankClusters,
  scoreCluster,
};
