// SQLite database connection and operations

import Database from 'better-sqlite3';
import { mkdirSync, existsSync } from 'fs';
import { dirname } from 'path';
import { getDbPath } from '../config/loadConfig.js';
import { log } from '../utils/log.js';
import {
  type Post,
  type Comment,
  type Thread,
  type Subreddit,
  type ThreadSignals,
  type Insight,
  type Cluster,
  type Idea,
  type IngestionRun,
  type FetchLog,
} from './models.js';

let db: Database.Database | null = null;

// ==================== CONNECTION ====================

export function getDb(): Database.Database {
  if (db) return db;

  const dbPath = getDbPath();
  const dbDir = dirname(dbPath);

  // Ensure directory exists
  if (!existsSync(dbDir)) {
    mkdirSync(dbDir, { recursive: true });
  }

  log.info('DB', `Opening database at ${dbPath}`);
  db = new Database(dbPath);

  // Enable WAL mode for better concurrency
  db.pragma('journal_mode = WAL');

  // Run migrations
  runMigrations(db);

  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
    db = null;
  }
}

// ==================== MIGRATIONS ====================

const MIGRATIONS = [
  // Migration 1: Initial schema
  `
  CREATE TABLE IF NOT EXISTS subreddits (
    id TEXT PRIMARY KEY,
    display_name TEXT NOT NULL,
    category TEXT NOT NULL,
    intent_score REAL NOT NULL DEFAULT 0,
    subscriber_count INTEGER,
    description TEXT,
    typical_pain_points TEXT,
    keywords_to_watch TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_subreddits_category ON subreddits(category);
  CREATE INDEX IF NOT EXISTS idx_subreddits_intent ON subreddits(intent_score DESC);
  `,

  `
  CREATE TABLE IF NOT EXISTS posts (
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
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_posts_subreddit ON posts(subreddit);
  CREATE INDEX IF NOT EXISTS idx_posts_created ON posts(created_utc DESC);
  CREATE INDEX IF NOT EXISTS idx_posts_score ON posts(score DESC);
  `,

  `
  CREATE TABLE IF NOT EXISTS comments (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL,
    parent_id TEXT NOT NULL,
    depth INTEGER NOT NULL DEFAULT 0,
    author TEXT,
    body TEXT NOT NULL,
    score INTEGER NOT NULL DEFAULT 0,
    created_utc INTEGER NOT NULL,
    is_submitter INTEGER NOT NULL DEFAULT 0,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_comments_post ON comments(post_id);
  CREATE INDEX IF NOT EXISTS idx_comments_parent ON comments(parent_id);
  CREATE INDEX IF NOT EXISTS idx_comments_score ON comments(score DESC);
  `,

  `
  CREATE TABLE IF NOT EXISTS threads (
    id TEXT PRIMARY KEY,
    post_id TEXT NOT NULL UNIQUE,
    subreddit TEXT NOT NULL,
    comment_count INTEGER NOT NULL DEFAULT 0,
    unique_authors INTEGER NOT NULL DEFAULT 0,
    max_depth INTEGER NOT NULL DEFAULT 0,
    truncated INTEGER NOT NULL DEFAULT 0,
    raw_json_compressed BLOB,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    analyzed_at TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_threads_subreddit ON threads(subreddit);
  CREATE INDEX IF NOT EXISTS idx_threads_analyzed ON threads(analyzed_at);
  `,

  `
  CREATE TABLE IF NOT EXISTS thread_signals (
    thread_id TEXT PRIMARY KEY,
    pain_score REAL NOT NULL DEFAULT 0,
    intent_score REAL NOT NULL DEFAULT 0,
    keywords_matched TEXT,
    pain_phrases TEXT,
    intent_phrases TEXT,
    top_evidence_ids TEXT,
    computed_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_signals_pain ON thread_signals(pain_score DESC);
  CREATE INDEX IF NOT EXISTS idx_signals_intent ON thread_signals(intent_score DESC);
  `,

  `
  CREATE TABLE IF NOT EXISTS insights (
    id TEXT PRIMARY KEY,
    thread_id TEXT NOT NULL,
    pain_points TEXT NOT NULL,
    who_has_problem TEXT,
    current_workarounds TEXT,
    desired_solution TEXT,
    willingness_to_pay TEXT,
    job_to_be_done TEXT,
    confidence REAL NOT NULL DEFAULT 0,
    model_used TEXT NOT NULL,
    extracted_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_insights_thread ON insights(thread_id);
  CREATE INDEX IF NOT EXISTS idx_insights_confidence ON insights(confidence DESC);
  `,

  `
  CREATE TABLE IF NOT EXISTS embeddings (
    id TEXT PRIMARY KEY,
    source_type TEXT NOT NULL,
    source_id TEXT NOT NULL,
    embedding BLOB NOT NULL,
    model_used TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_embeddings_source ON embeddings(source_type, source_id);
  `,

  `
  CREATE TABLE IF NOT EXISTS clusters (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    centroid_embedding BLOB,
    insight_ids TEXT NOT NULL,
    thread_count INTEGER NOT NULL DEFAULT 0,
    subreddit_count INTEGER NOT NULL DEFAULT 0,
    avg_pain_score REAL NOT NULL DEFAULT 0,
    avg_intent_score REAL NOT NULL DEFAULT 0,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,

  `
  CREATE TABLE IF NOT EXISTS ideas (
    id TEXT PRIMARY KEY,
    cluster_id TEXT NOT NULL,
    rank INTEGER NOT NULL,
    name TEXT NOT NULL,
    one_liner TEXT NOT NULL,
    target_persona TEXT,
    mvp_workflow TEXT,
    mvp_features TEXT,
    pricing_hypothesis TEXT,
    why_it_wins TEXT,
    evidence_urls TEXT,
    evidence_snippets TEXT,
    scores TEXT NOT NULL,
    generated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE INDEX IF NOT EXISTS idx_ideas_rank ON ideas(rank);
  CREATE INDEX IF NOT EXISTS idx_ideas_cluster ON ideas(cluster_id);
  `,

  `
  CREATE TABLE IF NOT EXISTS ingestion_runs (
    id TEXT PRIMARY KEY,
    run_type TEXT NOT NULL,
    started_at TEXT NOT NULL DEFAULT (datetime('now')),
    completed_at TEXT,
    status TEXT NOT NULL DEFAULT 'running',
    config_snapshot TEXT,
    subreddits_processed INTEGER NOT NULL DEFAULT 0,
    threads_fetched INTEGER NOT NULL DEFAULT 0,
    comments_fetched INTEGER NOT NULL DEFAULT 0,
    errors TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_runs_status ON ingestion_runs(status);
  CREATE INDEX IF NOT EXISTS idx_runs_started ON ingestion_runs(started_at DESC);
  `,

  `
  CREATE TABLE IF NOT EXISTS fetch_log (
    id TEXT PRIMARY KEY,
    url TEXT NOT NULL,
    status_code INTEGER NOT NULL,
    fetched_at TEXT NOT NULL DEFAULT (datetime('now')),
    response_hash TEXT,
    error TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_fetch_url ON fetch_log(url);
  CREATE INDEX IF NOT EXISTS idx_fetch_time ON fetch_log(fetched_at DESC);
  `,

  `
  CREATE TABLE IF NOT EXISTS migrations (
    id INTEGER PRIMARY KEY,
    applied_at TEXT NOT NULL DEFAULT (datetime('now'))
  );
  `,
];

function runMigrations(database: Database.Database): void {
  // Ensure migrations table exists
  database.exec(`
    CREATE TABLE IF NOT EXISTS migrations (
      id INTEGER PRIMARY KEY,
      applied_at TEXT NOT NULL DEFAULT (datetime('now'))
    );
  `);

  // Get applied migrations
  const applied = database
    .prepare('SELECT id FROM migrations')
    .all() as { id: number }[];
  const appliedSet = new Set(applied.map((m) => m.id));

  // Run pending migrations
  const insertMigration = database.prepare('INSERT INTO migrations (id) VALUES (?)');

  for (let i = 0; i < MIGRATIONS.length; i++) {
    if (!appliedSet.has(i)) {
      log.info('DB', `Running migration ${i}`);
      database.exec(MIGRATIONS[i]!);
      insertMigration.run(i);
    }
  }
}

// ==================== SUBREDDITS ====================

export function upsertSubreddit(subreddit: Subreddit): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO subreddits (id, display_name, category, intent_score, subscriber_count, description, typical_pain_points, keywords_to_watch)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      display_name = excluded.display_name,
      category = excluded.category,
      intent_score = excluded.intent_score,
      subscriber_count = excluded.subscriber_count,
      description = excluded.description,
      typical_pain_points = excluded.typical_pain_points,
      keywords_to_watch = excluded.keywords_to_watch,
      updated_at = datetime('now')
  `).run(
    subreddit.id,
    subreddit.display_name,
    subreddit.category,
    subreddit.intent_score,
    subreddit.subscriber_count ?? null,
    subreddit.description ?? null,
    JSON.stringify(subreddit.typical_pain_points),
    JSON.stringify(subreddit.keywords_to_watch)
  );
}

export function getSubreddits(): Subreddit[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM subreddits ORDER BY intent_score DESC').all() as Record<string, unknown>[];
  return rows.map(parseSubredditRow);
}

function parseSubredditRow(row: Record<string, unknown>): Subreddit {
  return {
    id: row['id'] as string,
    display_name: row['display_name'] as string,
    category: row['category'] as string,
    intent_score: row['intent_score'] as number,
    subscriber_count: row['subscriber_count'] as number | null,
    description: row['description'] as string | null,
    typical_pain_points: JSON.parse((row['typical_pain_points'] as string) || '[]'),
    keywords_to_watch: JSON.parse((row['keywords_to_watch'] as string) || '[]'),
    created_at: row['created_at'] as string,
    updated_at: row['updated_at'] as string,
  };
}

// ==================== POSTS ====================

export function upsertPost(post: Post): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO posts (id, subreddit, title, selftext, author, score, upvote_ratio, num_comments, created_utc, permalink, url, is_self, link_flair_text)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      score = excluded.score,
      upvote_ratio = excluded.upvote_ratio,
      num_comments = excluded.num_comments,
      fetched_at = datetime('now')
  `).run(
    post.id,
    post.subreddit,
    post.title,
    post.selftext,
    post.author,
    post.score,
    post.upvote_ratio ?? null,
    post.num_comments,
    post.created_utc,
    post.permalink,
    post.url ?? null,
    post.is_self ? 1 : 0,
    post.link_flair_text ?? null
  );
}

export function getPost(id: string): Post | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM posts WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return parsePostRow(row);
}

export function getPostsBySubreddit(subreddit: string, limit = 100): Post[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM posts WHERE subreddit = ? ORDER BY score DESC LIMIT ?
  `).all(subreddit, limit) as Record<string, unknown>[];
  return rows.map(parsePostRow);
}

