import "server-only";
import { serverEnv } from "./env";

/**
 * 학교알리미 / NEIS Open API (open.neis.go.kr) 공통 클라이언트.
 *
 * URL 패턴 (query-based authentication):
 *   https://open.neis.go.kr/hub/{ENDPOINT}?KEY={API_KEY}&Type=json&pIndex=1&pSize=1000&...
 *
 * 주요 엔드포인트:
 * - schoolInfo            : 학교 기본정보 (좌표·주소·학생수)
 * - schoolMajorinfo       : 학교 전공정보
 * - elsTimetable          : 초등 시간표
 * - mealServiceDietInfo   : 학교 식단정보
 *
 * 응답 envelope:
 *   {
 *     "{ENDPOINT}": [
 *       { "head": [{ "list_total_count": N }, { "RESULT": { "CODE": "INFO-000", ... } }] },
 *       { "row": [...] }
 *     ]
 *   }
 *
 * 또는 에러 시:
 *   { "RESULT": { "CODE": "INFO-200", "MESSAGE": "해당하는 데이터가 없습니다." } }
 */

export type NeisAttempt = {
  endpoint: string;
  urlRedacted: string;
  httpStatus?: number;
  apiResultCode?: string;
  totalCount?: number;
  rowCount?: number;
  durationMs: number;
  error?: string;
};

export type NeisResult<T> = {
  ok: boolean;
  rows: T[];
  totalCount: number;
  rawText?: string;
  attempt: NeisAttempt;
};

export type NeisCallArgs = {
  endpoint: string;
  /** 쿼리 파라미터 (KEY/Type/pIndex/pSize 제외 — 자동 추가) */
  params?: Record<string, string | number | undefined>;
  pIndex?: number;
  pSize?: number;
  apiKey?: string;
  timeoutMs?: number;
};

const BASE_URL = "https://open.neis.go.kr/hub";

function redact(value: string): string {
  if (!value) return value;
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

export async function callNeis<T = Record<string, unknown>>(args: NeisCallArgs): Promise<NeisResult<T>> {
  const started = Date.now();
  const apiKey = args.apiKey ?? serverEnv.neisApiKey;
  const pIndex = args.pIndex ?? 1;
  const pSize = Math.min(args.pSize ?? 1000, 1000);

  const attempt: NeisAttempt = {
    endpoint: args.endpoint,
    urlRedacted: "",
    durationMs: 0
  };

  if (!apiKey || !apiKey.trim()) {
    attempt.error = "NEIS_API_KEY not configured";
    attempt.durationMs = Date.now() - started;
    return { ok: false, rows: [], totalCount: 0, attempt };
  }

  const url = new URL(`${BASE_URL}/${encodeURIComponent(args.endpoint)}`);
  url.searchParams.set("KEY", apiKey);
  url.searchParams.set("Type", "json");
  url.searchParams.set("pIndex", String(pIndex));
  url.searchParams.set("pSize", String(pSize));
  for (const [k, v] of Object.entries(args.params ?? {})) {
    if (v === undefined || v === null) continue;
    const str = String(v).trim();
    if (!str) continue;
    url.searchParams.set(k, str);
  }

  const urlRedacted = url.toString().replace(`KEY=${encodeURIComponent(apiKey)}`, `KEY=${redact(apiKey)}`);
  attempt.urlRedacted = urlRedacted;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 15_000);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: { Accept: "application/json" }
    });
    attempt.httpStatus = response.status;
    const text = await response.text();
    attempt.durationMs = Date.now() - started;

    if (!response.ok) {
      attempt.error = `HTTP ${response.status} ${response.statusText || ""}`.trim();
      return { ok: false, rows: [], totalCount: 0, rawText: text, attempt };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      attempt.error = `JSON parse failed: ${error instanceof Error ? error.message : "unknown"}`;
      return { ok: false, rows: [], totalCount: 0, rawText: text, attempt };
    }

    // 에러 응답: root에 RESULT
    const rootResult = parsed.RESULT as { CODE?: string; MESSAGE?: string } | undefined;
    if (rootResult?.CODE) {
      attempt.apiResultCode = rootResult.CODE;
      if (rootResult.CODE !== "INFO-000") {
        attempt.error = rootResult.MESSAGE ?? "NEIS API error";
        return { ok: false, rows: [], totalCount: 0, rawText: text, attempt };
      }
    }

    // 정상 응답: endpoint 키 하위에 [{head: [...]}, {row: [...]}]
    const body = parsed[args.endpoint] as Array<Record<string, unknown>> | undefined;
    if (!Array.isArray(body)) {
      attempt.error = `endpoint body '${args.endpoint}' missing or not array`;
      return { ok: false, rows: [], totalCount: 0, rawText: text, attempt };
    }

    // head section 파싱
    const headEntry = body.find((entry) => Array.isArray((entry as { head?: unknown }).head));
    const head = (headEntry as { head?: Array<Record<string, unknown>> } | undefined)?.head ?? [];
    const totalCountEntry = head.find((h) => typeof (h as { list_total_count?: number }).list_total_count === "number");
    const totalCount = (totalCountEntry as { list_total_count?: number } | undefined)?.list_total_count ?? 0;
    const headResultEntry = head.find((h) => (h as { RESULT?: unknown }).RESULT);
    const headResult = (headResultEntry as { RESULT?: { CODE?: string; MESSAGE?: string } } | undefined)?.RESULT;
    attempt.apiResultCode = headResult?.CODE ?? attempt.apiResultCode;
    attempt.totalCount = totalCount;

    // row section
    const rowEntry = body.find((entry) => Array.isArray((entry as { row?: unknown }).row));
    const rows = ((rowEntry as { row?: T[] } | undefined)?.row ?? []) as T[];
    attempt.rowCount = rows.length;

    return { ok: true, rows, totalCount, rawText: text, attempt };
  } catch (error) {
    attempt.durationMs = Date.now() - started;
    if (error instanceof Error && error.name === "AbortError") {
      attempt.error = `timeout after ${args.timeoutMs ?? 15_000}ms`;
    } else {
      attempt.error = error instanceof Error ? error.message : "fetch failed";
    }
    return { ok: false, rows: [], totalCount: 0, attempt };
  } finally {
    clearTimeout(timer);
  }
}

