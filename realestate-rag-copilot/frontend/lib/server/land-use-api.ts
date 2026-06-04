import "server-only";
import { serverEnv } from "./env";

/**
 * 국토교통부 토지이용계획정보 (LURIS) OpenAPI (data.go.kr B551023) 공통 클라이언트.
 *
 * Zoning Agent의 핵심 데이터 소스 — 입력 좌표/주소가 어떤 용도지역에 속하는지,
 * 어떤 지구단위계획이 적용되는지, 가능한 업종이 무엇인지 판단.
 *
 * 주요 endpoint:
 * - /B551023/LandUsePlanForUserAPI/getLandUseAttrTabUsCdInfo : 용도지역·지구 (속성표)
 * - /B551023/LandUsePlanForUserAPI/getLandUseAttrTabPnuInfo  : PNU(필지) 기반 조회
 * - /B551023/LandUsePlanForUserAPI/getLandUsePlanSilkLayerInfo : 도시계획시설 도형
 *
 * 인증: data.go.kr 표준 패턴 — query parameter `serviceKey`
 * 입력 기본 키: PNU(필지고유번호 19자리) 또는 주소.
 *   PNU는 VWorld API 또는 별도 변환 필요 — 일단 헬퍼는 PNU 우선 받고, 향후 주소→PNU 변환 wrapper 추가.
 *
 * 응답: data.go.kr 표준 envelope { response: { header, body: { items: {item: [...]}, totalCount } } }
 */

const BASE_URL = "http://apis.data.go.kr/B551023/LandUsePlanForUserAPI";

export type LandUseAttempt = {
  endpoint: string;
  urlRedacted: string;
  httpStatus?: number;
  apiResultMsg?: string;
  totalCount?: number;
  rowCount?: number;
  durationMs: number;
  error?: string;
};

export type LandUseResult<T> = {
  ok: boolean;
  items: T[];
  totalCount: number;
  rawText?: string;
  attempt: LandUseAttempt;
};

