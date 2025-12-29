# Reddit Idea Miner - Analysis Method

## Overview

This document describes the methodology for extracting SaaS ideas from Reddit data. The analysis pipeline has three stages: signal extraction (heuristic), insight extraction (LLM), and idea generation (clustering + synthesis).

## Stage 1: Signal Extraction (Heuristic)

### Purpose

Efficiently score all threads for pain language and buying intent without using LLM tokens. This prioritizes which threads deserve deeper LLM analysis.

### Pain Language Detection

**Keywords and phrases that indicate frustration or problems:**

```typescript
const PAIN_KEYWORDS = [
  // Frustration
  'frustrating', 'frustrated', 'annoying', 'annoyed', 'hate',
  'nightmare', 'terrible', 'awful', 'horrible', 'worst',

  // Inefficiency
  'waste time', 'wasting time', 'time consuming', 'takes forever',
  'hours every', 'manual process', 'manually', 'tedious',

  // Broken/stuck
  'broken', 'doesnt work', "doesn't work", 'stopped working',
  'stuck', 'cant figure', "can't figure", 'impossible',

  // Pain verbs
  'struggling', 'suffering', 'dealing with', 'putting up with',
  'tired of', 'sick of', 'fed up',

  // Workarounds
  'workaround', 'hack', 'duct tape', 'band-aid', 'kludge',
  'spreadsheet nightmare', 'excel hell'
];
```

**Pain Score Calculation:**
```
base_score = (keyword_hits * 0.5) + (phrase_matches * 1.0)
normalized = min(base_score, 10)
boosted = normalized * engagement_multiplier
final_pain_score = min(boosted, 10)
```

Where `engagement_multiplier`:
- < 5 comments: 0.5x
- 5-20 comments: 1.0x
- 20-50 comments: 1.2x
- > 50 comments: 1.5x

### Buying Intent Detection

**Keywords that indicate willingness to buy or evaluate solutions:**

```typescript
const INTENT_KEYWORDS = [
  // Direct purchase intent
  'looking for', 'recommend', 'recommendation', 'suggestions',
  'best tool', 'best software', 'best app', 'alternatives to',
  'switch from', 'moving from', 'migrate from',

  // Evaluation
  'anyone use', 'anyone using', 'anyone tried', 'experience with',
  'thoughts on', 'opinions on', 'reviews of', 'compared to',

  // Budget signals
  'worth it', 'worth the price', 'worth paying', 'would pay',
  'I would pay', 'willing to pay', 'budget for', 'pricing',
  'subscription', 'per month', 'per user', 'enterprise',

  // Solution seeking
  'how do you handle', 'how do you manage', 'what do you use',
  'tool for', 'software for', 'app for', 'solution for',
  'automate', 'automation'
];
```

**Intent Score Calculation:**
```
base_score = (keyword_hits * 0.5) + (phrase_matches * 1.0)
normalized = min(base_score, 10)
question_boost = is_question(title) ? 1.2 : 1.0
final_intent_score = min(normalized * question_boost, 10)
```

### Combined Priority Score

```
priority = (pain_score * 0.4) + (intent_score * 0.4) + (engagement * 0.2)
```

Where `engagement` = normalized(log(comments + 1) * upvote_ratio)

### Output: ThreadSignals Record

```typescript
{
  thread_id: "abc123",
  pain_score: 7.5,
  intent_score: 8.2,
  keywords_matched: ["looking for", "frustrating", "waste time"],
  pain_phrases: ["wasting 2 hours every week", "manual nightmare"],
  intent_phrases: ["looking for a tool that", "would pay $50/month"],
  top_evidence_ids: ["comment_456", "comment_789"],
  computed_at: "2024-01-15T10:30:00Z"
}
```

## Stage 2: LLM Insight Extraction

### Purpose

Extract structured insights from high-priority threads using an LLM. The LLM identifies pain points, personas, workarounds, and desired solutions WITH evidence pointers.

### Thread Document Preparation

