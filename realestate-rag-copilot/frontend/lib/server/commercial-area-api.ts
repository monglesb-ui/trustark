import "server-only";
import { serverEnv } from "./env";

/**
 * 소상공인진흥공단 상권정보 OpenAPI (data.go.kr B553077) 공통 클라이언트.
 *
 * 핵심 endpoint:
 * - /api/open/sdsc2/storeListInRadius  : 반경 내 상가업소 (좌표+업종+반경)
 * - /api/open/sdsc2/storeListInUpjong  : 업종별 상가업소
 * - /api/open/sdsc2/storeListInArea    : 행정구역 내 상가업소
 * - /api/open/sdsc2/storeOne           : 상가업소 단건
 * - /api/open/sdsc2/largeUpjongList    : 업종 대분류
 * - /api/open/sdsc2/middleUpjongList   : 업종 중분류
 * - /api/open/sdsc2/smallUpjongList    : 업종 소분류
 *
 * 인증: query parameter `serviceKey` (data.go.kr 표준 패턴이지만 키는 별도 발급)
 *
 * 응답 envelope (data.go.kr 표준):
 *   {
 *     "header": { "resultMsg": "NORMAL_SERVICE", ... },
 *     "body": {
 *       "items": [ ... ],
 *       "totalCount": N,
 *       "pageNo": 1,
 *       "numOfRows": 1000
 *     }
 *   }
 *
 * 또는 (구버전):
 *   {
 *     "response": {
 *       "header": {...},
 *       "body": { "items": {...}, "totalCount": N, ... }
 *     }
 *   }
 */

const BASE_URL = "http://apis.data.go.kr/B553077/api/open/sdsc2";

export type CommercialAttempt = {
  endpoint: string;
  urlRedacted: string;
  httpStatus?: number;
  apiResultMsg?: string;
  totalCount?: number;
  rowCount?: number;
  durationMs: number;
  error?: string;
};

export type CommercialResult<T> = {
  ok: boolean;
  items: T[];
  totalCount: number;
  rawText?: string;
  attempt: CommercialAttempt;
};

export type CommercialCallArgs = {
  endpoint: string;
  params?: Record<string, string | number | undefined>;
  pageNo?: number;
  numOfRows?: number;
  apiKey?: string;
  timeoutMs?: number;
};

