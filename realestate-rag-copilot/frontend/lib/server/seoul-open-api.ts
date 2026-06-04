import "server-only";
import { serverEnv } from "./env";

/**
 * 서울 열린데이터광장 (data.seoul.go.kr / openapi.seoul.go.kr) 공통 클라이언트.
 *
 * URL 패턴 (path-based authentication):
 *   http://openapi.seoul.go.kr:8088/{KEY}/{TYPE}/{SERVICE}/{START_INDEX}/{END_INDEX}/[optional filters...]
 *
 * 예시 (일반음식점 인허가 1~1000건):
 *   http://openapi.seoul.go.kr:8088/{KEY}/json/LOCALDATA_072404/1/1000/
 *
 * data.go.kr와 다른 점:
 * - serviceKey 쿼리 파라미터가 아닌 URL 경로에 키가 들어감
 * - 호출당 최대 1000건. 페이지네이션 필요.
 * - 응답 envelope이 service명 키를 사용: { LOCALDATA_072404: { list_total_count, RESULT, row[] } }
 */

export type SeoulOpenApiAttempt = {
  service: string;
  urlRedacted: string;
  httpStatus?: number;
  apiResultCode?: string;
  totalCount?: number;
  rowCount?: number;
  durationMs: number;
  error?: string;
};

export type SeoulOpenApiResult<T> = {
  ok: boolean;
  rows: T[];
  totalCount: number;
  rawText?: string;
  attempt: SeoulOpenApiAttempt;
};

export type SeoulOpenApiCallArgs = {
  service: string;
  startIndex?: number;
  endIndex?: number;
  /** 추가 필터 (path segments로 붙음). 예: { CGG_CODE_NM: "강남구" } */
  filters?: Record<string, string | number | undefined>;
  /** 서비스명 외에 사용할 API 키 (기본은 serverEnv.seoulRestaurantApiKey) */
  apiKey?: string;
  /** 기본 15초 */
  timeoutMs?: number;
};

const BASE_URL = "http://openapi.seoul.go.kr:8088";

function redact(value: string): string {
  if (!value) return value;
  if (value.length <= 8) return "***";
  return `${value.slice(0, 4)}***${value.slice(-4)}`;
}

function buildPathUrl({
  service,
  startIndex,
  endIndex,
  filters,
  apiKey
}: {
  service: string;
  startIndex: number;
  endIndex: number;
  filters?: Record<string, string | number | undefined>;
  apiKey: string;
}): { url: string; urlRedacted: string } {
  const safeStart = Math.max(1, Math.floor(startIndex));
  const safeEnd = Math.max(safeStart, Math.floor(endIndex));
  const filterSegments = filters
    ? Object.entries(filters)
        .filter(([, v]) => v !== undefined && v !== null && String(v).trim() !== "")
        .map(([, v]) => encodeURIComponent(String(v).trim()))
    : [];
  const filterPath = filterSegments.length > 0 ? `/${filterSegments.join("/")}` : "/";
  const url = `${BASE_URL}/${encodeURIComponent(apiKey)}/json/${encodeURIComponent(service)}/${safeStart}/${safeEnd}${filterPath}`;
  const urlRedacted = `${BASE_URL}/${redact(apiKey)}/json/${encodeURIComponent(service)}/${safeStart}/${safeEnd}${filterPath}`;
  return { url, urlRedacted };
}

/**
 * 서울 열린데이터광장 호출 1회 (1000건 한도).
 * 1000건 이상이 필요하면 fetchAllPages 사용.
 */
