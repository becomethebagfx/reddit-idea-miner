// Parse Reddit thread JSON into structured data

import type { Post, Comment } from '../store/models.js';
import { cleanRedditMarkdown } from '../utils/text.js';
import { log } from '../utils/log.js';
import { getConfig } from '../config/loadConfig.js';

// Reddit JSON types (partial, what we need)
interface RedditPost {
  id: string;
  subreddit: string;
  title: string;
  selftext: string;
  author: string;
  score: number;
  upvote_ratio: number;
  num_comments: number;
  created_utc: number;
  permalink: string;
  url: string;
  is_self: boolean;
  link_flair_text?: string;
}

interface RedditComment {
  id: string;
  parent_id: string;
  author: string;
  body: string;
  score: number;
  created_utc: number;
  is_submitter: boolean;
  replies?: {
    data: {
      children: Array<{ kind: string; data: RedditComment }>;
    };
  } | string;
}

interface RedditListing {
  kind: string;
  data: {
    children: Array<{ kind: string; data: RedditPost | RedditComment }>;
    after?: string;
    before?: string;
  };
}

export interface ParsedThread {
  post: Post;
  comments: Comment[];
  truncated: boolean;
  maxDepth: number;
  uniqueAuthors: Set<string>;
}

/**
 * Parse a Reddit thread JSON response
 */
export function parseThreadJson(json: unknown[]): ParsedThread {
  if (!Array.isArray(json) || json.length < 2) {
    throw new Error('Invalid thread JSON format');
  }

  const config = getConfig();
  const maxComments = config.run.maxCommentsPerThread ?? config.env.MAX_COMMENTS_PER_THREAD;

  // First element is the post listing
  const postListing = json[0] as RedditListing;
  const postData = postListing.data.children[0];

  if (!postData || postData.kind !== 't3') {
    throw new Error('No post found in thread JSON');
  }

  const rawPost = postData.data as RedditPost;
  const post: Post = {
    id: rawPost.id,
    subreddit: rawPost.subreddit,
    title: cleanRedditMarkdown(rawPost.title),
    selftext: cleanRedditMarkdown(rawPost.selftext || ''),
    author: rawPost.author || '[deleted]',
    score: rawPost.score,
    upvote_ratio: rawPost.upvote_ratio,
    num_comments: rawPost.num_comments,
    created_utc: rawPost.created_utc,
    permalink: rawPost.permalink,
    url: rawPost.url,
    is_self: rawPost.is_self,
    link_flair_text: rawPost.link_flair_text || null,
  };

  // Second element is the comments listing
  const commentsListing = json[1] as RedditListing;
  const comments: Comment[] = [];
  const uniqueAuthors = new Set<string>();
  let maxDepth = 0;
  let truncated = false;

  // Add post author
  if (post.author !== '[deleted]') {
    uniqueAuthors.add(post.author);
  }

  // Recursively parse comment tree
  function parseCommentTree(
    children: Array<{ kind: string; data: RedditComment }>,
    depth: number
  ): void {
    for (const child of children) {
      // Check if we've hit the limit
      if (comments.length >= maxComments) {
        truncated = true;
        return;
      }

      // Skip non-comment items (like "more" links)
      if (child.kind !== 't1') continue;

      const rawComment = child.data;

      // Skip deleted/removed comments with no content
      if (rawComment.body === '[deleted]' || rawComment.body === '[removed]') {
        continue;
      }

      const comment: Comment = {
        id: rawComment.id,
        post_id: post.id,
        parent_id: rawComment.parent_id.replace(/^t[13]_/, ''), // Remove type prefix
        depth,
        author: rawComment.author || '[deleted]',
        body: cleanRedditMarkdown(rawComment.body),
        score: rawComment.score,
        created_utc: rawComment.created_utc,
        is_submitter: rawComment.is_submitter,
      };

      comments.push(comment);

      if (comment.author !== '[deleted]') {
        uniqueAuthors.add(comment.author);
      }

      if (depth > maxDepth) {
        maxDepth = depth;
      }

      // Recursively parse replies
      if (
        rawComment.replies &&
        typeof rawComment.replies === 'object' &&
        rawComment.replies.data?.children
      ) {
        parseCommentTree(rawComment.replies.data.children, depth + 1);
      }
    }
  }

  if (commentsListing.data.children) {
    parseCommentTree(commentsListing.data.children as Array<{ kind: string; data: RedditComment }>, 0);
  }

  // Sort comments by score for truncation (keep best comments)
  if (truncated) {
    comments.sort((a, b) => b.score - a.score);
    log.warn('PARSE', `Thread ${post.id} truncated at ${maxComments} comments`);
  }

  return {
    post,
    comments,
    truncated,
    maxDepth,
    uniqueAuthors,
  };
}

/**
 * Parse a Reddit listing JSON response (for subreddit listings)
 */
export function parseListingJson(json: RedditListing): {
  posts: Post[];
  after: string | null;
} {
  const posts: Post[] = [];

  for (const child of json.data.children) {
    if (child.kind !== 't3') continue;

    const rawPost = child.data as RedditPost;
    posts.push({
      id: rawPost.id,
      subreddit: rawPost.subreddit,
      title: cleanRedditMarkdown(rawPost.title),
      selftext: cleanRedditMarkdown(rawPost.selftext || ''),
      author: rawPost.author || '[deleted]',
      score: rawPost.score,
      upvote_ratio: rawPost.upvote_ratio,
      num_comments: rawPost.num_comments,
      created_utc: rawPost.created_utc,
      permalink: rawPost.permalink,
      url: rawPost.url,
      is_self: rawPost.is_self,
      link_flair_text: rawPost.link_flair_text || null,
    });
  }

  return {
    posts,
    after: json.data.after || null,
  };
}

export default {
  parseThreadJson,
  parseListingJson,
};
