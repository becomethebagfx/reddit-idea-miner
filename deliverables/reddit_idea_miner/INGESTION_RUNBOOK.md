# Reddit Idea Miner - Ingestion Runbook

## Overview

This runbook covers how to configure and run the Reddit data ingestion pipeline. The system fetches data via public JSON endpoints and stores it in SQLite for analysis.

## Prerequisites

1. Node.js 20+ installed
2. Dependencies installed: `npm install`
3. Environment configured: Copy `.env.example` to `.env` and configure
4. Config files prepared (see below)

## Configuration

### Environment Variables

```bash
# Required
LLM_API_KEY=sk-your-key          # For LLM analysis (OpenAI or compatible)
USER_AGENT="reddit-idea-miner/0.1 (contact: your@email.com)"  # REQUIRED

# Optional (with defaults)
DB_PATH=./data/reddit.db
MAX_POSTS_PER_SUB_PER_RUN=50
MAX_THREADS_TOTAL_PER_RUN=1000
REQUEST_DELAY_MS=1500
MAX_COMMENTS_PER_THREAD=5000
```

### Config Files

#### config/subreddits.txt
One subreddit per line (without r/ prefix):
```
accounting
bookkeeping
smallbusiness
sysadmin
msp
```

#### config/seed_urls.txt (Optional)
Direct thread URLs to fetch:
```
https://www.reddit.com/r/accounting/comments/abc123/title_here/
https://www.reddit.com/r/sysadmin/comments/xyz789/another_thread/
```

#### config/keywords.txt
Intent signal keywords (one per line):
```
looking for software
tool for
recommendation
alternatives
I would pay
pricing
```

#### config/run.json
Runtime configuration:
```json
{
  "maxPostsPerSubPerRun": 50,
  "maxThreadsTotalPerRun": 1000,
  "requestDelayMs": 1500,
  "maxCommentsPerThread": 5000,
  "listingTypes": ["new", "top_month", "top_year"],
  "priorityKeywords": true,
  "skipAnalyzed": true
}
```

## Ingestion Modes

### Mode A: Subreddit Sampling

Fetches listing JSONs from subreddits and selects high-priority posts.

```bash
# Basic run
npm run ingest:subs

# With options
npm run ingest:subs -- --days 90 --maxThreads 2000

# Available options:
#   --days N          Only posts from last N days (default: no limit)
#   --maxThreads N    Override max threads limit
#   --subs file.txt   Use alternate subreddit file
#   --dry-run         Show what would be fetched without fetching
```

**Process:**
1. For each subreddit in `config/subreddits.txt`:
   - Fetch `/r/{sub}/new.json?limit=100`
   - Fetch `/r/{sub}/top.json?t=month&limit=100`
   - Fetch `/r/{sub}/top.json?t=year&limit=100`
2. Score and prioritize posts by:
   - Keyword hits in title/selftext
   - Comment count
   - Score
3. Select top `MAX_POSTS_PER_SUB_PER_RUN` posts per subreddit
4. Fetch full thread JSON for each selected post
5. Parse and store comment trees

### Mode B: Direct URL Ingestion

Fetches specific threads from provided URLs.

```bash
# Basic run
npm run ingest:urls

# With options
npm run ingest:urls -- --file custom_urls.txt
```

**Process:**
1. Read URLs from `config/seed_urls.txt`
2. For each URL:
   - Append `.json` to get thread data
   - Fetch and parse
3. Store all posts and comments

## Rate Control

The ingestion system implements careful rate limiting:

| Parameter | Default | Description |
|-----------|---------|-------------|
| `REQUEST_DELAY_MS` | 1500 | Minimum ms between requests |
| Exponential backoff | 2x | Multiplier on transient errors |
| Max retries | 3 | Before marking request failed |
| Concurrent requests | 1 | Sequential processing |

### Error Handling

- **429 Too Many Requests**: Back off exponentially, resume after delay
- **5xx Server Error**: Retry with backoff
- **4xx Client Error**: Log and skip (except 429)
- **Network Error**: Retry with backoff

## Checkpointing

The system tracks progress to enable safe resume:

### Ingestion Runs Table

Each run creates a record:
```sql
SELECT * FROM ingestion_runs ORDER BY started_at DESC LIMIT 1;
```

### Fetch Log

Every request is logged:
```sql
SELECT url, status_code, fetched_at
FROM fetch_log
WHERE fetched_at > datetime('now', '-1 day');
```