function parsePostRow(row: Record<string, unknown>): Post {
  return {
    id: row['id'] as string,
    subreddit: row['subreddit'] as string,
    title: row['title'] as string,
    selftext: row['selftext'] as string || '',
    author: row['author'] as string || '[deleted]',
    score: row['score'] as number,
    upvote_ratio: row['upvote_ratio'] as number | null,
    num_comments: row['num_comments'] as number,
    created_utc: row['created_utc'] as number,
    permalink: row['permalink'] as string,
    url: row['url'] as string | null,
    is_self: Boolean(row['is_self']),
    link_flair_text: row['link_flair_text'] as string | null,
    fetched_at: row['fetched_at'] as string,
  };
}

// ==================== COMMENTS ====================

export function upsertComment(comment: Comment): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO comments (id, post_id, parent_id, depth, author, body, score, created_utc, is_submitter)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      score = excluded.score,
      fetched_at = datetime('now')
  `).run(
    comment.id,
    comment.post_id,
    comment.parent_id,
    comment.depth,
    comment.author,
    comment.body,
    comment.score,
    comment.created_utc,
    comment.is_submitter ? 1 : 0
  );
}

export function upsertComments(comments: Comment[]): void {
  const db = getDb();
  const stmt = db.prepare(`
    INSERT INTO comments (id, post_id, parent_id, depth, author, body, score, created_utc, is_submitter)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      score = excluded.score,
      fetched_at = datetime('now')
  `);

  const transaction = db.transaction((comments: Comment[]) => {
    for (const comment of comments) {
      stmt.run(
        comment.id,
        comment.post_id,
        comment.parent_id,
        comment.depth,
        comment.author,
        comment.body,
        comment.score,
        comment.created_utc,
        comment.is_submitter ? 1 : 0
      );
    }
  });

  transaction(comments);
}

export function getCommentsByPost(postId: string): Comment[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT * FROM comments WHERE post_id = ? ORDER BY score DESC
  `).all(postId) as Record<string, unknown>[];
  return rows.map(parseCommentRow);
}