Before LLM analysis, threads are normalized to a canonical format:

```typescript
interface ThreadDocument {
  thread_id: string;
  subreddit: string;
  title: string;
  selftext: string;
  created_utc: number;
  score: number;
  url: string;

  // Top comments by score (up to 50)
  comments: Array<{
    id: string;
    body: string;
    score: number;
    depth: number;
    is_op: boolean;
  }>;

  // Aggregates
  comment_count: number;
  unique_authors: number;

  // Pre-computed signals
  signals: ThreadSignals;
}
```

### LLM Prompt Design

**System Prompt:**
```
You are an expert product researcher analyzing Reddit discussions to identify
SaaS opportunities. Your job is to extract structured insights from threads.

RULES:
1. ONLY use information present in the thread. Never invent details.
2. Every claim MUST include evidence pointers (comment IDs).
3. If something is unclear, say "unclear" rather than guessing.
4. Focus on pain points that could be solved by software.
5. Be specific - avoid vague statements.
```

**User Prompt:**
```
Analyze this Reddit thread and extract structured insights.

THREAD:
Title: {title}
Subreddit: r/{subreddit}
Post: {selftext}

COMMENTS:
{formatted_comments_with_ids}

Extract:
1. pain_points: What problems are people experiencing? (min 1, include severity)
2. who_has_problem: Who specifically has this problem?
3. current_workarounds: How are they coping today?
4. desired_solution: What would they ideally want?
5. willingness_to_pay: Any hints about budget/pricing? (null if none)
6. job_to_be_done: Frame as "When [situation], I want to [motivation], so I can [outcome]"

For each pain_point, include comment_id(s) as evidence.
Respond in JSON matching this schema: {schema}
```

### Response Validation

All LLM responses are validated with Zod:

```typescript
const InsightSchema = z.object({
  pain_points: z.array(z.object({
    text: z.string().min(10),
    evidence_ids: z.array(z.string()).min(1),
    severity: z.enum(['low', 'medium', 'high'])
  })).min(1),
  who_has_problem: z.string().min(5),
  current_workarounds: z.array(z.string()),
  desired_solution: z.string().min(10),
  willingness_to_pay: z.string().nullable(),
  job_to_be_done: z.string().min(20)
});
```

### Quality Filters

Insights are scored for confidence:
- Evidence count: More evidence IDs = higher confidence
- Specificity: Longer, more detailed responses = higher
- Consistency: Pain points match detected keywords = higher

Low-confidence insights (< 0.5) are flagged for review.

## Stage 3: Clustering & Idea Generation

### Embedding Generation

Pain points and desired solutions are embedded for clustering:

```typescript
// Using OpenAI embeddings (or local alternative)
const embedding = await embed(
  `${insight.pain_points.map(p => p.text).join(' ')} ${insight.desired_solution}`
);
```

### Clustering Algorithm

**Method**: K-means with elbow method for k selection

```typescript
// 1. Compute embeddings for all insights
const embeddings = await Promise.all(insights.map(i => embed(i)));

// 2. Find optimal k using elbow method (range: 15-40)
const optimalK = findElbow(embeddings, 15, 40);

// 3. Run k-means clustering
const clusters = kmeans(embeddings, optimalK);

// 4. Name clusters using most common terms
const namedClusters = clusters.map(c => ({
  ...c,
  name: extractClusterName(c.members),
  description: summarizeCluster(c.members)
}));
```

### Cluster Ranking

Each cluster is scored for SaaS potential:

| Factor | Weight | Calculation |
|--------|--------|-------------|
| Frequency | 25% | log(thread_count) / log(max_threads) |
| Pain Score | 25% | avg(member.pain_score) / 10 |
| Intent Score | 25% | avg(member.intent_score) / 10 |
| Cross-Sub | 15% | unique_subreddits / total_subreddits |
| Buildability | 10% | Heuristic based on solution type |

