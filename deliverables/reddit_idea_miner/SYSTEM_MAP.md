# Reddit Idea Miner - System Map

## Overview

The Reddit Idea Miner is a structured system for discovering SaaS opportunities by analyzing Reddit discussions. It processes public JSON endpoints to extract pain points, buying intent signals, and workaround patterns, then clusters these into actionable product ideas.

## Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                           REDDIT IDEA MINER                                  │
├─────────────────────────────────────────────────────────────────────────────┤
│                                                                              │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐            │
│  │ NICHE DISCOVERY│    │   INGESTION    │    │    STORAGE     │            │
│  │                │───▶│                │───▶│                │            │
│  │ • Category map │    │ • Listing JSON │    │ • SQLite DB    │            │
│  │ • 500+ subs    │    │ • Thread JSON  │    │ • Posts table  │            │
│  │ • Intent score │    │ • Rate control │    │ • Comments     │            │
│  │ • Keywords     │    │ • Checkpoints  │    │ • Threads      │            │
│  └────────────────┘    └────────────────┘    └────────────────┘            │
│                                                      │                      │
│                                                      ▼                      │
│  ┌────────────────┐    ┌────────────────┐    ┌────────────────┐            │
│  │   REPORTING    │◀───│  IDEA GEN      │◀───│   ANALYSIS     │            │
│  │                │    │                │    │                │            │
│  │ • TOP_20.md    │    │ • Clustering   │    │ • Signals      │            │
│  │ • TOP_20.json  │    │ • Ranking      │    │ • LLM extract  │            │
│  │ • Evidence/    │    │ • Evidence     │    │ • Embeddings   │            │
│  │ • Runbooks     │    │ • MVP design   │    │ • Pain/Intent  │            │
│  └────────────────┘    └────────────────┘    └────────────────┘            │
│                                                                              │
└─────────────────────────────────────────────────────────────────────────────┘
```

## Components

### 1. Niche Discovery Module

**Purpose**: Identify 500+ subreddits with high SaaS/buying intent potential.

**Inputs**:
- Market category taxonomy (40+ categories)
- Web research on professional communities
- Intent scoring heuristics

**Outputs**:
- `NICHE_LIST_500.md` - Documented subreddit list with metadata
- `config/subreddits.txt` - Plain list for ingestion
- `config/keywords.txt` - 200-500 intent signal keywords

**Process**:
1. Define market categories (accounting, HR, IT ops, etc.)
2. Research subreddits per category
3. Score each for buyer-intent (0-10)
4. Identify typical pain points
5. Deduplicate and validate count >= 500

### 2. Ingestion Module

**Purpose**: Fetch and parse Reddit data via public JSON endpoints.

**Components**:
- `http.ts` - HTTP client with retry logic
- `scheduler.ts` - Rate-limited request queue
- `subredditListing.ts` - Fetch /new.json, /top.json listings
- `threadJson.ts` - Fetch individual thread JSON
- `parseThread.ts` - Parse comment trees
- `normalize.ts` - Flatten to canonical format

**Endpoints Used**:
```
Listings:
  /r/{subreddit}/new.json?limit=100
  /r/{subreddit}/top.json?t=month&limit=100
  /r/{subreddit}/top.json?t=year&limit=100

Threads:
  {thread_permalink}.json