function parseCommentRow(row: Record<string, unknown>): Comment {
  return {
    id: row['id'] as string,
    post_id: row['post_id'] as string,
    parent_id: row['parent_id'] as string,
    depth: row['depth'] as number,
    author: row['author'] as string || '[deleted]',
    body: row['body'] as string,
    score: row['score'] as number,
    created_utc: row['created_utc'] as number,
    is_submitter: Boolean(row['is_submitter']),
    fetched_at: row['fetched_at'] as string,
  };
}

// ==================== THREADS ====================

export function upsertThread(thread: Thread): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO threads (id, post_id, subreddit, comment_count, unique_authors, max_depth, truncated, raw_json_compressed)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(id) DO UPDATE SET
      comment_count = excluded.comment_count,
      unique_authors = excluded.unique_authors,
      max_depth = excluded.max_depth,
      truncated = excluded.truncated,
      fetched_at = datetime('now')
  `).run(
    thread.id,
    thread.post_id,
    thread.subreddit,
    thread.comment_count,
    thread.unique_authors,
    thread.max_depth,
    thread.truncated ? 1 : 0,
    thread.raw_json_compressed ?? null
  );
}

export function getThread(id: string): Thread | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM threads WHERE id = ?').get(id) as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseThreadRow(row);
}

export function getThreadsForAnalysis(limit = 500): Thread[] {
  const db = getDb();
  const rows = db.prepare(`
    SELECT t.* FROM threads t
    LEFT JOIN thread_signals s ON t.id = s.thread_id
    WHERE t.analyzed_at IS NULL OR s.thread_id IS NULL
    ORDER BY t.comment_count DESC
    LIMIT ?
  `).all(limit) as Record<string, unknown>[];
  return rows.map(parseThreadRow);
}

export function markThreadAnalyzed(threadId: string): void {
  const db = getDb();
  db.prepare(`UPDATE threads SET analyzed_at = datetime('now') WHERE id = ?`).run(threadId);
}

function parseThreadRow(row: Record<string, unknown>): Thread {
  return {
    id: row['id'] as string,
    post_id: row['post_id'] as string,
    subreddit: row['subreddit'] as string,
    comment_count: row['comment_count'] as number,
    unique_authors: row['unique_authors'] as number,
    max_depth: row['max_depth'] as number,
    truncated: Boolean(row['truncated']),
    raw_json_compressed: row['raw_json_compressed'] as Buffer | null,
    fetched_at: row['fetched_at'] as string,
    analyzed_at: row['analyzed_at'] as string | null,
  };
}

// ==================== SIGNALS ====================

export function upsertThreadSignals(signals: ThreadSignals): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO thread_signals (thread_id, pain_score, intent_score, keywords_matched, pain_phrases, intent_phrases, top_evidence_ids)
    VALUES (?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT(thread_id) DO UPDATE SET
      pain_score = excluded.pain_score,
      intent_score = excluded.intent_score,
      keywords_matched = excluded.keywords_matched,
      pain_phrases = excluded.pain_phrases,
      intent_phrases = excluded.intent_phrases,
      top_evidence_ids = excluded.top_evidence_ids,
      computed_at = datetime('now')
  `).run(
    signals.thread_id,
    signals.pain_score,
    signals.intent_score,
    JSON.stringify(signals.keywords_matched),
    JSON.stringify(signals.pain_phrases),
    JSON.stringify(signals.intent_phrases),
    JSON.stringify(signals.top_evidence_ids)
  );
}