```
cluster_score = (frequency * 0.25) + (pain * 0.25) + (intent * 0.25)
              + (cross_sub * 0.15) + (buildability * 0.10)
```

### Idea Generation

For top 20 clusters, generate SaaS ideas:

**LLM Prompt:**
```
Based on these clustered pain points from Reddit, generate a SaaS product idea.

CLUSTER: {cluster_name}
PAIN POINTS: {aggregated_pain_points}
PERSONAS: {aggregated_personas}
CURRENT WORKAROUNDS: {aggregated_workarounds}
DESIRED SOLUTIONS: {aggregated_solutions}

Generate:
1. name: Catchy product name
2. one_liner: One sentence pitch (max 200 chars)
3. target_persona: Who exactly is this for?
4. mvp_workflow: 3-7 step workflow for MVP
5. mvp_features: Must-have features list
6. pricing_hypothesis: Simple pricing suggestion
7. why_it_wins: Unique angle/differentiator

Respond in JSON.
```

### Evidence Collection

For each idea, collect evidence:

1. **Thread URLs**: At least 3 source threads
2. **Snippets**: 3-8 short excerpts (< 500 chars each)
3. **Score breakdown**: Pain/Intent/Frequency/Buildability

### Final Scoring

```typescript
interface IdeaScores {
  pain: number;        // Avg pain score of source cluster
  intent: number;      // Avg intent score of source cluster
  frequency: number;   // Thread count score
  buildability: number; // Technical feasibility estimate
  total: number;       // Weighted sum
}

// Weights
const WEIGHTS = {
  pain: 0.30,
  intent: 0.30,
  frequency: 0.25,
  buildability: 0.15
};

idea.scores.total =
  (idea.scores.pain * WEIGHTS.pain) +
  (idea.scores.intent * WEIGHTS.intent) +
  (idea.scores.frequency * WEIGHTS.frequency) +
  (idea.scores.buildability * WEIGHTS.buildability);
```

## Output Artifacts

### TOP_20_IDEAS.md

Markdown report with:
- Executive summary
- Ranked list of 20 ideas
- For each idea:
  - Name, one-liner, persona
  - MVP workflow
  - Features
  - Pricing
  - Why it wins
  - Evidence links
  - Score breakdown

### TOP_20_IDEAS.json

```json
{
  "generated_at": "2024-01-15T10:30:00Z",
  "model_used": "gpt-4o-mini",
  "threads_analyzed": 1500,
  "clusters_generated": 35,
  "ideas": [
    {
      "rank": 1,
      "name": "ReconcileBot",
      "one_liner": "...",
      "target_persona": "...",
      "mvp_workflow": ["..."],
      "mvp_features": ["..."],
      "pricing_hypothesis": "...",
      "why_it_wins": "...",
      "evidence_urls": ["..."],
      "evidence_snippets": [{"comment_id": "...", "text": "...", "thread_url": "..."}],
      "scores": {"pain": 8.5, "intent": 7.2, "frequency": 6.8, "buildability": 8.0, "total": 7.7}
    }
  ]
}
```

### EVIDENCE/{idea_slug}.md

Per-idea evidence pack:
- Source cluster details
- All supporting threads (titles + URLs)
- All evidence snippets with context
- Raw pain points from cluster

## Quality Assurance

### Validation Checks

1. **Schema compliance**: All JSON validated with Zod
2. **Evidence verification**: All comment_ids exist in database
3. **Minimum thresholds**: Ideas must have >= 3 evidence URLs
4. **Deduplication**: Similar ideas merged before final ranking

### Human Review Flags

Ideas are flagged if:
- Confidence < 0.6
- Evidence from < 3 unique subreddits
- Buildability < 5 (complex/risky)
- Similar to existing well-known products

## Performance Targets

| Metric | Target |
|--------|--------|
| Threads analyzed per hour | 500+ |
| LLM cost per 1000 threads | < $5 |
| Clustering time (10k insights) | < 5 min |
| End-to-end (500 threads → ideas) | < 30 min |