export type LandUseCallArgs = {
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

export async function callLandUse<T = Record<string, unknown>>(
  args: LandUseCallArgs
): Promise<LandUseResult<T>> {
  const started = Date.now();
  const apiKey = args.apiKey ?? serverEnv.landUseApiKey;
  const pageNo = args.pageNo ?? 1;
  const numOfRows = Math.min(args.numOfRows ?? 100, 1000);

  const attempt: LandUseAttempt = {
    endpoint: args.endpoint,
    urlRedacted: "",
    durationMs: 0
  };

  if (!apiKey || !apiKey.trim()) {
    attempt.error = "LAND_USE_API_KEY not configured";
    attempt.durationMs = Date.now() - started;
    return { ok: false, items: [], totalCount: 0, attempt };
  }

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

    const envelope =
      (parsed.response as Record<string, unknown> | undefined) ?? parsed;
    const header = envelope.header as
      | { resultMsg?: string; resultCode?: string }
      | undefined;
    const body = envelope.body as
      | { items?: T[] | { item?: T[] | T }; totalCount?: number }
      | undefined;

    if (header?.resultMsg) attempt.apiResultMsg = header.resultMsg;
    if (header?.resultCode && header.resultCode !== "00" && header.resultCode !== "0") {
      attempt.error = header.resultMsg ?? `resultCode=${header.resultCode}`;
      return { ok: false, items: [], totalCount: 0, rawText: text, attempt };
    }

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

export function summarizeLandUseAttempt(attempt: LandUseAttempt): string {
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
// 토지이용계획 row 스키마
// ============================================================================

/** 용도지역·지구 속성표 (getLandUseAttrTabUsCdInfo) row */
export type LandUseAttrRow = {
  /** PNU 필지고유번호 (19자리) */
  pnu?: string;
  /** 지번주소 */
  ldCodeNm?: string;
  /** 시도명 */
  cityName?: string;
  /** 시군구명 */
  guName?: string;
  /** 법정동명 */
  dongName?: string;
  /** 지번 */
  jibun?: string;
  /** 용도지역·지구 코드 */
  useDistrictCode?: string;
  /** 용도지역·지구명 (예: "제1종일반주거지역", "일반상업지역") */
  useDistrictName1?: string;
  /** 용도지역·지구명 (2차) */
  useDistrictName2?: string;
  /** 용도지구 구분 */
  cnflcAt?: string;
  /** 저촉여부 */
  reqstSt?: string;
  /** 면적 */
  registAt?: string;
  [key: string]: string | undefined;
};

// ============================================================================
// Typed wrappers
// ============================================================================

/**
 * PNU 기반 용도지역·지구 조회.
 *
 * @param args.pnu  필지고유번호 19자리 (예: "1168010100100050000")
 *                  - 앞 10자리: 법정동코드
 *                  - 11자리: 대지구분 (1=토지, 2=산)
 *                  - 12~15자리: 본번
 *                  - 16~19자리: 부번
 *
 * PNU 모르면 별도 변환 필요 (VWorld API · 도로명 PNU 등)
 */
export async function fetchLandUseByPnu(args: {
  pnu: string;
  pageNo?: number;
  numOfRows?: number;
}): Promise<LandUseResult<LandUseAttrRow>> {
  return callLandUse<LandUseAttrRow>({
    endpoint: "getLandUseAttrTabPnuInfo",
    params: { pnu: args.pnu },
    pageNo: args.pageNo,
    numOfRows: args.numOfRows ?? 100
  });
}

/**
 * 시군구 코드 + 용도지역 코드로 조회 (지역 통계용).
 */
export async function fetchLandUseByUsCd(args: {
  /** 용도지역 코드 */
  useDistrictCode: string;
  /** 시군구 코드 */
  signguCd?: string;
  pageNo?: number;
  numOfRows?: number;
}): Promise<LandUseResult<LandUseAttrRow>> {
  return callLandUse<LandUseAttrRow>({
    endpoint: "getLandUseAttrTabUsCdInfo",
    params: {
      useDistrictCode: args.useDistrictCode,
      signguCd: args.signguCd
    },
    pageNo: args.pageNo,
    numOfRows: args.numOfRows ?? 100
  });
}

// ============================================================================
// 업종 적합성 룰 — 용도지역명 → 가능 업종
// ============================================================================

/**
 * 용도지역명을 받아 해당 지역에서 가능한 업종 카테고리를 반환.
 * 국토계획법 시행령 별표 2~22 기준의 단순화된 매핑.
 * MVP 규칙 (정확한 행위 제한은 추후 RAG로 보강).
 */
export function getAllowedBusinessTypesForDistrict(districtName: string | undefined): {
  allowed: string[];
  blocked: string[];
  notes: string;
} {
  if (!districtName) {
    return {
      allowed: [],
      blocked: [],
      notes: "용도지역 정보가 없어 판단할 수 없습니다."
    };
  }
  const n = districtName.trim();

  // 전용주거지역
  if (n.includes("전용주거")) {
    return {
      allowed: ["근린생활시설(소규모)"],
      blocked: ["일반음식점", "PC방", "노래방", "학원(대규모)", "상가시설"],
      notes: "전용주거지역은 거주 환경 보호가 우선이라 영업 시설 거의 불가."
    };
  }

  // 일반주거지역 (1·2·3종)
  if (n.includes("일반주거")) {
    const isFirst = n.includes("제1종") || n.includes("1종");
    return {
      allowed: [
        "휴게음식점",
        "1종 근린생활시설",
        "미용실(소규모)",
        isFirst ? "" : "일반음식점(중규모)",
        isFirst ? "" : "학원(중규모)"
      ].filter(Boolean),
      blocked: isFirst
        ? ["일반음식점(대규모)", "PC방", "노래방", "주류 위주 업종"]
        : ["PC방·노래방(시간 규제)", "대형 유흥업소"],
      notes: isFirst
        ? "제1종 일반주거지역. 1종 근린생활시설 위주, 영업시설 규모 제한 큼."
        : "제2·3종 일반주거지역. 중간 규모 영업시설 가능, 일부 시간 규제."
    };
  }

  // 준주거·준공업
  if (n.includes("준주거")) {
    return {
      allowed: ["일반음식점", "휴게음식점", "학원", "근린생활시설", "소매점"],
      blocked: ["대형 유흥업소", "위험물 취급업"],
      notes: "준주거지역은 영업 + 주거가 혼합. 대부분 일반 업종 가능."
    };
  }

  // 상업지역 (중심·일반·근린·유통)
  if (n.includes("상업")) {
    return {
      allowed: [
        "일반음식점",
        "휴게음식점",
        "유흥업소",
        "단란주점",
        "PC방",
        "노래방",
        "학원",
        "병원",
        "근린생활시설"
      ],
      blocked: [],
      notes: "상업지역은 대부분 업종 가능. 단 청소년정화구역·학교 인근 제한은 별도 검토 필요."
    };
  }

  // 공업지역
  if (n.includes("공업")) {
    return {
      allowed: ["창고업", "공장", "제조업"],
      blocked: ["일반음식점(주거 인근)", "학원", "PC방", "노래방"],
      notes: "공업지역은 생산·창고 위주. 일반 상업 업종은 제한적."
    };
  }

  // 녹지지역
  if (n.includes("녹지")) {
    return {
      allowed: ["농업·임업 시설", "체험형 카페(예외)"],
      blocked: ["대부분의 영업시설"],
      notes: "녹지지역은 영업 시설 거의 불가. 예외적 허용만 있음."
    };
  }

  // 관리지역
  if (n.includes("관리지역")) {
    return {
      allowed: ["근린생활시설(제한적)"],
      blocked: ["대부분의 상업·유흥 시설"],
      notes: "관리지역은 비도시 지역. 영업 시설 매우 제한적."
    };
  }

  return {
    allowed: [],
    blocked: [],
    notes: `용도지역 "${n}" — 별도 행위제한 룰 확인 필요. 법규 RAG로 보강 예정.`
  };
}