export function getThreadSignals(threadId: string): ThreadSignals | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM thread_signals WHERE thread_id = ?').get(threadId) as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseSignalsRow(row);
}

function parseSignalsRow(row: Record<string, unknown>): ThreadSignals {
  return {
    thread_id: row['thread_id'] as string,
    pain_score: row['pain_score'] as number,
    intent_score: row['intent_score'] as number,
    keywords_matched: JSON.parse((row['keywords_matched'] as string) || '[]'),
    pain_phrases: JSON.parse((row['pain_phrases'] as string) || '[]'),
    intent_phrases: JSON.parse((row['intent_phrases'] as string) || '[]'),
    top_evidence_ids: JSON.parse((row['top_evidence_ids'] as string) || '[]'),
    computed_at: row['computed_at'] as string,
  };
}

// ==================== INSIGHTS ====================

export function insertInsight(insight: Insight): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO insights (id, thread_id, pain_points, who_has_problem, current_workarounds, desired_solution, willingness_to_pay, job_to_be_done, confidence, model_used)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    insight.id,
    insight.thread_id,
    JSON.stringify(insight.pain_points),
    insight.who_has_problem,
    JSON.stringify(insight.current_workarounds),
    insight.desired_solution,
    insight.willingness_to_pay ?? null,
    insight.job_to_be_done,
    insight.confidence,
    insight.model_used
  );
}

