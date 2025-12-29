# Reddit Idea Miner - Data Model

## Overview

This document defines the canonical data types and database schema for the Reddit Idea Miner system. All data is stored in SQLite with full provenance tracking.

## TypeScript Types

### Core Reddit Types

```typescript
// Subreddit metadata
interface Subreddit {
  id: string;                    // Primary key (e.g., "accounting")
  display_name: string;          // Display name
  category: string;              // Market category
  intent_score: number;          // 0-10 buyer intent score
  subscriber_count?: number;     // Subscribers (if known)
  description?: string;          // Subreddit description
  typical_pain_points: string[]; // Expected pain points
  keywords_to_watch: string[];   // Relevant keywords
  created_at: string;            // When added to system
  updated_at: string;            // Last update
}

// Reddit post
interface Post {
  id: string;                    // Reddit post ID (e.g., "1h2abc")
  subreddit: string;             // Subreddit name
  title: string;                 // Post title
  selftext: string;              // Post body (if text post)
  author: string;                // Author username (hashed optional)
  score: number;                 // Upvote score
  upvote_ratio: number;          // Upvote percentage
  num_comments: number;          // Comment count
  created_utc: number;           // Unix timestamp
  permalink: string;             // Reddit permalink
  url: string;                   // Link URL (for link posts)
  is_self: boolean;              // True if text post
  link_flair_text?: string;      // Flair text
  fetched_at: string;            // When we fetched this
}

// Reddit comment
interface Comment {
  id: string;                    // Reddit comment ID
  post_id: string;               // Parent post ID
  parent_id: string;             // Parent comment ID (or post ID if top-level)
  depth: number;                 // Nesting depth (0 = top-level)
  author: string;                // Author username
  body: string;                  // Comment text
  score: number;                 // Upvote score
  created_utc: number;           // Unix timestamp
  is_submitter: boolean;         // True if OP
  fetched_at: string;            // When we fetched this
}

// Aggregated thread data
interface Thread {
  id: string;                    // Same as post_id
  post_id: string;               // Foreign key to posts
  subreddit: string;             // Subreddit name
  comment_count: number;         // Actual comments fetched
  unique_authors: number;        // Unique participants
  max_depth: number;             // Deepest comment level
  truncated: boolean;            // True if hit comment limit
  raw_json_compressed?: Buffer;  // Optional compressed JSON
  fetched_at: string;            // When fully fetched
  analyzed_at?: string;          // When analyzed
}
```

### Analysis Types

```typescript
// Heuristic signal scores
interface ThreadSignals {
  thread_id: string;             // Foreign key to threads
  pain_score: number;            // 0-10 pain language score
  intent_score: number;          // 0-10 buying intent score
  keywords_matched: string[];    // Which keywords triggered
  pain_phrases: string[];        // Detected pain phrases
  intent_phrases: string[];      // Detected intent phrases
  top_evidence_ids: string[];    // Comment IDs with strongest signals
  computed_at: string;           // When computed
}

// LLM-extracted insight
interface Insight {
  id: string;                    // UUID
  thread_id: string;             // Foreign key to threads
  pain_points: PainPoint[];      // Extracted pain points
  who_has_problem: string;       // Target persona
  current_workarounds: string[]; // How they cope
  desired_solution: string;      // What they want
  willingness_to_pay?: string;   // Payment hints
  job_to_be_done: string;        // JTBD framing
  confidence: number;            // 0-1 confidence score
  model_used: string;            // LLM model name
  extracted_at: string;          // When extracted
}

interface PainPoint {
  text: string;                  // Pain point description
  evidence_ids: string[];        // Supporting comment IDs
  severity: 'low' | 'medium' | 'high';
}

// Theme cluster
interface Cluster {
  id: string;                    // UUID
  name: string;                  // Auto-generated name
  description: string;           // What unites this cluster
  centroid_embedding: number[];  // Cluster center
  insight_ids: string[];         // Member insights
  thread_count: number;          // Unique threads
  subreddit_count: number;       // Unique subreddits
  avg_pain_score: number;        // Average pain score
  avg_intent_score: number;      // Average intent score
  created_at: string;            // When clustered
}

// Generated SaaS idea
interface Idea {
  id: string;                    // UUID
  cluster_id: string;            // Source cluster
  rank: number;                  // 1-20 ranking
  name: string;                  // Product name
  one_liner: string;             // One sentence pitch
  target_persona: string;        // Who it's for
  mvp_workflow: string[];        // 3-7 step workflow
  mvp_features: string[];        // Must-have features
  pricing_hypothesis: string;    // Pricing suggestion
  why_it_wins: string;           // Competitive angle
  evidence_urls: string[];       // Supporting thread URLs
  evidence_snippets: EvidenceSnippet[];
  scores: IdeaScores;
  generated_at: string;          // When generated
}

interface EvidenceSnippet {
  comment_id: string;
  text: string;                  // Short excerpt
  thread_url: string;
}

interface IdeaScores {
  pain: number;                  // 0-10
  intent: number;                // 0-10
  frequency: number;             // 0-10
  buildability: number;          // 0-10
  total: number;                 // Weighted sum
}
```

