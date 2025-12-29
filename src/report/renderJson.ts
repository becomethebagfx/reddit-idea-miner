// Render ideas to JSON format

import { writeFileSync } from 'fs';
import { join } from 'path';
import { getConfig } from '../config/loadConfig.js';
import { log } from '../utils/log.js';
import { getIdeas, getStats, getAllInsights, getClusters } from '../store/db.js';

interface TopIdeasJson {
  generated_at: string;
  model_used: string;
  stats: {
    subreddits: number;
    posts: number;
    comments: number;
    threads_analyzed: number;
    insights: number;
    clusters: number;
  };
  ideas: Array<{
    rank: number;
    name: string;
    one_liner: string;
    target_persona: string | null;
    mvp_workflow: string[];
    mvp_features: string[];
    pricing_hypothesis: string | null;
    why_it_wins: string | null;
    evidence_urls: string[];
    evidence_snippets: Array<{
      comment_id: string;
      text: string;
      thread_url: string;
    }>;
    scores: {
      pain: number;
      intent: number;
      frequency: number;
      buildability: number;
      total: number;
    };
  }>;
}

/**
 * Render TOP_20_IDEAS.json
 */
export function renderTopIdeasJson(): TopIdeasJson {
  const config = getConfig();
  const ideas = getIdeas();
  const stats = getStats();

  return {
    generated_at: new Date().toISOString(),
    model_used: config.run.analysis?.llmModel ?? config.env.LLM_MODEL,
    stats: {
      subreddits: stats.subreddits,
      posts: stats.posts,
      comments: stats.comments,
      threads_analyzed: stats.threadsAnalyzed,
      insights: stats.insights,
      clusters: stats.clusters,
    },
    ideas: ideas.map((idea) => ({
      rank: idea.rank,
      name: idea.name,
      one_liner: idea.one_liner,
      target_persona: idea.target_persona ?? null,
      mvp_workflow: idea.mvp_workflow,
      mvp_features: idea.mvp_features,
      pricing_hypothesis: idea.pricing_hypothesis ?? null,
      why_it_wins: idea.why_it_wins ?? null,
      evidence_urls: idea.evidence_urls,
      evidence_snippets: idea.evidence_snippets,
      scores: idea.scores,
    })),
  };
}

/**
 * Write JSON report
 */
export function writeJsonReport(): void {
  const config = getConfig();
  const json = renderTopIdeasJson();
  const path = join(config.paths.deliverables, 'TOP_20_IDEAS.json');

  writeFileSync(path, JSON.stringify(json, null, 2));
  log.info('REPORT', `Wrote ${path}`);
}

/**
 * Export all data as JSONL for further analysis
 */
export function exportJsonl(outputPath: string): void {
  const insights = getAllInsights();
  const clusters = getClusters();
  const ideas = getIdeas();

  const lines: string[] = [];

  // Export insights
  for (const insight of insights) {
    lines.push(JSON.stringify({ type: 'insight', data: insight }));
  }

  // Export clusters
  for (const cluster of clusters) {
    lines.push(JSON.stringify({
      type: 'cluster',
      data: {
        ...cluster,
        centroid_embedding: undefined, // Don't export embeddings
      },
    }));
  }

  // Export ideas
  for (const idea of ideas) {
    lines.push(JSON.stringify({ type: 'idea', data: idea }));
  }

  writeFileSync(outputPath, lines.join('\n'));
  log.info('EXPORT', `Exported ${lines.length} records to ${outputPath}`);
}

export default {
  renderTopIdeasJson,
  writeJsonReport,
  exportJsonl,
};