export function getInsightsByThread(threadId: string): Insight[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM insights WHERE thread_id = ?').all(threadId) as Record<string, unknown>[];
  return rows.map(parseInsightRow);
}

export function getAllInsights(): Insight[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM insights ORDER BY confidence DESC').all() as Record<string, unknown>[];
  return rows.map(parseInsightRow);
}

function parseInsightRow(row: Record<string, unknown>): Insight {
  return {
    id: row['id'] as string,
    thread_id: row['thread_id'] as string,
    pain_points: JSON.parse((row['pain_points'] as string) || '[]'),
    who_has_problem: row['who_has_problem'] as string || '',
    current_workarounds: JSON.parse((row['current_workarounds'] as string) || '[]'),
    desired_solution: row['desired_solution'] as string || '',
    willingness_to_pay: row['willingness_to_pay'] as string | null,
    job_to_be_done: row['job_to_be_done'] as string || '',
    confidence: row['confidence'] as number,
    model_used: row['model_used'] as string,
    extracted_at: row['extracted_at'] as string,
  };
}

// ==================== CLUSTERS ====================

export function insertCluster(cluster: Cluster): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO clusters (id, name, description, centroid_embedding, insight_ids, thread_count, subreddit_count, avg_pain_score, avg_intent_score)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    cluster.id,
    cluster.name,
    cluster.description ?? null,
    cluster.centroid_embedding ?? null,
    JSON.stringify(cluster.insight_ids),
    cluster.thread_count,
    cluster.subreddit_count,
    cluster.avg_pain_score,
    cluster.avg_intent_score
  );
}

export function getClusters(): Cluster[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM clusters ORDER BY avg_pain_score DESC').all() as Record<string, unknown>[];
  return rows.map(parseClusterRow);
}

function parseClusterRow(row: Record<string, unknown>): Cluster {
  return {
    id: row['id'] as string,
    name: row['name'] as string,
    description: row['description'] as string | null,
    centroid_embedding: row['centroid_embedding'] as Buffer | null,
    insight_ids: JSON.parse((row['insight_ids'] as string) || '[]'),
    thread_count: row['thread_count'] as number,
    subreddit_count: row['subreddit_count'] as number,
    avg_pain_score: row['avg_pain_score'] as number,
    avg_intent_score: row['avg_intent_score'] as number,
    created_at: row['created_at'] as string,
  };
}

// ==================== IDEAS ====================

export function insertIdea(idea: Idea): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO ideas (id, cluster_id, rank, name, one_liner, target_persona, mvp_workflow, mvp_features, pricing_hypothesis, why_it_wins, evidence_urls, evidence_snippets, scores)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    idea.id,
    idea.cluster_id,
    idea.rank,
    idea.name,
    idea.one_liner,
    idea.target_persona ?? null,
    JSON.stringify(idea.mvp_workflow),
    JSON.stringify(idea.mvp_features),
    idea.pricing_hypothesis ?? null,
    idea.why_it_wins ?? null,
    JSON.stringify(idea.evidence_urls),
    JSON.stringify(idea.evidence_snippets),
    JSON.stringify(idea.scores)
  );
}

export function getIdeas(): Idea[] {
  const db = getDb();
  const rows = db.prepare('SELECT * FROM ideas ORDER BY rank').all() as Record<string, unknown>[];
  return rows.map(parseIdeaRow);
}

function parseIdeaRow(row: Record<string, unknown>): Idea {
  return {
    id: row['id'] as string,
    cluster_id: row['cluster_id'] as string,
    rank: row['rank'] as number,
    name: row['name'] as string,
    one_liner: row['one_liner'] as string,
    target_persona: row['target_persona'] as string | null,
    mvp_workflow: JSON.parse((row['mvp_workflow'] as string) || '[]'),
    mvp_features: JSON.parse((row['mvp_features'] as string) || '[]'),
    pricing_hypothesis: row['pricing_hypothesis'] as string | null,
    why_it_wins: row['why_it_wins'] as string | null,
    evidence_urls: JSON.parse((row['evidence_urls'] as string) || '[]'),
    evidence_snippets: JSON.parse((row['evidence_snippets'] as string) || '[]'),
    scores: JSON.parse((row['scores'] as string) || '{}'),
    generated_at: row['generated_at'] as string,
  };
}

// ==================== INGESTION RUNS ====================