### Operational Types

```typescript
// Ingestion run record
interface IngestionRun {
  id: string;                    // UUID
  run_type: 'subreddits' | 'urls';
  started_at: string;
  completed_at?: string;
  status: 'running' | 'completed' | 'failed' | 'interrupted';
  config_snapshot: object;       // Runtime config used
  subreddits_processed: number;
  threads_fetched: number;
  comments_fetched: number;
  errors: string[];
}

// Request log for deduplication
interface FetchLog {
  id: string;                    // UUID
  url: string;                   // Requested URL
  status_code: number;           // HTTP status
  fetched_at: string;
  response_hash?: string;        // For change detection
  error?: string;
}
```

## SQLite Schema

### Tables

```sql
-- Subreddit registry
CREATE TABLE subreddits (
  id TEXT PRIMARY KEY,
  display_name TEXT NOT NULL,
  category TEXT NOT NULL,
  intent_score REAL NOT NULL DEFAULT 0,
  subscriber_count INTEGER,
  description TEXT,
  typical_pain_points TEXT,  -- JSON array
  keywords_to_watch TEXT,    -- JSON array
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_subreddits_category ON subreddits(category);
CREATE INDEX idx_subreddits_intent ON subreddits(intent_score DESC);

-- Posts
CREATE TABLE posts (
  id TEXT PRIMARY KEY,
  subreddit TEXT NOT NULL,
  title TEXT NOT NULL,
  selftext TEXT,
  author TEXT,
  score INTEGER NOT NULL DEFAULT 0,
  upvote_ratio REAL,
  num_comments INTEGER NOT NULL DEFAULT 0,
  created_utc INTEGER NOT NULL,
  permalink TEXT NOT NULL,
  url TEXT,
  is_self INTEGER NOT NULL DEFAULT 1,
  link_flair_text TEXT,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (subreddit) REFERENCES subreddits(id)
);

CREATE INDEX idx_posts_subreddit ON posts(subreddit);
CREATE INDEX idx_posts_created ON posts(created_utc DESC);
CREATE INDEX idx_posts_score ON posts(score DESC);

-- Comments
CREATE TABLE comments (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL,
  parent_id TEXT NOT NULL,
  depth INTEGER NOT NULL DEFAULT 0,
  author TEXT,
  body TEXT NOT NULL,
  score INTEGER NOT NULL DEFAULT 0,
  created_utc INTEGER NOT NULL,
  is_submitter INTEGER NOT NULL DEFAULT 0,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (post_id) REFERENCES posts(id)
);

CREATE INDEX idx_comments_post ON comments(post_id);
CREATE INDEX idx_comments_parent ON comments(parent_id);
CREATE INDEX idx_comments_score ON comments(score DESC);

-- Threads (aggregated view)
CREATE TABLE threads (
  id TEXT PRIMARY KEY,
  post_id TEXT NOT NULL UNIQUE,
  subreddit TEXT NOT NULL,
  comment_count INTEGER NOT NULL DEFAULT 0,
  unique_authors INTEGER NOT NULL DEFAULT 0,
  max_depth INTEGER NOT NULL DEFAULT 0,
  truncated INTEGER NOT NULL DEFAULT 0,
  raw_json_compressed BLOB,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  analyzed_at TEXT,
  FOREIGN KEY (post_id) REFERENCES posts(id),
  FOREIGN KEY (subreddit) REFERENCES subreddits(id)
);

CREATE INDEX idx_threads_subreddit ON threads(subreddit);
CREATE INDEX idx_threads_analyzed ON threads(analyzed_at);

-- Signal scores
CREATE TABLE thread_signals (
  thread_id TEXT PRIMARY KEY,
  pain_score REAL NOT NULL DEFAULT 0,
  intent_score REAL NOT NULL DEFAULT 0,
  keywords_matched TEXT,     -- JSON array
  pain_phrases TEXT,         -- JSON array
  intent_phrases TEXT,       -- JSON array
  top_evidence_ids TEXT,     -- JSON array
  computed_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (thread_id) REFERENCES threads(id)
);

CREATE INDEX idx_signals_pain ON thread_signals(pain_score DESC);
CREATE INDEX idx_signals_intent ON thread_signals(intent_score DESC);

-- LLM insights
CREATE TABLE insights (
  id TEXT PRIMARY KEY,
  thread_id TEXT NOT NULL,
  pain_points TEXT NOT NULL,  -- JSON array
  who_has_problem TEXT,
  current_workarounds TEXT,   -- JSON array
  desired_solution TEXT,
  willingness_to_pay TEXT,
  job_to_be_done TEXT,
  confidence REAL NOT NULL DEFAULT 0,
  model_used TEXT NOT NULL,
  extracted_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (thread_id) REFERENCES threads(id)
);

CREATE INDEX idx_insights_thread ON insights(thread_id);
CREATE INDEX idx_insights_confidence ON insights(confidence DESC);

-- Embeddings (stored separately for efficiency)
CREATE TABLE embeddings (
  id TEXT PRIMARY KEY,
  source_type TEXT NOT NULL,  -- 'insight', 'pain_point', 'thread'
  source_id TEXT NOT NULL,
  embedding BLOB NOT NULL,    -- Float32 array as binary
  model_used TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX idx_embeddings_source ON embeddings(source_type, source_id);

-- Clusters
CREATE TABLE clusters (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT,
  centroid_embedding BLOB,
  insight_ids TEXT NOT NULL,  -- JSON array
  thread_count INTEGER NOT NULL DEFAULT 0,
  subreddit_count INTEGER NOT NULL DEFAULT 0,
  avg_pain_score REAL NOT NULL DEFAULT 0,
  avg_intent_score REAL NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

-- Ideas
CREATE TABLE ideas (
  id TEXT PRIMARY KEY,
  cluster_id TEXT NOT NULL,
  rank INTEGER NOT NULL,
  name TEXT NOT NULL,
  one_liner TEXT NOT NULL,
  target_persona TEXT,
  mvp_workflow TEXT,          -- JSON array
  mvp_features TEXT,          -- JSON array
  pricing_hypothesis TEXT,
  why_it_wins TEXT,
  evidence_urls TEXT,         -- JSON array
  evidence_snippets TEXT,     -- JSON array
  scores TEXT NOT NULL,       -- JSON object
  generated_at TEXT NOT NULL DEFAULT (datetime('now')),
  FOREIGN KEY (cluster_id) REFERENCES clusters(id)
);

CREATE INDEX idx_ideas_rank ON ideas(rank);
CREATE INDEX idx_ideas_cluster ON ideas(cluster_id);

-- Ingestion runs
CREATE TABLE ingestion_runs (
  id TEXT PRIMARY KEY,
  run_type TEXT NOT NULL,
  started_at TEXT NOT NULL DEFAULT (datetime('now')),
  completed_at TEXT,
  status TEXT NOT NULL DEFAULT 'running',
  config_snapshot TEXT,       -- JSON object
  subreddits_processed INTEGER NOT NULL DEFAULT 0,
  threads_fetched INTEGER NOT NULL DEFAULT 0,
  comments_fetched INTEGER NOT NULL DEFAULT 0,
  errors TEXT                 -- JSON array
);

CREATE INDEX idx_runs_status ON ingestion_runs(status);
CREATE INDEX idx_runs_started ON ingestion_runs(started_at DESC);

-- Fetch log
CREATE TABLE fetch_log (
  id TEXT PRIMARY KEY,
  url TEXT NOT NULL,
  status_code INTEGER NOT NULL,
  fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
  response_hash TEXT,
  error TEXT
);

CREATE INDEX idx_fetch_url ON fetch_log(url);
CREATE INDEX idx_fetch_time ON fetch_log(fetched_at DESC);
```