function redact(value: string): string {
  if (!value) return value;
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

export async function callCommercial<T = Record<string, unknown>>(
  args: CommercialCallArgs
): Promise<CommercialResult<T>> {
  const started = Date.now();
  const apiKey = args.apiKey ?? serverEnv.commercialApiKey;
  const pageNo = args.pageNo ?? 1;
  const numOfRows = Math.min(args.numOfRows ?? 1000, 1000);

  const attempt: CommercialAttempt = {
    endpoint: args.endpoint,
    urlRedacted: "",
    durationMs: 0
  };

  if (!apiKey || !apiKey.trim()) {
    attempt.error = "COMMERCIAL_API_KEY not configured";
    attempt.durationMs = Date.now() - started;
    return { ok: false, items: [], totalCount: 0, attempt };
  }

  // data.go.kr 키는 decoded/encoded 두 형태. URLSearchParams.set은 자동 percent-encoding
  // → 키가 decoded면 그대로 set, encoded면 마지막에 raw append (이중 인코딩 방지)
  // 일단 decoded 가정 후 호출자가 issue 시 수정.
  const url = new URL(`${BASE_URL}/${args.endpoint}`);
  url.searchParams.set("serviceKey", apiKey);
  url.searchParams.set("type", "json");
  url.searchParams.set("pageNo", String(pageNo));
  url.searchParams.set("numOfRows", String(numOfRows));
  for (const [k, v] of Object.entries(args.params ?? {})) {
    if (v === undefined || v === null) continue;
    const str = String(v).trim();
    if (!str) continue;
    url.searchParams.set(k, str);
  }

  const urlRedacted = url.toString().replace(
    `serviceKey=${encodeURIComponent(apiKey)}`,
    `serviceKey=${redact(apiKey)}`
  );
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
      return { ok: false, items: [], totalCount: 0, rawText: text, attempt };
    }

    let parsed: Record<string, unknown>;
    try {
      parsed = JSON.parse(text);
    } catch (error) {
      attempt.error = `JSON parse failed: ${error instanceof Error ? error.message : "unknown"}`;
      return { ok: false, items: [], totalCount: 0, rawText: text, attempt };
    }

    // 두 가지 envelope 모두 지원
    // 1) { header, body: { items, totalCount, ... } }
    // 2) { response: { header, body: { items, totalCount, ... } } }
    const root = parsed as Record<string, unknown>;
    const envelope = (root.response as Record<string, unknown> | undefined) ?? root;

    const header = envelope.header as
      | { resultMsg?: string; resultCode?: string }
      | undefined;
    const body = envelope.body as
      | { items?: T[] | { item?: T[] }; totalCount?: number; pageNo?: number; numOfRows?: number }
      | undefined;

    if (header?.resultMsg) attempt.apiResultMsg = header.resultMsg;

    if (!body) {
      attempt.error = "response.body missing";
      return { ok: false, items: [], totalCount: 0, rawText: text, attempt };
    }

    let items: T[] = [];
    if (Array.isArray(body.items)) {
      items = body.items;
    } else if (body.items && typeof body.items === "object") {
      const wrapped = (body.items as { item?: T[] | T }).item;
      if (Array.isArray(wrapped)) items = wrapped;
      else if (wrapped) items = [wrapped as T];
    }

    attempt.totalCount = body.totalCount;
    attempt.rowCount = items.length;

    // data.go.kr resultMsg는 서비스별로 NORMAL_SERVICE / NORMAL SERVICE / NORMAL SERVICE. 등으로 다양함
    // → "NORMAL"로 시작하면 정상으로 간주 (대소문자 무시 + 공백/언더스코어 정규화)
    const normalizedMsg = header?.resultMsg?.replace(/[_.\s]+/g, " ").trim().toUpperCase();
    const isNormal = !normalizedMsg || normalizedMsg.startsWith("NORMAL");
    if (!isNormal) {
      attempt.error = header?.resultMsg;
      return { ok: false, items, totalCount: body.totalCount ?? 0, rawText: text, attempt };
    }

    return {
      ok: true,
      items,
      totalCount: body.totalCount ?? items.length,
      rawText: text,
      attempt
    };
  } catch (error) {
    attempt.durationMs = Date.now() - started;
    if (error instanceof Error && error.name === "AbortError") {
      attempt.error = `timeout after ${args.timeoutMs ?? 15_000}ms`;
    } else {
      attempt.error = error instanceof Error ? error.message : "fetch failed";
    }
    return { ok: false, items: [], totalCount: 0, attempt };
  } finally {
    clearTimeout(timer);
  }
}

export function summarizeCommercialAttempt(attempt: CommercialAttempt): string {
  const parts: string[] = [attempt.endpoint];
  if (attempt.httpStatus != null) parts.push(`HTTP ${attempt.httpStatus}`);
  if (attempt.apiResultMsg) parts.push(attempt.apiResultMsg);
  if (attempt.totalCount != null) parts.push(`total=${attempt.totalCount}`);
  if (attempt.rowCount != null) parts.push(`rows=${attempt.rowCount}`);
  parts.push(`${attempt.durationMs}ms`);
  if (attempt.error) parts.push(`error=${attempt.error.slice(0, 80)}`);
  return parts.join(" · ");
}

// ============================================================================
// 상가업소 row 스키마 (storeListInRadius 등 공통)
// ============================================================================

