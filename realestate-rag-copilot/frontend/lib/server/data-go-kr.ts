import "server-only";
import { serverEnv } from "./env";

/**
 * 공공데이터포털(data.go.kr) 공통 클라이언트.
 *
 * - serviceKey의 encoded/decoded 두 형태 모두 처리 (decoded 우선, 없으면 encoded fallback)
 * - 다른 query 파라미터는 URLSearchParams로 안전 인코딩
 * - 표준 응답 envelope(`response.header.resultCode`, `response.body.totalCount/items`) 자동 파싱
 * - 호출별 진단(httpStatus, apiResultCode, itemCount, durationMs)을 DataGoKrAttempt로 노출 →
 *   AgentTrace의 outputSummary나 data_statuses.detail에 그대로 사용 가능
 *
 * 사용 예 (LOCALDATA 시군구 인허가 조회):
 *   const result = await callDataGoKrJson<LocalDataResponse>({
 *     endpointName: "LOCALDATA 시군구",
 *     url: "https://api.localdata.go.kr/platform/rest/TO0/openDataApi",
 *     params: { localCode: "1144000", opnSvcId: "07_24_04_P", pageIndex: 1, pageSize: 50 }
 *   });
 *   if (!result.ok) console.warn(summarizeAttempt(result.attempt));
 */

export type DataGoKrKeyType = "encoded" | "decoded";

export type DataGoKrAttempt = {
  endpointName: string;
  /** serviceKey 값이 마스킹된 최종 URL (로깅/진단 안전) */
  urlRedacted: string;
  httpStatus?: number;
  /** data.go.kr 표준 envelope의 result code 예: "INFO-000", "00" */
  apiResultCode?: string;
  /** envelope body.totalCount 또는 items.item 배열 길이 */
  itemCount?: number;
  /** 호출 소요 시간 (ms) */
  durationMs: number;
  keyType?: DataGoKrKeyType;
  /** 실패 사유 (HTTP error, timeout, parse error 등) */
  error?: string;
};

export type DataGoKrResult<T> = {
  ok: boolean;
  data: T | null;
  /** 원본 응답 텍스트 (디버그용). 파싱 실패 시에도 채워짐. */
  rawText?: string;
  attempt: DataGoKrAttempt;
};

export type DataGoKrCallArgs = {
  /** 진단·로그용 사람 친화 라벨 (예: "LOCALDATA 시군구") */
  endpointName: string;
  /** ?를 포함하지 않는 baseUrl (params 인자에서 query 구성) */
  url: string;
  /** 추가 query 파라미터. undefined/null/빈 문자열은 무시. */
  params?: Record<string, string | number | boolean | null | undefined>;
  /** 기본 10초 */
  timeoutMs?: number;
  /** true(기본)면 decoded 키 우선, 없으면 encoded로 fallback */
  preferDecoded?: boolean;
  /** 기본은 response.ok. 일부 API는 200 외 다른 코드를 정상으로 사용하므로 명시 가능. */
  acceptStatusCodes?: number[];
  /** Accept 헤더 강제 지정 (예: "application/json"). 기본은 미설정. */
  acceptHeader?: string;
};

function redactUrl(url: string): string {
  return url.replace(/serviceKey=[^&]+/gi, "serviceKey=***");
}

/**
 * 환경변수에서 사용 가능한 serviceKey 하나를 선택해 반환.
 * 둘 다 비어 있으면 null.
 */
export function resolveServiceKey(preferDecoded = true): { value: string; type: DataGoKrKeyType } | null {
  const decoded = serverEnv.dataGoKrServiceKeyDecoded?.trim();
  const encoded = serverEnv.dataGoKrServiceKeyEncoded?.trim();
  const order: Array<{ v: string | undefined; t: DataGoKrKeyType }> = preferDecoded
    ? [
        { v: decoded, t: "decoded" },
        { v: encoded, t: "encoded" }
      ]
    : [
        { v: encoded, t: "encoded" },
        { v: decoded, t: "decoded" }
      ];
  for (const { v, t } of order) {
    if (v) return { value: v, type: t };
  }
  return null;
}

/**
 * 공공데이터포털 GET 호출. 응답을 원본 텍스트로 반환.
 *
 * 키 처리:
 * - decoded 키: URLSearchParams에 set → 자동 percent-encoding
 * - encoded 키: 이미 percent-encoded이므로 URL 뒤에 raw append (이중 인코딩 방지)
 */