export function createIngestionRun(run: Omit<IngestionRun, 'started_at'>): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO ingestion_runs (id, run_type, status, config_snapshot)
    VALUES (?, ?, ?, ?)
  `).run(
    run.id,
    run.run_type,
    run.status,
    JSON.stringify(run.config_snapshot)
  );
}

export function updateIngestionRun(id: string, updates: Partial<IngestionRun>): void {
  const db = getDb();
  const sets: string[] = [];
  const values: unknown[] = [];

  if (updates.status !== undefined) {
    sets.push('status = ?');
    values.push(updates.status);
  }
  if (updates.completed_at !== undefined) {
    sets.push('completed_at = ?');
    values.push(updates.completed_at);
  }
  if (updates.subreddits_processed !== undefined) {
    sets.push('subreddits_processed = ?');
    values.push(updates.subreddits_processed);
  }
  if (updates.threads_fetched !== undefined) {
    sets.push('threads_fetched = ?');
    values.push(updates.threads_fetched);
  }
  if (updates.comments_fetched !== undefined) {
    sets.push('comments_fetched = ?');
    values.push(updates.comments_fetched);
  }
  if (updates.errors !== undefined) {
    sets.push('errors = ?');
    values.push(JSON.stringify(updates.errors));
  }

  if (sets.length > 0) {
    values.push(id);
    db.prepare(`UPDATE ingestion_runs SET ${sets.join(', ')} WHERE id = ?`).run(...values);
  }
}

export function getLatestIngestionRun(): IngestionRun | null {
  const db = getDb();
  const row = db.prepare('SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 1').get() as Record<string, unknown> | undefined;
  if (!row) return null;
  return parseIngestionRunRow(row);
}

function parseIngestionRunRow(row: Record<string, unknown>): IngestionRun {
  return {
    id: row['id'] as string,
    run_type: row['run_type'] as 'subreddits' | 'urls',
    started_at: row['started_at'] as string,
    completed_at: row['completed_at'] as string | null,
    status: row['status'] as IngestionRun['status'],
    config_snapshot: JSON.parse((row['config_snapshot'] as string) || '{}'),
    subreddits_processed: row['subreddits_processed'] as number,
    threads_fetched: row['threads_fetched'] as number,
    comments_fetched: row['comments_fetched'] as number,
    errors: JSON.parse((row['errors'] as string) || '[]'),
  };
}

// ==================== FETCH LOG ====================

export function logFetch(entry: FetchLog): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO fetch_log (id, url, status_code, response_hash, error)
    VALUES (?, ?, ?, ?, ?)
  `).run(
    entry.id,
    entry.url,
    entry.status_code,
    entry.response_hash ?? null,
    entry.error ?? null
  );
}

export function wasUrlFetched(url: string, maxAgeHours = 24): boolean {
  const db = getDb();
  const row = db.prepare(`
    SELECT 1 FROM fetch_log
    WHERE url = ? AND status_code = 200
    AND datetime(fetched_at) > datetime('now', '-' || ? || ' hours')
    LIMIT 1
  `).get(url, maxAgeHours);
  return Boolean(row);
}

// ==================== STATS ====================

export function getStats(): {
  subreddits: number;
  posts: number;
  comments: number;
  threads: number;
  threadsAnalyzed: number;
  insights: number;
  clusters: number;
  ideas: number;
} {
  const db = getDb();

  const subreddits = (db.prepare('SELECT COUNT(*) as count FROM subreddits').get() as { count: number }).count;
  const posts = (db.prepare('SELECT COUNT(*) as count FROM posts').get() as { count: number }).count;
  const comments = (db.prepare('SELECT COUNT(*) as count FROM comments').get() as { count: number }).count;
  const threads = (db.prepare('SELECT COUNT(*) as count FROM threads').get() as { count: number }).count;
  const threadsAnalyzed = (db.prepare('SELECT COUNT(*) as count FROM threads WHERE analyzed_at IS NOT NULL').get() as { count: number }).count;
  const insights = (db.prepare('SELECT COUNT(*) as count FROM insights').get() as { count: number }).count;
  const clusters = (db.prepare('SELECT COUNT(*) as count FROM clusters').get() as { count: number }).count;
  const ideas = (db.prepare('SELECT COUNT(*) as count FROM ideas').get() as { count: number }).count;

  return {
    subreddits,
    posts,
    comments,
    threads,
    threadsAnalyzed,
    insights,
    clusters,
    ideas,
  };
}