## Zod Schemas

All data validation uses Zod schemas defined in `src/analyze/llmSchemas.ts`:

```typescript
import { z } from 'zod';

export const PainPointSchema = z.object({
  text: z.string().min(1),
  evidence_ids: z.array(z.string()),
  severity: z.enum(['low', 'medium', 'high']).default('medium'),
});

export const InsightExtractionSchema = z.object({
  pain_points: z.array(PainPointSchema).min(1),
  who_has_problem: z.string().min(1),
  current_workarounds: z.array(z.string()),
  desired_solution: z.string().min(1),
  willingness_to_pay: z.string().nullable(),
  job_to_be_done: z.string().min(1),
});

export const IdeaScoresSchema = z.object({
  pain: z.number().min(0).max(10),
  intent: z.number().min(0).max(10),
  frequency: z.number().min(0).max(10),
  buildability: z.number().min(0).max(10),
  total: z.number(),
});

export const EvidenceSnippetSchema = z.object({
  comment_id: z.string(),
  text: z.string().max(500),
  thread_url: z.string().url(),
});

export const IdeaSchema = z.object({
  name: z.string().min(1),
  one_liner: z.string().min(10).max(200),
  target_persona: z.string().min(1),
  mvp_workflow: z.array(z.string()).min(3).max(7),
  mvp_features: z.array(z.string()).min(3),
  pricing_hypothesis: z.string(),
  why_it_wins: z.string(),
  evidence_urls: z.array(z.string().url()).min(3),
  evidence_snippets: z.array(EvidenceSnippetSchema).min(3).max(8),
  scores: IdeaScoresSchema,
});
```

## Data Integrity

### Constraints

1. **Post ID uniqueness**: Reddit post IDs are globally unique
2. **Comment ID uniqueness**: Reddit comment IDs are globally unique
3. **Thread-Post 1:1**: Each thread record corresponds to exactly one post
4. **Insight-Thread 1:many**: Multiple insights can be extracted per thread
5. **Cluster-Insight many:many**: Insights can belong to multiple clusters (via JSON array)

### Deduplication Strategy

- Posts: Upsert by `id`, update `fetched_at` if newer
- Comments: Upsert by `id`, update if score changed
- Threads: Upsert by `post_id`
- Insights: Always insert new (track extraction history)

### Data Retention

- Raw JSON blobs: Optional, can be dropped after analysis
- Fetch log: Retain 30 days by default
- Ingestion runs: Retain all for audit