export function summarizeNeisAttempt(attempt: NeisAttempt): string {
  const parts: string[] = [attempt.endpoint];
  if (attempt.httpStatus != null) parts.push(`HTTP ${attempt.httpStatus}`);
  if (attempt.apiResultCode) parts.push(attempt.apiResultCode);
  if (attempt.totalCount != null) parts.push(`total=${attempt.totalCount}`);
  if (attempt.rowCount != null) parts.push(`rows=${attempt.rowCount}`);
  parts.push(`${attempt.durationMs}ms`);
  if (attempt.error) parts.push(`error=${attempt.error.slice(0, 80)}`);
  return parts.join(" · ");
}

// ============================================================================
// 학교 기본정보 typed wrapper (schoolInfo)
// ============================================================================

/** 학교 기본정보 row 스키마 (open.neis.go.kr/hub/schoolInfo) */
export type SchoolInfoRow = {
  ATPT_OFCDC_SC_CODE?: string;     // 시도교육청코드 (예: B10 = 서울)
  ATPT_OFCDC_SC_NM?: string;       // 시도교육청명
  SD_SCHUL_CODE?: string;          // 표준학교코드
  SCHUL_NM?: string;               // 학교명
  ENG_SCHUL_NM?: string;
  SCHUL_KND_SC_NM?: string;        // 학교종류 (초등학교/중학교/고등학교/...)
  LCTN_SC_NM?: string;             // 시도명
  JU_ORG_NM?: string;              // 관할조직명
  FOND_SC_NM?: string;             // 설립명 (공립/사립)
  ORG_RDNZC?: string;              // 도로명우편번호
  ORG_RDNMA?: string;              // 도로명주소
  ORG_RDNDA?: string;              // 도로명상세주소
  ORG_TELNO?: string;              // 전화번호
  HMPG_ADRES?: string;             // 홈페이지
  COEDU_SC_NM?: string;            // 남녀공학구분
  ORG_FAXNO?: string;
  HS_SC_NM?: string;               // 고등학교구분
  INDST_SPECL_CCCCL_EXST_YN?: string;
  HS_GNRL_BUSNS_SC_NM?: string;
  SPCLY_PURPS_HS_ORD_NM?: string;
  ENE_BFE_SEHF_SC_NM?: string;
  DGHT_SC_NM?: string;
  FOND_YMD?: string;                // 설립일자 (YYYYMMDD)
  FOAS_MEMRD?: string;              // 기념일
  LOAD_DTM?: string;                // 적재일시
  [key: string]: string | undefined;
};

/**
 * 학교 기본정보 조회.
 * 시도교육청 코드별로 분기 (서울=B10, 부산=C10, 대구=D10, ...). 전체 시도 약 17개.
 * 페이지네이션 자동: pSize=1000 × pIndex 반복.
 */
export async function fetchSchools(args: {
  /** 시도교육청 코드. 미지정 시 서울(B10) 기본 */
  officeCode?: string;
  /** 학교명 필터 (부분 일치) */
  schoolName?: string;
  /** 학교종류 (초등학교/중학교/고등학교 등) */
  schoolKind?: string;
  /** 최대 페이지 수. 기본 5 (5,000건까지) */
  maxPages?: number;
}): Promise<NeisResult<SchoolInfoRow>> {
  const officeCode = args.officeCode ?? "B10"; // 서울
  const maxPages = args.maxPages ?? 5;
  const pSize = 1000;

  const collected: SchoolInfoRow[] = [];
  let lastAttempt: NeisAttempt | null = null;
  let totalCount = 0;

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await callNeis<SchoolInfoRow>({
      endpoint: "schoolInfo",
      pIndex: page,
      pSize,
      params: {
        ATPT_OFCDC_SC_CODE: officeCode,
        SCHUL_NM: args.schoolName,
        SCHUL_KND_SC_NM: args.schoolKind
      }
    });
    lastAttempt = result.attempt;
    if (!result.ok) return { ...result, rows: collected };
    collected.push(...result.rows);
    totalCount = result.totalCount;
    if (result.rows.length < pSize) break;
    if (collected.length >= totalCount) break;
  }

  return {
    ok: true,
    rows: collected,
    totalCount,
    attempt: lastAttempt ?? {
      endpoint: "schoolInfo",
      urlRedacted: "",
      durationMs: 0
    }
  };
}
