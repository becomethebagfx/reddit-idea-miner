// Zod schemas and TypeScript types for data models

import { z } from 'zod';

// ==================== CORE REDDIT TYPES ====================

export const SubredditSchema = z.object({
  id: z.string(),
  display_name: z.string(),
  category: z.string(),
  intent_score: z.number().min(0).max(10).default(0),
  subscriber_count: z.number().nullable().optional(),
  description: z.string().nullable().optional(),
  typical_pain_points: z.array(z.string()).default([]),
  keywords_to_watch: z.array(z.string()).default([]),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type Subreddit = z.infer<typeof SubredditSchema>;

export const PostSchema = z.object({
  id: z.string(),
  subreddit: z.string(),
  title: z.string(),
  selftext: z.string().default(''),
  author: z.string().default('[deleted]'),
  score: z.number().default(0),
  upvote_ratio: z.number().min(0).max(1).nullable().optional(),
  num_comments: z.number().default(0),
  created_utc: z.number(),
  permalink: z.string(),
  url: z.string().nullable().optional(),
  is_self: z.boolean().default(true),
  link_flair_text: z.string().nullable().optional(),
  fetched_at: z.string().optional(),
});

export type Post = z.infer<typeof PostSchema>;

export const CommentSchema = z.object({
  id: z.string(),
  post_id: z.string(),
  parent_id: z.string(),
  depth: z.number().default(0),
  author: z.string().default('[deleted]'),
  body: z.string(),
  score: z.number().default(0),
  created_utc: z.number(),
  is_submitter: z.boolean().default(false),
  fetched_at: z.string().optional(),
});

export type Comment = z.infer<typeof CommentSchema>;

export const ThreadSchema = z.object({
  id: z.string(),
  post_id: z.string(),
  subreddit: z.string(),
  comment_count: z.number().default(0),
  unique_authors: z.number().default(0),
  max_depth: z.number().default(0),
  truncated: z.boolean().default(false),
  raw_json_compressed: z.instanceof(Buffer).nullable().optional(),
  fetched_at: z.string().optional(),
  analyzed_at: z.string().nullable().optional(),
});

export type Thread = z.infer<typeof ThreadSchema>;

// ==================== ANALYSIS TYPES ====================

export const ThreadSignalsSchema = z.object({
  thread_id: z.string(),
  pain_score: z.number().min(0).max(10).default(0),
  intent_score: z.number().min(0).max(10).default(0),
  keywords_matched: z.array(z.string()).default([]),
  pain_phrases: z.array(z.string()).default([]),
  intent_phrases: z.array(z.string()).default([]),
  top_evidence_ids: z.array(z.string()).default([]),
  computed_at: z.string().optional(),
});

export type ThreadSignals = z.infer<typeof ThreadSignalsSchema>;

export const PainPointSchema = z.object({
  text: z.string().min(1),
  evidence_ids: z.array(z.string()).default([]),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
});

export type PainPoint = z.infer<typeof PainPointSchema>;

export const InsightSchema = z.object({
  id: z.string(),
  thread_id: z.string(),
  pain_points: z.array(PainPointSchema).min(1),
  who_has_problem: z.string().default(''),
  current_workarounds: z.array(z.string()).default([]),
  desired_solution: z.string().default(''),
  willingness_to_pay: z.string().nullable().optional(),
  job_to_be_done: z.string().default(''),
  confidence: z.number().min(0).max(1).default(0),
  model_used: z.string(),
  extracted_at: z.string().optional(),
});

export type Insight = z.infer<typeof InsightSchema>;

// LLM extraction schema (what we send to LLM)
export const InsightExtractionSchema = z.object({
  pain_points: z.array(z.object({
    text: z.string().min(10),
    evidence_ids: z.array(z.string()).min(1),
    severity: z.enum(['low', 'medium', 'high']).default('medium'),
  })).min(1),
  who_has_problem: z.string().min(5),
  current_workarounds: z.array(z.string()),
  desired_solution: z.string().min(10),
  willingness_to_pay: z.string().nullable(),
  job_to_be_done: z.string().min(20),
});

export type InsightExtraction = z.infer<typeof InsightExtractionSchema>;

export const EmbeddingSchema = z.object({
  id: z.string(),
  source_type: z.enum(['insight', 'pain_point', 'thread']),
  source_id: z.string(),
  embedding: z.instanceof(Buffer),
  model_used: z.string(),
  created_at: z.string().optional(),
});

export type Embedding = z.infer<typeof EmbeddingSchema>;

export const ClusterSchema = z.object({
  id: z.string(),
  name: z.string(),
  description: z.string().nullable().optional(),
  centroid_embedding: z.instanceof(Buffer).nullable().optional(),
  insight_ids: z.array(z.string()).default([]),
  thread_count: z.number().default(0),
  subreddit_count: z.number().default(0),
  avg_pain_score: z.number().default(0),
  avg_intent_score: z.number().default(0),
  created_at: z.string().optional(),
});

export type Cluster = z.infer<typeof ClusterSchema>;

// ==================== IDEA TYPES ====================

export const EvidenceSnippetSchema = z.object({
  comment_id: z.string(),
  text: z.string().max(500),
  thread_url: z.string(),
});

export type EvidenceSnippet = z.infer<typeof EvidenceSnippetSchema>;

export const IdeaScoresSchema = z.object({
  pain: z.number().min(0).max(10),
  intent: z.number().min(0).max(10),
  frequency: z.number().min(0).max(10),
  buildability: z.number().min(0).max(10),
  total: z.number(),
});

export type IdeaScores = z.infer<typeof IdeaScoresSchema>;

export const IdeaSchema = z.object({
  id: z.string(),
  cluster_id: z.string(),
  rank: z.number().min(1),
  name: z.string().min(1),
  one_liner: z.string().min(10).max(200),
  target_persona: z.string().nullable().optional(),
  mvp_workflow: z.array(z.string()).min(3).max(7),
  mvp_features: z.array(z.string()).min(3),
  pricing_hypothesis: z.string().nullable().optional(),
  why_it_wins: z.string().nullable().optional(),
  evidence_urls: z.array(z.string()).min(3),
  evidence_snippets: z.array(EvidenceSnippetSchema).min(3).max(8),
  scores: IdeaScoresSchema,
  generated_at: z.string().optional(),
});

export type Idea = z.infer<typeof IdeaSchema>;

// ==================== OPERATIONAL TYPES ====================

export const IngestionRunSchema = z.object({
  id: z.string(),
  run_type: z.enum(['subreddits', 'urls']),
  started_at: z.string(),
  completed_at: z.string().nullable().optional(),
  status: z.enum(['running', 'completed', 'failed', 'interrupted']).default('running'),
  config_snapshot: z.record(z.unknown()).default({}),
  subreddits_processed: z.number().default(0),
  threads_fetched: z.number().default(0),
  comments_fetched: z.number().default(0),
  errors: z.array(z.string()).default([]),
});

export type IngestionRun = z.infer<typeof IngestionRunSchema>;

export const FetchLogSchema = z.object({
  id: z.string(),
  url: z.string(),
  status_code: z.number(),
  fetched_at: z.string(),
  response_hash: z.string().nullable().optional(),
  error: z.string().nullable().optional(),
});

export type FetchLog = z.infer<typeof FetchLogSchema>;

// ==================== THREAD DOCUMENT (for analysis) ====================

export const ThreadDocumentSchema = z.object({
  thread_id: z.string(),
  subreddit: z.string(),
  title: z.string(),
  selftext: z.string(),
  created_utc: z.number(),
  score: z.number(),
  url: z.string(),
  comments: z.array(z.object({
    id: z.string(),
    body: z.string(),
    score: z.number(),
    depth: z.number(),
    is_op: z.boolean(),
  })),
  comment_count: z.number(),
  unique_authors: z.number(),
  signals: ThreadSignalsSchema.nullable().optional(),
});

export type ThreadDocument = z.infer<typeof ThreadDocumentSchema>;
