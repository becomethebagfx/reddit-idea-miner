// Configuration loader

import { readFileSync, existsSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { config as dotenvConfig } from 'dotenv';
import { z } from 'zod';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..', '..');

// Load .env file
dotenvConfig({ path: join(PROJECT_ROOT, '.env') });

// Environment variable schema
const EnvSchema = z.object({
  LLM_API_KEY: z.string().min(1, 'LLM_API_KEY is required'),
  LLM_BASE_URL: z.string().url().optional(),
  DB_PATH: z.string().default('./data/reddit.db'),
  USER_AGENT: z.string().default('reddit-idea-miner/0.1'),
  MAX_POSTS_PER_SUB_PER_RUN: z.coerce.number().default(50),
  MAX_THREADS_TOTAL_PER_RUN: z.coerce.number().default(1000),
  REQUEST_DELAY_MS: z.coerce.number().default(1500),
  MAX_COMMENTS_PER_THREAD: z.coerce.number().default(5000),
  LLM_MODEL: z.string().default('openai/gpt-4o-mini'),
  LLM_MAX_TOKENS: z.coerce.number().default(4096),
});

// Run config schema (from run.json)
const RunConfigSchema = z.object({
  maxPostsPerSubPerRun: z.number().optional(),
  maxThreadsTotalPerRun: z.number().optional(),
  requestDelayMs: z.number().optional(),
  maxCommentsPerThread: z.number().optional(),
  listingTypes: z.array(z.string()).optional(),
  priorityKeywords: z.boolean().optional(),
  skipAnalyzed: z.boolean().optional(),
  storeRawJson: z.boolean().optional(),
  analysis: z.object({
    minPainScore: z.number().optional(),
    minIntentScore: z.number().optional(),
    maxThreadsToAnalyze: z.number().optional(),
    llmModel: z.string().optional(),
    llmMaxTokens: z.number().optional(),
  }).optional(),
  clustering: z.object({
    minClusters: z.number().optional(),
    maxClusters: z.number().optional(),
    minClusterSize: z.number().optional(),
  }).optional(),
  reporting: z.object({
    topIdeasCount: z.number().optional(),
    minEvidenceUrls: z.number().optional(),
    maxEvidenceSnippets: z.number().optional(),
  }).optional(),
});

export type EnvConfig = z.infer<typeof EnvSchema>;
export type RunConfig = z.infer<typeof RunConfigSchema>;

export interface Config {
  env: EnvConfig;
  run: RunConfig;
  paths: {
    root: string;
    config: string;
    data: string;
    deliverables: string;
  };
  subreddits: string[];
  keywords: string[];
  seedUrls: string[];
}

function loadTextFileLines(path: string): string[] {
  if (!existsSync(path)) return [];
  return readFileSync(path, 'utf-8')
    .split('\n')
    .map((line) => line.trim())
    .filter((line) => line && !line.startsWith('#'));
}

function loadJsonFile<T>(path: string, schema: z.ZodType<T>, defaultValue: T): T {
  if (!existsSync(path)) return defaultValue;
  try {
    const content = readFileSync(path, 'utf-8');
    const parsed = JSON.parse(content);
    return schema.parse(parsed);
  } catch (error) {
    console.warn(`Warning: Could not parse ${path}:`, error);
    return defaultValue;
  }
}

let cachedConfig: Config | null = null;

export function loadConfig(forceReload = false): Config {
  if (cachedConfig && !forceReload) {
    return cachedConfig;
  }

  // Parse environment variables
  const envResult = EnvSchema.safeParse(process.env);
  if (!envResult.success) {
    throw new Error(`Invalid environment configuration: ${envResult.error.message}`);
  }
  const env = envResult.data;

  // Define paths
  const paths = {
    root: PROJECT_ROOT,
    config: join(PROJECT_ROOT, 'config'),
    data: join(PROJECT_ROOT, 'data'),
    deliverables: join(PROJECT_ROOT, 'deliverables', 'reddit_idea_miner'),
  };

  // Load run.json
  const runConfigPath = join(paths.config, 'run.json');
  const run = loadJsonFile(runConfigPath, RunConfigSchema, {});

  // Load subreddits
  const subredditsPath = join(paths.config, 'subreddits.txt');
  const subreddits = loadTextFileLines(subredditsPath);

  // Load keywords
  const keywordsPath = join(paths.config, 'keywords.txt');
  const keywords = loadTextFileLines(keywordsPath);

  // Load seed URLs
  const seedUrlsPath = join(paths.config, 'seed_urls.txt');
  const seedUrls = loadTextFileLines(seedUrlsPath);

  cachedConfig = {
    env,
    run,
    paths,
    subreddits,
    keywords,
    seedUrls,
  };

  return cachedConfig;
}

export function getConfig(): Config {
  return loadConfig();
}

// Helper to resolve DB path (relative to project root)
export function getDbPath(): string {
  const config = getConfig();
  const dbPath = config.env.DB_PATH;
  if (dbPath.startsWith('/')) {
    return dbPath;
  }
  return join(config.paths.root, dbPath);
}

export default loadConfig;
