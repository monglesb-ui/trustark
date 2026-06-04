import "server-only";
import { serverEnv } from "./env";

/**
 * X (구 Twitter) API v2 — Recent Search (Bearer Token, App-only auth).
 *
 * Endpoint:
 *   GET https://api.twitter.com/2/tweets/search/recent?query=...&max_results=10&tweet.fields=created_at
 *
 * Bearer Token 한 개로 호출. Recent search는 최근 7일 트윗.
 * Rate limit: App-level ~450 req/15min (Basic), Free tier 별도 정책.
 *
 * 응답:
 *   {
 *     "data": [{ "id": "...", "text": "...", "created_at": "...", "author_id": "..." }],
 *     "meta": { "result_count": N, "newest_id": "...", "oldest_id": "..." }
 *   }
 */

export type XTweet = {
  id: string;
  text: string;
  created_at?: string;
  author_id?: string;
};

export type XSearchAttempt = {
  query: string;
  httpStatus?: number;
  resultCount?: number;
  durationMs: number;
  error?: string;
};

export type XSearchResult = {
  ok: boolean;
  tweets: XTweet[];
  attempt: XSearchAttempt;
};

const BASE_URL = "https://api.twitter.com/2/tweets/search/recent";

export async function searchXRecent(args: {
  query: string;
  maxResults?: number;
  timeoutMs?: number;
}): Promise<XSearchResult> {
  const started = Date.now();
  const attempt: XSearchAttempt = {
    query: args.query,
    durationMs: 0
  };

  const bearer = serverEnv.xApiKey;
  if (!bearer || !bearer.trim()) {
    attempt.error = "X_API_KEY not configured";
    attempt.durationMs = Date.now() - started;
    return { ok: false, tweets: [], attempt };
  }

  const url = new URL(BASE_URL);
  url.searchParams.set("query", args.query);
  url.searchParams.set("max_results", String(Math.min(Math.max(args.maxResults ?? 10, 10), 100)));
  url.searchParams.set("tweet.fields", "created_at,author_id");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 8_000);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${bearer}`,
        Accept: "application/json"
      }
    });
    attempt.httpStatus = response.status;
    const text = await response.text();
    attempt.durationMs = Date.now() - started;

    if (!response.ok) {
      attempt.error = `HTTP ${response.status} ${text.slice(0, 100)}`.trim();
      return { ok: false, tweets: [], attempt };
    }

    const parsed = JSON.parse(text) as {
      data?: XTweet[];
      meta?: { result_count?: number };
      errors?: Array<{ title?: string; detail?: string }>;
    };

    if (parsed.errors && parsed.errors.length > 0) {
      attempt.error = parsed.errors.map((e) => e.detail ?? e.title ?? "").join("; ").slice(0, 120);
      return { ok: false, tweets: [], attempt };
    }

    const tweets = parsed.data ?? [];
    attempt.resultCount = parsed.meta?.result_count ?? tweets.length;

    return { ok: true, tweets, attempt };
  } catch (error) {
    attempt.durationMs = Date.now() - started;
    if (error instanceof Error && error.name === "AbortError") {
      attempt.error = `timeout after ${args.timeoutMs ?? 8_000}ms`;
    } else {
      attempt.error = error instanceof Error ? error.message : "fetch failed";
    }
    return { ok: false, tweets: [], attempt };
  } finally {
    clearTimeout(timer);
  }
}

export function summarizeXAttempt(attempt: XSearchAttempt): string {
  const parts: string[] = [`X search "${attempt.query.slice(0, 30)}"`];
  if (attempt.httpStatus != null) parts.push(`HTTP ${attempt.httpStatus}`);
  if (attempt.resultCount != null) parts.push(`tweets=${attempt.resultCount}`);
  parts.push(`${attempt.durationMs}ms`);
  if (attempt.error) parts.push(`error=${attempt.error.slice(0, 80)}`);
  return parts.join(" · ");
}
