import "server-only";
import { serverEnv } from "./env";

/**
 * 법제처 / ELIS OpenAPI 공통 클라이언트.
 *
 * 자치법규 (ELIS - 행정안전부 자치법규정보시스템):
 *   https://www.elis.go.kr/openApi/searchOrdinances?OC={KEY}&type=JSON&...
 *
 * 법령 (법제처 국가법령정보 OpenAPI):
 *   https://www.law.go.kr/DRF/lawSearch.do?OC={KEY}&target=law&type=JSON&query=...
 *   https://www.law.go.kr/DRF/lawService.do?OC={KEY}&target=law&type=JSON&ID=...
 *
 * 두 시스템 모두 OC(키)를 query parameter로 받음. 같은 헬퍼로 통합 처리.
 *
 * RAG 인덱싱 파이프라인의 입력단:
 *   - 자치구 조례 다운로드 → 조문 단위 chunking → vector store
 *   - 법령 본문 다운로드 → 동일 처리
 */

export type LawApiAttempt = {
  endpoint: string;
  urlRedacted: string;
  httpStatus?: number;
  resultCount?: number;
  durationMs: number;
  error?: string;
};

export type LawApiResult<T> = {
  ok: boolean;
  data: T | null;
  rawText?: string;
  attempt: LawApiAttempt;
};

export type LawApiCallArgs = {
  /** 전체 URL 또는 base + path. 예: "https://www.law.go.kr/DRF/lawSearch.do" */
  url: string;
  /** 추가 query 파라미터 (OC/type은 자동 추가) */
  params?: Record<string, string | number | undefined>;
  /** 응답 타입. 기본 JSON. XML 응답을 원하면 "XML" */
  responseType?: "JSON" | "XML";
  /** OC 외 다른 키 이름을 쓰는 API면 키 이름 지정 (기본 "OC") */
  keyParamName?: string;
  apiKey?: string;
  timeoutMs?: number;
};

function redact(value: string): string {
  if (!value) return value;
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

export async function callLawApi<T = unknown>(args: LawApiCallArgs): Promise<LawApiResult<T>> {
  const started = Date.now();
  const apiKey = args.apiKey ?? serverEnv.lawApiKey;
  const responseType = args.responseType ?? "JSON";
  const keyParamName = args.keyParamName ?? "OC";

  const attempt: LawApiAttempt = {
    endpoint: args.url,
    urlRedacted: "",
    durationMs: 0
  };

  if (!apiKey || !apiKey.trim()) {
    attempt.error = "LAW_API_KEY not configured (or NEXT_PUBLIC_LAW_API_URL — 권장: 서버 전용 LAW_API_KEY로 이전)";
    attempt.durationMs = Date.now() - started;
    return { ok: false, data: null, attempt };
  }

  let urlObj: URL;
  try {
    urlObj = new URL(args.url);
  } catch (error) {
    attempt.error = `invalid url: ${error instanceof Error ? error.message : "parse failed"}`;
    attempt.durationMs = Date.now() - started;
    return { ok: false, data: null, attempt };
  }

  urlObj.searchParams.set(keyParamName, apiKey);
  urlObj.searchParams.set("type", responseType);
  for (const [k, v] of Object.entries(args.params ?? {})) {
    if (v === undefined || v === null) continue;
    const str = String(v).trim();
    if (!str) continue;
    urlObj.searchParams.set(k, str);
  }

  const urlRedacted = urlObj.toString().replace(
    `${keyParamName}=${encodeURIComponent(apiKey)}`,
    `${keyParamName}=${redact(apiKey)}`
  );
  attempt.urlRedacted = urlRedacted;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 15_000);

  try {
    const response = await fetch(urlObj.toString(), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: responseType === "JSON" ? "application/json" : "application/xml" }
    });
    attempt.httpStatus = response.status;
    const text = await response.text();
    attempt.durationMs = Date.now() - started;

    if (!response.ok) {
      attempt.error = `HTTP ${response.status} ${response.statusText || ""}`.trim();
      return { ok: false, data: null, rawText: text, attempt };
    }

    if (responseType === "XML") {
      // XML은 호출자에게 raw 그대로 반환 (별도 파서 필요 시 추후 추가)
      return { ok: true, data: text as unknown as T, rawText: text, attempt };
    }

    try {
      const parsed = JSON.parse(text) as T;
      // 응답에서 totalCnt 또는 totalCount 추출 시도 (대략적 진단용)
      const root = parsed as unknown as Record<string, unknown>;
      const lawSearch = root?.LawSearch as Record<string, unknown> | undefined;
      const total =
        (lawSearch?.totalCnt as number | undefined) ??
        (root?.totalCnt as number | undefined) ??
        (root?.totalCount as number | undefined);
      if (typeof total === "number") attempt.resultCount = total;
      return { ok: true, data: parsed, rawText: text, attempt };
    } catch (error) {
      attempt.error = `JSON parse failed: ${error instanceof Error ? error.message : "unknown"}`;
      return { ok: false, data: null, rawText: text, attempt };
    }
  } catch (error) {
    attempt.durationMs = Date.now() - started;
    if (error instanceof Error && error.name === "AbortError") {
      attempt.error = `timeout after ${args.timeoutMs ?? 15_000}ms`;
    } else {
      attempt.error = error instanceof Error ? error.message : "fetch failed";
    }
    return { ok: false, data: null, attempt };
  } finally {
    clearTimeout(timer);
  }
}

export function summarizeLawAttempt(attempt: LawApiAttempt): string {
  const parts: string[] = [new URL(attempt.endpoint).hostname];
  if (attempt.httpStatus != null) parts.push(`HTTP ${attempt.httpStatus}`);
  if (attempt.resultCount != null) parts.push(`results=${attempt.resultCount}`);
  parts.push(`${attempt.durationMs}ms`);
  if (attempt.error) parts.push(`error=${attempt.error.slice(0, 80)}`);
  return parts.join(" · ");
}

// ============================================================================
// 법제처 국가법령 typed wrappers
// ============================================================================

/** 법령 검색 (목록 조회) */
export async function searchNationalLaws(args: { query: string; display?: number; page?: number }) {
  return callLawApi({
    url: "https://www.law.go.kr/DRF/lawSearch.do",
    params: {
      target: "law",
      query: args.query,
      display: args.display ?? 20,
      page: args.page ?? 1
    }
  });
}

/** 법령 본문 조회 (ID 또는 법령일련번호로) */
export async function fetchNationalLawBody(args: { lawId?: string; lawSerialNo?: string }) {
  return callLawApi({
    url: "https://www.law.go.kr/DRF/lawService.do",
    params: {
      target: "law",
      ID: args.lawId,
      LM: args.lawSerialNo
    }
  });
}

// ============================================================================
// 자치법규 (ELIS) typed wrappers
// ============================================================================

/** 자치법규 검색 (조례·규칙 목록) */
export async function searchOrdinances(args: {
  query: string;
  /** 자치단체명 (예: "서울특별시 강남구") */
  organization?: string;
  display?: number;
  page?: number;
}) {
  return callLawApi({
    url: "https://www.elis.go.kr/openApi/searchOrdinances",
    params: {
      query: args.query,
      organization: args.organization,
      display: args.display ?? 20,
      page: args.page ?? 1
    }
  });
}

/** 자치법규 본문 조회 (ID로) */
export async function fetchOrdinanceBody(args: { ordinanceId: string }) {
  return callLawApi({
    url: "https://www.elis.go.kr/openApi/ordinanceService",
    params: {
      ID: args.ordinanceId
    }
  });
}