export async function callSeoulOpenApi<T = Record<string, unknown>>(
  args: SeoulOpenApiCallArgs
): Promise<SeoulOpenApiResult<T>> {
  const started = Date.now();
  // 범용 SEOUL_API_KEY 우선, 없으면 일반음식점 전용 키, 그래도 없으면 빈 값(에러 처리)
  const apiKey =
    args.apiKey ?? serverEnv.seoulOpenApiKey ?? serverEnv.seoulRestaurantApiKey;
  const startIndex = args.startIndex ?? 1;
  const endIndex = args.endIndex ?? Math.min(startIndex + 999, startIndex + 999);

  const attempt: SeoulOpenApiAttempt = {
    service: args.service,
    urlRedacted: "",
    durationMs: 0
  };

  if (!apiKey || !apiKey.trim()) {
    attempt.error = "SEOUL_RESTAURANT_API_KEY not configured";
    attempt.durationMs = Date.now() - started;
    return { ok: false, rows: [], totalCount: 0, attempt };
  }

  const { url, urlRedacted } = buildPathUrl({
    service: args.service,
    startIndex,
    endIndex,
    filters: args.filters,
    apiKey
  });
  attempt.urlRedacted = urlRedacted;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 15_000);

  try {
    const response = await fetch(url, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
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

    // RESULT envelope이 root에 있는 에러 케이스
    const rootResult = parsed.RESULT as { CODE?: string; MESSAGE?: string } | undefined;
    if (rootResult?.CODE && rootResult.CODE !== "INFO-000") {
      attempt.apiResultCode = rootResult.CODE;
      attempt.error = rootResult.MESSAGE ?? "Seoul API error";
      return { ok: false, rows: [], totalCount: 0, rawText: text, attempt };
    }

    // 정상 응답: service명 키 하위에 list_total_count / RESULT / row
    const body = parsed[args.service] as
      | {
          list_total_count?: number;
          RESULT?: { CODE?: string; MESSAGE?: string };
          row?: T[];
        }
      | undefined;

    if (!body) {
      attempt.error = `service body '${args.service}' missing in response`;
      return { ok: false, rows: [], totalCount: 0, rawText: text, attempt };
    }

    attempt.apiResultCode = body.RESULT?.CODE;
    attempt.totalCount = body.list_total_count;
    attempt.rowCount = body.row?.length;

    if (body.RESULT?.CODE && body.RESULT.CODE !== "INFO-000") {
      attempt.error = body.RESULT.MESSAGE ?? `Seoul API ${body.RESULT.CODE}`;
      return { ok: false, rows: [], totalCount: 0, rawText: text, attempt };
    }

    return {
      ok: true,
      rows: body.row ?? [],
      totalCount: body.list_total_count ?? 0,
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
    return { ok: false, rows: [], totalCount: 0, attempt };
  } finally {
    clearTimeout(timer);
  }
}

/**
 * 다건 페이지네이션 헬퍼. 최대 maxPages 까지 1000건씩 가져옴.
 * 주의: 큰 데이터셋(수만 건)은 호출 횟수 늘어남. 사전에 totalCount 한 번 조회 후 적정 maxPages 산정 권장.
 */
export async function fetchAllSeoulPages<T = Record<string, unknown>>(
  args: SeoulOpenApiCallArgs & { maxPages?: number; pageSize?: number }
): Promise<SeoulOpenApiResult<T>> {
  const maxPages = args.maxPages ?? 5;
  const pageSize = Math.min(args.pageSize ?? 1000, 1000);
  const collected: T[] = [];
  let lastAttempt: SeoulOpenApiAttempt | null = null;
  let totalCount = 0;

  for (let page = 0; page < maxPages; page += 1) {
    const startIndex = page * pageSize + 1;
    const endIndex = startIndex + pageSize - 1;
    const result = await callSeoulOpenApi<T>({
      ...args,
      startIndex,
      endIndex
    });
    lastAttempt = result.attempt;
    if (!result.ok) return { ...result, rows: collected };
    collected.push(...result.rows);
    totalCount = result.totalCount;
    if (result.rows.length < pageSize) break; // last page
    if (collected.length >= totalCount) break;
  }

  return {
    ok: true,
    rows: collected,
    totalCount,
    attempt: lastAttempt ?? {
      service: args.service,
      urlRedacted: "",
      durationMs: 0
    }
  };
}

export function summarizeSeoulAttempt(attempt: SeoulOpenApiAttempt): string {
  const parts: string[] = [attempt.service];
  if (attempt.httpStatus != null) parts.push(`HTTP ${attempt.httpStatus}`);
  if (attempt.apiResultCode) parts.push(attempt.apiResultCode);
  if (attempt.totalCount != null) parts.push(`total=${attempt.totalCount}`);
  if (attempt.rowCount != null) parts.push(`rows=${attempt.rowCount}`);
  parts.push(`${attempt.durationMs}ms`);
  if (attempt.error) parts.push(`error=${attempt.error.slice(0, 80)}`);
  return parts.join(" · ");
}

// ============================================================================
// 서비스별 typed wrapper — 응답 스키마 알려진 것들
// ============================================================================

/** 서울시 일반음식점 인허가 정보 (LOCALDATA_072404) row 스키마 */
export type SeoulRestaurantRow = {
  OPNSFTEAMCODE: string;        // 개방자치단체코드
  MGTNO: string;                 // 관리번호
  APVPERMYMD?: string;           // 인허가일자 (YYYYMMDD)
  APVCANCELYMD?: string;         // 인허가취소일자
  TRDSTATEGBN?: string;          // 영업상태코드 (01=영업, 03=폐업, ...)
  TRDSTATENM?: string;           // 영업상태명
  DTLSTATEGBN?: string;          // 상세영업상태코드
  DTLSTATENM?: string;           // 상세영업상태명
  DCBYMD?: string;               // 폐업일자
  CLGSTDT?: string;              // 휴업시작일
  CLGENDDT?: string;             // 휴업종료일
  ROPNYMD?: string;              // 재개업일자
  SITETEL?: string;              // 전화번호
  SITEAREA?: string;             // 소재지면적
  SITEPOSTNO?: string;           // 소재지우편번호
  SITEWHLADDR?: string;          // 지번주소
  RDNWHLADDR?: string;           // 도로명주소
  RDNPOSTNO?: string;            // 도로명우편번호
  BPLCNM?: string;               // 사업장명
  LASTMODTS?: string;            // 최종수정일자
  UPDATEGBN?: string;            // 데이터갱신구분
  UPDATEDT?: string;             // 데이터갱신일자
  UPTAENM?: string;              // 업태구분명
  X?: string;                    // 좌표정보(X) - EPSG:5174 TM 중부원점
  Y?: string;                    // 좌표정보(Y)
  LINDJOBGBNNM?: string;         // 위생업태명
  LINDPRTGBNNM?: string;         // 위생업태구분명
  LVSENMLENNTHRTSCRDB?: string;  // 본사여부 등 부가
  TOTFACILSCP?: string;          // 총직원수
  CRTFCGBNNM?: string;           // 인증분야명
  HOMEPAGE?: string;             // 홈페이지
  MULTUSE?: string;              // 다중이용업소여부
  [key: string]: string | undefined;
};

export async function fetchSeoulRestaurants(args: {
  /** 자치구명. 예: "강남구". 미지정 시 서울 전체 */
  district?: string;
  maxPages?: number;
  pageSize?: number;
}): Promise<SeoulOpenApiResult<SeoulRestaurantRow>> {
  return fetchAllSeoulPages<SeoulRestaurantRow>({
    service: "LOCALDATA_072404",
    filters: args.district ? { CGG_CODE_NM: args.district } : undefined,
    maxPages: args.maxPages,
    pageSize: args.pageSize
  });
}

// ============================================================================
// 서울 상권분석 서비스 — 길단위 인구·매출·점포·신규개업·폐업 시계열
// ============================================================================

/**
 * 서울 상권분석 서비스의 service ID들.
 * 일반적으로 분기별(YYYYQ Q=1~4) 시계열 데이터.
 *
 * 사용 예:
 *   callSeoulOpenApi({
 *     service: SEOUL_TRADE_AREA_SERVICES.footTraffic,
 *     filters: { STDR_YYQU_CD: "20241", TRDAR_CD: "3210027" } // 2024년 1분기, 상권코드
 *   })
 */
export const SEOUL_TRADE_AREA_SERVICES = {
  /** 상권배후지 길단위 인구 (분기별) */
  footTraffic: "VwsmTrdarFlpopQq",
  /** 상권 추정매출 (분기별) */
  sales: "VwsmTrdarSelngQq",
  /** 상권 점포 수 (분기별) */
  stores: "VwsmTrdarStorQq",
  /** 상권 신규개업·폐업 (분기별) */
  openClose: "VwsmTrdarOpbizQq",
  /** 상권 종합지수 (분기별) */
  index: "VwsmTrdarIxQq",
  /** 상권배후지 거주인구 (분기별) */
  residentialBackdrop: "VwsmTrdarAsdsQq",
  /** 상권배후지 직장인구 (분기별) */
  workerBackdrop: "VwsmTrdarRepopQq"
} as const;

/** 상권 시계열 row 공통 스키마 (각 service마다 컬럼은 추가 있음) */
export type SeoulTradeAreaRow = {
  STDR_YYQU_CD?: string;     // 기준년분기코드 (예: "20241" = 2024년 1분기)
  TRDAR_SE_CD?: string;       // 상권 구분 코드
  TRDAR_SE_CD_NM?: string;    // 상권 구분명 (예: "발달상권", "전통시장", "골목상권")
  TRDAR_CD?: string;          // 상권 코드
  TRDAR_CD_NM?: string;       // 상권명
  [key: string]: string | undefined;
};

/**
 * 상권 시계열 데이터 조회.
 * 가장 큰 사용 사례:
 * - 좌표 입력 → 인근 상권 코드 추출 → 해당 상권의 매출·인구·점포수 추이 조회
 * - 상권배후지 분석: "이 상가의 손님은 어느 동에서 오는가"
 */
export async function fetchSeoulTradeArea(args: {
  /** SEOUL_TRADE_AREA_SERVICES에서 선택 */
  service: (typeof SEOUL_TRADE_AREA_SERVICES)[keyof typeof SEOUL_TRADE_AREA_SERVICES] | string;
  /** 기준년분기 (예: "20241") — 미지정 시 최신 4개 분기 전체 */
  yyqu?: string;
  /** 상권 코드 (TRDAR_CD) — 알면 좁혀서 조회 */
  trdarCode?: string;
  /** 자치구명 (TRDAR_SE_CD_NM 등으로 필터 가능한 경우) */
  district?: string;
  maxPages?: number;
  pageSize?: number;
}): Promise<SeoulOpenApiResult<SeoulTradeAreaRow>> {
  const filters: Record<string, string | undefined> = {};
  if (args.yyqu) filters.STDR_YYQU_CD = args.yyqu;
  if (args.trdarCode) filters.TRDAR_CD = args.trdarCode;

  return fetchAllSeoulPages<SeoulTradeAreaRow>({
    service: args.service,
    filters,
    maxPages: args.maxPages ?? 3,
    pageSize: args.pageSize ?? 1000
  });
}
