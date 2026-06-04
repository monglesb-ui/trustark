import type { AnalyzeRequest, NaverContextFinding } from "@/lib/types";
import { searchNaverNews, searchNaverWeb, type NaverSearchResult } from "@/lib/server/naver-search";
import { searchXRecent } from "@/lib/server/x-search";
import type { TraceRecorder } from "../trace";

const AGENT = "Search Context Agent" as const;

const BUSINESS_TYPE_LABELS: Record<string, string> = {
  restaurant: "음식점",
  cafe: "카페",
  beauty: "미용실",
  academy: "학원",
  pc_room: "PC방",
  karaoke: "노래방",
  other: ""
};

function buildQueries(payload: AnalyzeRequest): { web: string; news: string } {
  const address = payload.address ?? "";
  const sigunguMatch = address.match(/([가-힣]+(?:특별자치시|광역시|시|군|구))/);
  const sigungu = sigunguMatch?.[1] ?? "";
  // 도로명 (예: "목동로", "테헤란로", "목동로 25길" → 25길 제외하고 "목동로"만)
  const roadMatch = address.match(/([가-힣A-Za-z0-9]+로)\s*\d+/);
  const road = roadMatch?.[1] ?? "";
  // 동 (법정동/행정동: "신정동", "역삼동" 등)
  const dongMatch = address.match(/([가-힣]+동)(?:\s|\d|$)/);
  const dong = dongMatch?.[1] ?? "";

  const businessLabel = payload.business_type ? BUSINESS_TYPE_LABELS[payload.business_type] : "";
  const purposeLabel =
    payload.commercial_purpose === "lease_out"
      ? "상가 임대"
      : payload.commercial_purpose === "buy_and_use"
        ? "상가 매수"
        : payload.commercial_purpose === "business_location"
          ? "상권"
          : "";

  const topic = businessLabel || purposeLabel || "상권";
  // 우선순위: 도로명 > 동 > 자치구. 더 정밀한 위치 키워드일수록 결과가 입력 주소와 직접 연관.
  const locationToken = road || dong || sigungu;
  // 뉴스는 자치구 + 토픽 (너무 정밀하면 결과 0건)
  return {
    web: `${locationToken} ${topic}`.trim(),
    news: `${sigungu} ${topic}`.trim()
  };
}

function topItems(result: NaverSearchResult, limit = 4): NaverContextFinding["items"] {
  return result.items.slice(0, limit).map((it) => ({
    title: it.title.replace(/<[^>]+>/g, ""),
    link: it.link,
    description: it.description.replace(/<[^>]+>/g, ""),
    pubDate: it.pubDate,
    kind: result.source === "naver-search:news" ? "news" : "web"
  }));
}

export async function runLocalContextLightAgent({
  payload,
  trace
}: {
  payload: AnalyzeRequest;
  trace: TraceRecorder;
}): Promise<NaverContextFinding | null> {
  const queries = buildQueries(payload);
  const inputSummary = `web="${queries.web}" news="${queries.news}"`;

  try {
    const [web, news, xResult] = await Promise.all([
      trace.run(
        AGENT,
        "naverWebSearch",
        queries.web,
        () => searchNaverWeb(queries.web),
        (result) => ({
          status: result.items.length > 0 ? "success" : "missing",
          outputSummary: `Web ${result.total}건 검색 · ${result.items.length}건 노출`
        })
      ),
      trace.run(
        AGENT,
        "naverNewsSearch",
        queries.news,
        () => searchNaverNews(queries.news),
        (result) => ({
          status: result.items.length > 0 ? "success" : "missing",
          outputSummary: `News ${result.total}건 검색 · ${result.items.length}건 노출`
        })
      ),
      trace.run(
        AGENT,
        "xRecentSearch",
        queries.web,
        () => searchXRecent({ query: `${queries.web} -is:retweet lang:ko`, maxResults: 10 }),
        (result) => ({
          status: result.ok && result.tweets.length > 0 ? "success" : result.ok ? "missing" : "failed",
          outputSummary: result.ok
            ? `X tweets=${result.tweets.length} (${result.attempt.resultCount ?? 0}건)`
            : `X 실패 · ${result.attempt.error?.slice(0, 80) ?? "unknown"}`
        })
      )
    ]);

    const items = [
      ...topItems(web, 3),
      ...topItems(news, 3),
      ...xResult.tweets.slice(0, 3).map((t) => ({
        title: t.text.replace(/\s+/g, " ").slice(0, 80),
        link: `https://twitter.com/i/web/status/${t.id}`,
        description: t.text,
        pubDate: t.created_at,
        kind: "x" as const
      }))
    ];
    if (items.length === 0) {
      trace.record(AGENT, "buildLocalContext", inputSummary, "검색 결과 없음", "missing");
      return null;
    }

    const finding: NaverContextFinding = {
      query_web: queries.web,
      query_news: queries.news,
      total_web: web.total,
      total_news: news.total,
      items,
      source: "Naver 검색 API (web + news)",
      note: `${queries.web} 키워드 기준 최근 검색·뉴스 결과 ${items.length}건 요약. 동네 분위기·이슈 파악에 활용하세요.`
    };
    return finding;
  } catch (error) {
    const message = error instanceof Error ? error.message : "naver search 실패";
    trace.record(AGENT, "buildLocalContext", inputSummary, message.slice(0, 120), "failed");
    return null;
  }
}