```

**Rate Control**:
- Fixed delay between requests (default 1500ms)
- Exponential backoff on errors
- Respects Reddit rate limits

**Checkpointing**:
- Track processed subreddits
- Track processed threads
- Resume capability on restart

### 3. Storage Module

**Purpose**: Persist all data in SQLite with full provenance.

**Schema Overview**:
- `subreddits` - Tracked subreddits + metadata
- `posts` - Post content + scores
- `comments` - Full comment tree
- `threads` - Thread aggregates
- `ingestion_runs` - Run history
- `fetch_log` - Request tracking
- `insights` - LLM-extracted insights
- `clusters` - Theme clusters
- `ideas` - Generated SaaS ideas

**Features**:
- Deduplication by Reddit IDs
- Compression for raw JSON blobs
- Full audit trail

### 4. Analysis Module

**Purpose**: Extract structured insights from thread content.

**Components**:
- `signals.ts` - Heuristic signal detection
- `llmSchemas.ts` - Zod schemas for LLM output
- `llmExtract.ts` - LLM-based insight extraction
- `embed.ts` - Text embedding generation
- `cluster.ts` - Theme clustering

**Signal Detection**:
- Pain language: "frustrating", "hate", "waste time", "manual", "broken"
- Intent language: "recommend", "tool", "software", "alternatives", "price"

**LLM Extraction Schema**:
```typescript
{
  pain_points: [{ text: string, evidence_ids: string[] }],
  who_has_problem: string,
  current_workarounds: string[],
  desired_solution: string,
  willingness_to_pay: string | null,
  job_to_be_done: string
}
```

### 5. Idea Generation Module

**Purpose**: Cluster insights and generate ranked SaaS ideas.

**Components**:
- `cluster.ts` - Embedding-based clustering
- `ideaGen.ts` - Idea synthesis from clusters

**Ranking Factors**:
- Frequency (thread count)
- Average pain score
- Average intent score
- Cross-subreddit presence
- Buildability estimate

**Output per Idea**:
- Name + one-liner
- Target persona
- MVP workflow (3-7 steps)
- Must-have features
- Pricing hypothesis
- "Why it wins" angle
- Evidence (3+ thread URLs, 3-8 snippets)
- Score breakdown

### 6. Reporting Module

**Purpose**: Generate final deliverables.

**Outputs**:
- `TOP_20_IDEAS.md` - Human-readable report
- `TOP_20_IDEAS.json` - Machine-readable
- `EVIDENCE/<idea_slug>.md` - Per-idea evidence packs

## Data Flow

```
1. DISCOVERY
   └──▶ 500+ subreddits identified
        └──▶ config/subreddits.txt
        └──▶ config/keywords.txt

2. INGESTION
   └──▶ Fetch listing JSONs
        └──▶ Prioritize by keywords + engagement
             └──▶ Fetch thread JSONs
                  └──▶ Parse comment trees
                       └──▶ Store in SQLite

3. ANALYSIS
   └──▶ Signal extraction (heuristic)
        └──▶ LLM insight extraction
             └──▶ Embedding generation
                  └──▶ Theme clustering

4. GENERATION
   └──▶ Rank clusters
        └──▶ Generate ideas
             └──▶ Attach evidence
                  └──▶ Score and rank

5. REPORTING
   └──▶ TOP_20_IDEAS.md
   └──▶ TOP_20_IDEAS.json
   └──▶ EVIDENCE/*.md
```

## CLI Commands

| Command | Description |
|---------|-------------|
| `npm run gen:niches` | Generate 500+ subreddit list |
| `npm run ingest:subs` | Ingest from subreddit listings |
| `npm run ingest:urls` | Ingest from seed URL list |
| `npm run analyze` | Run signal + LLM analysis |
| `npm run cluster` | Cluster insights into themes |
| `npm run generate` | Generate Top 20 ideas |
| `npm run status` | Show ingestion/analysis status |
| `npm run export` | Export data to JSONL |
| `npm run smoke-test` | Run integration test |

## Configuration

**Environment Variables**:
- `LLM_API_KEY` - API key for LLM provider
- `DB_PATH` - SQLite database path
- `USER_AGENT` - Reddit user agent string
- `MAX_POSTS_PER_SUB_PER_RUN` - Limit per subreddit
- `MAX_THREADS_TOTAL_PER_RUN` - Total thread limit
- `REQUEST_DELAY_MS` - Delay between requests
- `MAX_COMMENTS_PER_THREAD` - Comment cap per thread

**Config Files**:
- `config/subreddits.txt` - List of subreddits to monitor
- `config/seed_urls.txt` - Direct thread URLs (optional)
- `config/keywords.txt` - Intent signal keywords
- `config/run.json` - Runtime configuration