### Resume Behavior

If interrupted:
1. Re-running the same command continues from where it stopped
2. Already-fetched threads are skipped (dedupe by post_id)
3. Partially-fetched subreddits resume from next listing

## Commands Reference

### Generate Niche List

```bash
npm run gen:niches
# Outputs:
#   - deliverables/reddit_idea_miner/NICHE_LIST_500.md
#   - config/subreddits.txt
#   - config/keywords.txt
```

### Subreddit Ingestion

```bash
# Full run with defaults
npm run ingest:subs

# Limited test run
npm run ingest:subs -- --maxThreads 10 --dry-run

# Last 30 days only
npm run ingest:subs -- --days 30
```

### URL Ingestion

```bash
# From default file
npm run ingest:urls

# From custom file
npm run ingest:urls -- --file my_urls.txt
```

### Check Status

```bash
npm run status
# Shows:
#   - Total subreddits tracked
#   - Total posts fetched
#   - Total comments fetched
#   - Threads pending analysis
#   - Last run status
```

### Export Data

```bash
# Export all threads to JSONL
npm run export -- --format jsonl

# Export specific subreddit
npm run export -- --subreddit accounting --format jsonl
```

## Monitoring

### Progress Indicators

During ingestion, the CLI shows:
```
[INGEST] Processing subreddit: accounting (1/500)
[FETCH]  Listing: /r/accounting/new.json (15 posts)
[FETCH]  Listing: /r/accounting/top.json?t=month (12 posts)
[THREAD] Fetching: abc123 (142 comments)
[STORE]  Saved 142 comments for abc123
[PROGRESS] 23/1000 threads | 4521 comments | 12m elapsed
```

### Database Queries

```sql
-- Posts per subreddit
SELECT subreddit, COUNT(*) as posts
FROM posts GROUP BY subreddit ORDER BY posts DESC;

-- Comments per day
SELECT date(fetched_at) as day, COUNT(*) as comments
FROM comments GROUP BY day ORDER BY day DESC;

-- Threads with most comments
SELECT t.id, p.title, t.comment_count
FROM threads t JOIN posts p ON t.post_id = p.id
ORDER BY t.comment_count DESC LIMIT 10;

-- Threads pending analysis
SELECT COUNT(*) FROM threads WHERE analyzed_at IS NULL;
```

## Troubleshooting

### Common Issues

**Issue**: "Rate limited by Reddit"
```
Solution: Increase REQUEST_DELAY_MS to 2000+
Check: Are you using a proper USER_AGENT?
```

**Issue**: "Database locked"
```
Solution: Only one ingestion process at a time
Check: ps aux | grep "ingest"
```

**Issue**: "Thread truncated"
```
Info: Thread exceeded MAX_COMMENTS_PER_THREAD
Action: Top comments by score are kept; truncated flag set
```

**Issue**: "Subreddit not found"
```
Check: Verify subreddit exists and is public
Action: Remove from config/subreddits.txt
```

### Reset & Rebuild

```bash
# Clear all data (start fresh)
rm -rf data/reddit.db

# Clear fetch log only (force re-fetch)
sqlite3 data/reddit.db "DELETE FROM fetch_log"

# Clear specific subreddit
sqlite3 data/reddit.db "DELETE FROM comments WHERE post_id IN (SELECT id FROM posts WHERE subreddit='accounting')"
sqlite3 data/reddit.db "DELETE FROM posts WHERE subreddit='accounting'"
```

## Tuning Guide

### For Broader Coverage

```json
{
  "maxPostsPerSubPerRun": 100,
  "maxThreadsTotalPerRun": 5000,
  "listingTypes": ["new", "top_month", "top_year", "hot"]
}
```

### For Faster Iteration

```json
{
  "maxPostsPerSubPerRun": 10,
  "maxThreadsTotalPerRun": 100,
  "requestDelayMs": 1000
}
```

### For Deep Analysis

```json
{
  "maxCommentsPerThread": 10000,
  "priorityKeywords": true,
  "skipAnalyzed": false
}
```

## Best Practices

1. **Start small**: Test with 5 subreddits, 10 threads first
2. **Monitor rate limits**: Watch for 429 errors
3. **Use proper User-Agent**: Include contact info
4. **Schedule off-peak**: Run during low-traffic hours
5. **Backup database**: Before major runs
6. **Check quality**: Review fetched data periodically
