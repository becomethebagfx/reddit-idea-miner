// LLM schemas and prompts for insight extraction

import { z } from 'zod';

// Schema for LLM insight extraction response
export const InsightExtractionResponseSchema = z.object({
  pain_points: z.array(z.object({
    text: z.string().min(10, 'Pain point must be at least 10 characters'),
    evidence_ids: z.array(z.string()).min(1, 'Must have at least one evidence ID'),
    severity: z.enum(['low', 'medium', 'high']).default('medium'),
  })).min(1, 'Must have at least one pain point'),
  who_has_problem: z.string().min(5, 'Must specify who has the problem'),
  current_workarounds: z.array(z.string()).default([]),
  desired_solution: z.string().min(10, 'Must describe desired solution'),
  willingness_to_pay: z.string().nullable(),
  job_to_be_done: z.string().min(20, 'JTBD must be at least 20 characters'),
});

export type InsightExtractionResponse = z.infer<typeof InsightExtractionResponseSchema>;

// Schema for idea generation response
export const IdeaGenerationResponseSchema = z.object({
  name: z.string().min(1, 'Product name is required'),
  one_liner: z.string().min(10).max(200, 'One-liner must be under 200 chars'),
  target_persona: z.string().min(1, 'Target persona is required'),
  mvp_workflow: z.array(z.string()).min(3).max(7, 'MVP workflow needs 3-7 steps'),
  mvp_features: z.array(z.string()).min(3, 'Need at least 3 MVP features'),
  pricing_hypothesis: z.string().min(1, 'Pricing hypothesis is required'),
  why_it_wins: z.string().min(1, 'Must explain why it wins'),
});

export type IdeaGenerationResponse = z.infer<typeof IdeaGenerationResponseSchema>;

// System prompt for insight extraction
export const INSIGHT_EXTRACTION_SYSTEM_PROMPT = `You are an expert product researcher analyzing Reddit discussions to identify SaaS opportunities. Your job is to extract structured insights from threads.

RULES:
1. ONLY use information present in the thread. Never invent details.
2. Every pain point MUST include evidence_ids pointing to specific comments.
3. If something is unclear, say "unclear" rather than guessing.
4. Focus on pain points that could be solved by software.
5. Be specific - avoid vague statements like "users are frustrated".
6. For severity: low = minor annoyance, medium = significant friction, high = blocking/critical issue.

OUTPUT FORMAT:
Return valid JSON matching this schema:
{
  "pain_points": [
    {
      "text": "Description of the pain point",
      "evidence_ids": ["comment_id1", "comment_id2"],
      "severity": "low" | "medium" | "high"
    }
  ],
  "who_has_problem": "Specific persona description (e.g., 'Small business accountants using QuickBooks')",
  "current_workarounds": ["How they cope today"],
  "desired_solution": "What they ideally want",
  "willingness_to_pay": "Any hints about budget/pricing (or null if none)",
  "job_to_be_done": "When [situation], I want to [motivation], so I can [outcome]"
}`;

// User prompt template for insight extraction
export function buildInsightExtractionPrompt(
  title: string,
  subreddit: string,
  selftext: string,
  comments: Array<{ id: string; body: string; score: number; depth: number; is_op: boolean }>
): string {
  const formattedComments = comments
    .map((c) => {
      const indent = '  '.repeat(Math.min(c.depth, 2));
      const opTag = c.is_op ? ' [OP]' : '';
      const scoreTag = `[score: ${c.score}]`;
      const body = c.body.length > 500 ? c.body.slice(0, 500) + '...' : c.body;
      return `${indent}[${c.id}]${opTag} ${scoreTag}\n${indent}${body}`;
    })
    .join('\n\n');

  return `Analyze this Reddit thread and extract structured insights about pain points and SaaS opportunities.

THREAD:
Title: ${title}
Subreddit: r/${subreddit}

POST BODY:
${selftext || '(No body text)'}

COMMENTS (with IDs for evidence):
${formattedComments || '(No comments)'}

Extract:
1. pain_points: What problems are people experiencing? Include comment IDs as evidence.
2. who_has_problem: Who specifically has this problem? Be specific about the persona.
3. current_workarounds: How are they coping today?
4. desired_solution: What would they ideally want?
5. willingness_to_pay: Any hints about budget/pricing? (null if none found)
6. job_to_be_done: Frame as "When [situation], I want to [motivation], so I can [outcome]"

Respond with valid JSON only, no other text.`;
}

// System prompt for idea generation
export const IDEA_GENERATION_SYSTEM_PROMPT = `You are an expert product strategist generating SaaS product ideas from clustered pain points.

RULES:
1. Create a focused, buildable MVP - not a platform or suite.
2. Name should be catchy and memorable (2-3 words max).
3. One-liner must be compelling and under 200 characters.
4. MVP workflow should be 3-7 concrete steps.
5. Features should be must-haves only, no nice-to-haves.
6. Pricing should be simple and specific (e.g., "$29/month per user").
7. "Why it wins" should be a unique angle, not generic benefits.

OUTPUT FORMAT:
Return valid JSON matching this schema:
{
  "name": "ProductName",
  "one_liner": "One sentence value prop under 200 chars",
  "target_persona": "Specific persona description",
  "mvp_workflow": ["Step 1", "Step 2", ...],
  "mvp_features": ["Feature 1", "Feature 2", ...],
  "pricing_hypothesis": "$X/month structure",
  "why_it_wins": "Unique competitive angle"
}`;

// User prompt template for idea generation
export function buildIdeaGenerationPrompt(
  clusterName: string,
  painPoints: string[],
  personas: string[],
  workarounds: string[],
  desiredSolutions: string[]
): string {
  return `Based on these clustered pain points from Reddit, generate a focused SaaS product idea.

CLUSTER: ${clusterName}

PAIN POINTS:
${painPoints.map((p, i) => `${i + 1}. ${p}`).join('\n')}

PERSONAS WHO HAVE THIS PROBLEM:
${personas.map((p, i) => `${i + 1}. ${p}`).join('\n')}

CURRENT WORKAROUNDS:
${workarounds.map((w, i) => `${i + 1}. ${w}`).join('\n')}

DESIRED SOLUTIONS:
${desiredSolutions.map((s, i) => `${i + 1}. ${s}`).join('\n')}

Generate a focused SaaS product idea that addresses these pain points. The product should be:
- Buildable as an MVP in weeks, not months
- Clearly differentiated from existing solutions
- Priced appropriately for the target market

Respond with valid JSON only, no other text.`;
}

export default {
  InsightExtractionResponseSchema,
  IdeaGenerationResponseSchema,
  INSIGHT_EXTRACTION_SYSTEM_PROMPT,
  IDEA_GENERATION_SYSTEM_PROMPT,
  buildInsightExtractionPrompt,
  buildIdeaGenerationPrompt,
};