export async function callDataGoKr(args: DataGoKrCallArgs): Promise<DataGoKrResult<string>> {
  const started = Date.now();
  const attempt: DataGoKrAttempt = {
    endpointName: args.endpointName,
    urlRedacted: redactUrl(args.url),
    durationMs: 0
  };

  const key = resolveServiceKey(args.preferDecoded ?? true);
  if (!key) {
    attempt.error = "DATA_GO_KR_SERVICE_KEY_(ENCODED|DECODED) not configured";
    attempt.durationMs = Date.now() - started;
    return { ok: false, data: null, attempt };
  }
  attempt.keyType = key.type;

  let urlObj: URL;
  try {
    urlObj = new URL(args.url);
  } catch (error) {
    attempt.error = `invalid url: ${error instanceof Error ? error.message : "parse failed"}`;
    attempt.durationMs = Date.now() - started;
    return { ok: false, data: null, attempt };
  }

  if (key.type === "decoded") {
    urlObj.searchParams.set("serviceKey", key.value);
  }
  for (const [k, v] of Object.entries(args.params ?? {})) {
    if (v === undefined || v === null) continue;
    const str = typeof v === "boolean" ? (v ? "true" : "false") : String(v);
    if (str === "") continue;
    urlObj.searchParams.set(k, str);
  }

  let finalUrl = urlObj.toString();
  if (key.type === "encoded") {
    const sep = finalUrl.includes("?") ? "&" : "?";
    finalUrl = `${finalUrl}${sep}serviceKey=${key.value}`;
  }
  attempt.urlRedacted = redactUrl(finalUrl);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 10_000);

  try {
    const headers: Record<string, string> = {};
    if (args.acceptHeader) headers["Accept"] = args.acceptHeader;

    const response = await fetch(finalUrl, {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers
    });
    attempt.httpStatus = response.status;
    const text = await response.text();
    attempt.durationMs = Date.now() - started;

    const accepted = args.acceptStatusCodes
      ? args.acceptStatusCodes.includes(response.status)
      : response.ok;

    if (!accepted) {
      attempt.error = `HTTP ${response.status} ${response.statusText || ""}`.trim();
      return { ok: false, data: null, rawText: text, attempt };
    }

    return { ok: true, data: text, rawText: text, attempt };
  } catch (error) {
    attempt.durationMs = Date.now() - started;
    if (error instanceof Error && error.name === "AbortError") {
      attempt.error = `timeout after ${args.timeoutMs ?? 10_000}ms`;
    } else {
      attempt.error = error instanceof Error ? error.message : "fetch failed";
    }
    return { ok: false, data: null, attempt };
  } finally {
    clearTimeout(timer);
  }
}

/** data.go.kr 표준 응답 envelope (모든 API에 적용되지는 않음 - LOCALDATA 등은 다른 shape) */
type DataGoKrStandardEnvelope = {
  response?: {
    header?: {
      resultCode?: string;
      resultMsg?: string;
    };
    body?: {
      totalCount?: number;
      pageNo?: number;
      numOfRows?: number;
      items?: unknown;
    };
  };
};

/**
 * JSON 응답을 파싱하고 표준 envelope에서 resultCode/itemCount를 자동 추출.
 * 비표준 응답(LOCALDATA·LURIS 등)이어도 파싱 자체는 성공하며, envelope 필드는 단순히 비어 있음.
 */
export async function callDataGoKrJson<T = unknown>(args: DataGoKrCallArgs): Promise<DataGoKrResult<T>> {
  const raw = await callDataGoKr({ acceptHeader: "application/json", ...args });
  if (!raw.ok || raw.data == null) {
    return { ok: false, data: null, rawText: raw.rawText, attempt: raw.attempt };
  }
  try {
    const parsed = JSON.parse(raw.data) as T;

    // 표준 envelope에서 resultCode/itemCount 추출 (있을 때만)
    const envelope = parsed as DataGoKrStandardEnvelope;
    const header = envelope?.response?.header;
    const body = envelope?.response?.body;
    if (header?.resultCode) {
      raw.attempt.apiResultCode = header.resultCode;
    }
    if (body) {
      if (typeof body.totalCount === "number") {
        raw.attempt.itemCount = body.totalCount;
      } else if (body.items && typeof body.items === "object") {
        const items = body.items as Record<string, unknown>;
        if (Array.isArray(items.item)) {
          raw.attempt.itemCount = items.item.length;
        }
      }
    }

    return { ok: true, data: parsed, rawText: raw.data, attempt: raw.attempt };
  } catch (error) {
    return {
      ok: false,
      data: null,
      rawText: raw.data,
      attempt: {
        ...raw.attempt,
        error: `JSON parse failed: ${error instanceof Error ? error.message : "unknown"}`
      }
    };
  }
}

/** 진단을 한 줄 문자열로 요약 — agent_traces.outputSummary나 data_statuses.detail에 그대로 사용. */
export function summarizeAttempt(attempt: DataGoKrAttempt): string {
  const parts: string[] = [attempt.endpointName];
  if (attempt.httpStatus != null) parts.push(`HTTP ${attempt.httpStatus}`);
  if (attempt.apiResultCode) parts.push(attempt.apiResultCode);
  if (attempt.itemCount != null) parts.push(`items=${attempt.itemCount}`);
  if (attempt.keyType) parts.push(`key=${attempt.keyType}`);
  parts.push(`${attempt.durationMs}ms`);
  if (attempt.error) parts.push(`error=${attempt.error.slice(0, 80)}`);
  return parts.join(" · ");
}

/**
 * 응답이 비표준 shape(예: LOCALDATA의 `result.body.rows`)일 때 사용할 수 있는 generic 추출 도우미.
 * path는 dot-separated. 각 segment는 object key 또는 배열 인덱스.
 */
export function pickFromPath(value: unknown, path: string): unknown {
  if (!path) return value;
  const segments = path.split(".");
  let current: unknown = value;
  for (const segment of segments) {
    if (current == null || typeof current !== "object") return undefined;
    if (Array.isArray(current)) {
      const index = Number(segment);
      if (Number.isNaN(index)) return undefined;
      current = current[index];
    } else {
      current = (current as Record<string, unknown>)[segment];
    }
  }
  return current;
}
