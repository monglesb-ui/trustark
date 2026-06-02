import type { AnalyzeRequest, AnalyzeResponse, DataSourceStatus, EvidenceItem } from "@/lib/types";
import { getPropertyTypeLabel } from "@/lib/property-types";
import { searchNaverNews, searchNaverWeb, type NaverSearchResult } from "@/lib/server/naver-search";
import type { TraceRecorder } from "../trace";

const SEARCH_CONTEXT_AGENT = "Search Context Agent" as const;

export const searchContextAgentAllowedTools = ["naverWebSearch", "naverNewsSearch"] as const;

type SearchContextTool = (typeof searchContextAgentAllowedTools)[number];

type SearchContextResult = {
  web: NaverSearchResult;
  news: NaverSearchResult;
};

function assertAllowedTool(tool: string): asserts tool is SearchContextTool {
  if (!searchContextAgentAllowedTools.includes(tool as SearchContextTool)) {
    throw new Error(`${SEARCH_CONTEXT_AGENT} cannot call tool: ${tool}`);
  }
}

function upsertStatus(statuses: DataSourceStatus[] | undefined, status: DataSourceStatus) {
  const current = statuses ?? [];
  const existingIndex = current.findIndex((item) => item.id === status.id);
  if (existingIndex < 0) return [...current, status];
  return current.map((item, index) => (index === existingIndex ? status : item));
}

function buildQueries(payload: AnalyzeRequest) {
  const propertyType = getPropertyTypeLabel(payload.property_type);
  const contractKeyword =
    payload.contract_type === "sale" ? "매매 시세" : payload.contract_type === "monthly" ? "월세 전세 시세" : "전세 시세";

  return {
    web: `${payload.address} ${propertyType} ${contractKeyword}`,
    news: `${payload.address} ${propertyType} 부동산 전세 매매`
  };
}

function summarize(result: NaverSearchResult) {
  if (!result.diagnostics.hasClientId || !result.diagnostics.hasClientSecret) {
    return {
      status: "missing" as const,
      outputSummary: "네이버 검색 키가 없어 외부 검색을 건너뜀"
    };
  }

  if (result.items.length === 0) {
    const error = result.diagnostics.error ? ` · ${result.diagnostics.error.slice(0, 80)}` : "";
    return {
      status: result.diagnostics.httpStatus && result.diagnostics.httpStatus >= 400 ? "failed" as const : "missing" as const,
      outputSummary: `검색 결과 없음${error}`
    };
  }

  return {
    status: "success" as const,
    outputSummary: `검색 결과 ${result.items.length}건 · ${result.items.slice(0, 2).map((item) => item.title).join(" / ")}`
  };
}

function searchEvidence(result: NaverSearchResult): EvidenceItem[] {
  return result.items.slice(0, 2).map((item) => ({
    title: `외부 검색 참고: ${item.title}`,
    description: item.description || "네이버 검색 결과에서 수집한 공개 웹 문서 후보입니다.",
    source: `${result.source}:${item.link}`
  }));
}

function applySearchContext(report: AnalyzeResponse, result: SearchContextResult) {
  const webCount = result.web.items.length;
  const newsCount = result.news.items.length;
  const total = webCount + newsCount;
  const failed = [result.web, result.news].filter(
    (item) => item.diagnostics.httpStatus && item.diagnostics.httpStatus >= 400
  );
  const missingKeys = !result.web.diagnostics.hasClientId || !result.web.diagnostics.hasClientSecret;
  const status: DataSourceStatus =
    total > 0
      ? {
          id: "search-context",
          label: "외부 검색 맥락",
          status: "success",
          detail: `네이버 검색 후보 ${total}건 · 웹 ${webCount}건 · 뉴스 ${newsCount}건`
        }
      : {
          id: "search-context",
          label: "외부 검색 맥락",
          status: missingKeys ? "missing" : failed.length > 0 ? "failed" : "missing",
          detail: missingKeys
            ? "NAVER_SEARCH_CLIENT_ID/SECRET 미설정"
            : `네이버 검색 결과 없음${failed[0]?.diagnostics.error ? ` · ${failed[0].diagnostics.error.slice(0, 60)}` : ""}`
        };

  return {
    ...report,
    data_statuses: upsertStatus(report.data_statuses, status),
    evidence: [...searchEvidence(result.web), ...searchEvidence(result.news), ...report.evidence],
    sections: {
      ...report.sections,
      confirmed_facts:
        total > 0
          ? [`네이버 검색 기반 외부 참고 후보: ${total}건`, ...report.sections.confirmed_facts]
          : report.sections.confirmed_facts,
      assumptions: [
        "네이버 검색 결과는 공식 실거래가 API가 아니므로 가격 판단의 보조 맥락으로만 사용합니다.",
        ...report.sections.assumptions
      ],
      unverified_items:
        total > 0
          ? report.sections.unverified_items
          : ["네이버 검색 기반 외부 맥락 미확보", ...report.sections.unverified_items]
    }
  } satisfies AnalyzeResponse;
}

export async function runSearchContextAgent({
  report,
  payload,
  trace
}: {
  report: AnalyzeResponse;
  payload: AnalyzeRequest;
  trace: TraceRecorder;
}) {
  const queries = buildQueries(payload);
  const webTool = "naverWebSearch";
  const newsTool = "naverNewsSearch";
  assertAllowedTool(webTool);
  assertAllowedTool(newsTool);

  const [web, news] = await Promise.all([
    trace.run(
      SEARCH_CONTEXT_AGENT,
      webTool,
      queries.web,
      () => searchNaverWeb(queries.web),
      summarize
    ),
    trace.run(
      SEARCH_CONTEXT_AGENT,
      newsTool,
      queries.news,
      () => searchNaverNews(queries.news),
      summarize
    )
  ]);

  return applySearchContext(report, { web, news });
}
