import "server-only";
import { serverEnv } from "./env";

const NAVER_SEARCH_BASE_URL = "https://openapi.naver.com/v1/search";
const SEARCH_TIMEOUT_MS = 4500;

export type NaverSearchItem = {
  title: string;
  link: string;
  description: string;
  pubDate?: string;
};

export type NaverSearchResult = {
  source: "naver-search:web" | "naver-search:news";
  query: string;
  total: number;
  items: NaverSearchItem[];
  diagnostics: {
    hasClientId: boolean;
    hasClientSecret: boolean;
    httpStatus?: number;
    error?: string;
  };
};

type RawSearchItem = {
  title?: string;
  link?: string;
  description?: string;
  pubDate?: string;
};

type RawSearchResponse = {
  total?: number;
  items?: RawSearchItem[];
  errorMessage?: string;
  errorCode?: string;
};

function decodeHtml(value: string) {
  return value
    .replace(/<[^>]+>/g, "")
    .replace(/&quot;/g, "\"")
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function emptyResult(
  source: NaverSearchResult["source"],
  query: string,
  error?: string,
  httpStatus?: number
): NaverSearchResult {
  return {
    source,
    query,
    total: 0,
    items: [],
    diagnostics: {
      hasClientId: Boolean(serverEnv.naverSearchClientId),
      hasClientSecret: Boolean(serverEnv.naverSearchClientSecret),
      httpStatus,
      error
    }
  };
}

async function requestNaverSearch(
  source: NaverSearchResult["source"],
  endpoint: "webkr" | "news",
  query: string,
  display: number
): Promise<NaverSearchResult> {
  const clientId = serverEnv.naverSearchClientId;
  const clientSecret = serverEnv.naverSearchClientSecret;

  if (!clientId || !clientSecret) {
    return emptyResult(source, query, "missing NAVER_SEARCH_CLIENT_ID or NAVER_SEARCH_CLIENT_SECRET");
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), SEARCH_TIMEOUT_MS);
  const url = new URL(`${NAVER_SEARCH_BASE_URL}/${endpoint}.json`);
  url.searchParams.set("query", query);
  url.searchParams.set("display", String(display));
  url.searchParams.set("start", "1");
  url.searchParams.set("sort", endpoint === "news" ? "date" : "sim");

  try {
    const response = await fetch(url, {
      headers: {
        "X-Naver-Client-Id": clientId,
        "X-Naver-Client-Secret": clientSecret
      },
      cache: "no-store",
      signal: controller.signal
    });
    const json = (await response.json().catch(() => ({}))) as RawSearchResponse;

    if (!response.ok) {
      return emptyResult(
        source,
        query,
        json.errorMessage ?? json.errorCode ?? response.statusText,
        response.status
      );
    }

    return {
      source,
      query,
      total: json.total ?? 0,
      items: (json.items ?? []).map((item) => ({
        title: decodeHtml(item.title ?? ""),
        link: item.link ?? "",
        description: decodeHtml(item.description ?? ""),
        pubDate: item.pubDate
      })),
      diagnostics: {
        hasClientId: true,
        hasClientSecret: true,
        httpStatus: response.status
      }
    };
  } catch (error) {
    return emptyResult(
      source,
      query,
      error instanceof Error ? error.message : "Naver Search request failed"
    );
  } finally {
    clearTimeout(timeout);
  }
}

export function searchNaverWeb(query: string, display = 5) {
  return requestNaverSearch("naver-search:web", "webkr", query, display);
}

export function searchNaverNews(query: string, display = 3) {
  return requestNaverSearch("naver-search:news", "news", query, display);
}