export type CommercialStoreRow = {
  bizesId?: string;            // 상가업소번호
  bizesNm?: string;            // 상호명
  brchNm?: string;             // 지점명
  indsLclsCd?: string;         // 표준산업분류 대분류 코드
  indsLclsNm?: string;         // 대분류명
  indsMclsCd?: string;         // 중분류 코드
  indsMclsNm?: string;         // 중분류명
  indsSclsCd?: string;         // 소분류 코드
  indsSclsNm?: string;         // 소분류명
  ksicCd?: string;             // 한국표준산업분류
  ksicNm?: string;
  ctprvnCd?: string;           // 시도 코드
  ctprvnNm?: string;           // 시도명
  signguCd?: string;           // 시군구 코드
  signguNm?: string;           // 시군구명
  adongCd?: string;            // 행정동 코드
  adongNm?: string;            // 행정동명
  ldongCd?: string;            // 법정동 코드
  ldongNm?: string;            // 법정동명
  lnoCd?: string;              // 지번 코드
  plotSctCd?: string;          // 대지구분
  plotSctNm?: string;
  lnoMnno?: string;            // 지번 본번
  lnoSlno?: string;            // 지번 부번
  lnoAdr?: string;             // 지번 주소
  rdnmCd?: string;             // 도로명 코드
  rdnm?: string;               // 도로명
  bldMnno?: string;            // 건물 본번
  bldSlno?: string;            // 건물 부번
  bldMngNo?: string;           // 건물 관리번호
  bldNm?: string;              // 건물명
  rdnmAdr?: string;            // 도로명 주소
  oldZipcd?: string;
  newZipcd?: string;
  dongNo?: string;             // 동 정보
  flrNo?: string;              // 층 정보
  hoNo?: string;               // 호 정보
  lon?: string;                // 경도 (WGS84)
  lat?: string;                // 위도 (WGS84)
  [key: string]: string | undefined;
};

// ============================================================================
// Typed wrappers
// ============================================================================

/**
 * 반경 내 상가업소 조회 — 동종업종 밀집도 분석의 핵심 도구.
 *
 * @param args.cx       경도 (WGS84) - 예: 127.0276
 * @param args.cy       위도 (WGS84) - 예: 37.5028
 * @param args.radius   반경 (미터). 최대 1000m
 * @param args.indsLcls 업종 대분류 코드 (선택)
 * @param args.indsMcls 업종 중분류 코드 (선택)
 * @param args.indsScls 업종 소분류 코드 (선택)
 */
export async function fetchStoresInRadius(args: {
  cx: number;
  cy: number;
  radius: number;
  indsLcls?: string;
  indsMcls?: string;
  indsScls?: string;
  pageNo?: number;
  numOfRows?: number;
}): Promise<CommercialResult<CommercialStoreRow>> {
  return callCommercial<CommercialStoreRow>({
    endpoint: "storeListInRadius",
    params: {
      cx: args.cx.toFixed(6),
      cy: args.cy.toFixed(6),
      radius: Math.min(args.radius, 1000),
      indsLclsCd: args.indsLcls,
      indsMclsCd: args.indsMcls,
      indsSclsCd: args.indsScls
    },
    pageNo: args.pageNo,
    numOfRows: args.numOfRows ?? 1000
  });
}

/** 업종별 상가업소 조회 (시도·시군구 단위) */
export async function fetchStoresByUpjong(args: {
  indsLcls?: string;
  indsMcls?: string;
  indsScls?: string;
  /** 시도 코드 (예: "11" = 서울) */
  ctprvnCd?: string;
  /** 시군구 코드 (예: "11680" = 강남구) */
  signguCd?: string;
  /** 행정동 코드 */
  adongCd?: string;
  pageNo?: number;
  numOfRows?: number;
}): Promise<CommercialResult<CommercialStoreRow>> {
  return callCommercial<CommercialStoreRow>({
    endpoint: "storeListInUpjong",
    params: {
      indsLclsCd: args.indsLcls,
      indsMclsCd: args.indsMcls,
      indsSclsCd: args.indsScls,
      ctprvnCd: args.ctprvnCd,
      signguCd: args.signguCd,
      adongCd: args.adongCd
    },
    pageNo: args.pageNo,
    numOfRows: args.numOfRows ?? 1000
  });
}

/** 업종 대분류 목록 */
export async function fetchLargeUpjongList() {
  return callCommercial({
    endpoint: "largeUpjongList",
    numOfRows: 100
  });
}

/** 업종 중분류 목록 (대분류 코드로 필터) */
export async function fetchMiddleUpjongList(args: { indsLcls: string }) {
  return callCommercial({
    endpoint: "middleUpjongList",
    params: { indsLclsCd: args.indsLcls },
    numOfRows: 500
  });
}

/** 업종 소분류 목록 (대+중분류 코드로 필터) */
export async function fetchSmallUpjongList(args: { indsLcls: string; indsMcls: string }) {
  return callCommercial({
    endpoint: "smallUpjongList",
    params: {
      indsLclsCd: args.indsLcls,
      indsMclsCd: args.indsMcls
    },
    numOfRows: 1000
  });
}
