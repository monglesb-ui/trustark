import "server-only";
import { serverEnv } from "./env";

/**
 * Kakao Local — 키워드 검색 API.
 *
 * Endpoint:
 *   GET https://dapi.kakao.com/v2/local/search/keyword.json
 * Auth:
 *   Authorization: KakaoAK {REST_API_KEY}
 *
 * 좌표 + 반경 + 카테고리 직접 지원. 카카오맵의 풍부한 POI 데이터.
 *
 * 카테고리 그룹 코드 (자주 쓰는 것):
 *   CE7 — 카페
 *   FD6 — 음식점
 *   AC5 — 학원
 *   AT4 — 관광명소
 *   BK9 — 은행
 *   CS2 — 편의점
 *   HP8 — 병원
 *   PM9 — 약국
 *   SC4 — 학교
 *   SW8 — 지하철역
 */

export type KakaoPlace = {
  id: string;
  place_name: string;
  category_name: string;
  category_group_code?: string;
  category_group_name?: string;
  phone?: string;
  address_name: string;
  road_address_name?: string;
  x: string;            // 경도 (WGS84)
  y: string;            // 위도 (WGS84)
  place_url?: string;
  distance?: string;    // 미터 (x,y 옵션 있을 때만)
};

export type KakaoLocalResult = {
  ok: boolean;
  query: string;
  total: number;
  pageable: number;
  places: KakaoPlace[];
  attempt: {
    httpStatus?: number;
    durationMs: number;
    error?: string;
  };
};

const ENDPOINT = "https://dapi.kakao.com/v2/local/search/keyword.json";

export async function searchKakaoLocal(args: {
  query: string;
  cx?: number;            // 경도 (WGS84) — radius 사용 시 필수
  cy?: number;            // 위도 (WGS84)
  radius?: number;        // 미터 (0~20000)
  categoryGroupCode?: string; // CE7, FD6 등
  page?: number;
  size?: number;          // 1~15
  sort?: "accuracy" | "distance";
  timeoutMs?: number;
}): Promise<KakaoLocalResult> {
  const started = Date.now();
  const out: KakaoLocalResult = {
    ok: false,
    query: args.query,
    total: 0,
    pageable: 0,
    places: [],
    attempt: { durationMs: 0 }
  };

  const key = serverEnv.kakaoRestApiKey;
  if (!key) {
    out.attempt.error = "KAKAO_REST_API_KEY not configured";
    out.attempt.durationMs = Date.now() - started;
    return out;
  }
  // 카카오 OPEN_MAP_AND_LOCAL 활성화 안 된 경우 매번 403 받음 — 환경변수로 skip 가능
  if (process.env.KAKAO_SKIP === "true" || process.env.KAKAO_DISABLED === "true") {
    out.attempt.error = "Kakao Local skipped via env (KAKAO_SKIP=true)";
    out.attempt.durationMs = Date.now() - started;
    return out;
  }

  const url = new URL(ENDPOINT);
  url.searchParams.set("query", args.query);
  if (args.cx != null) url.searchParams.set("x", String(args.cx));
  if (args.cy != null) url.searchParams.set("y", String(args.cy));
  if (args.radius != null) url.searchParams.set("radius", String(Math.min(args.radius, 20000)));
  if (args.categoryGroupCode) url.searchParams.set("category_group_code", args.categoryGroupCode);
  url.searchParams.set("page", String(args.page ?? 1));
  url.searchParams.set("size", String(Math.min(Math.max(args.size ?? 15, 1), 15)));
  url.searchParams.set("sort", args.sort ?? "distance");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 6000);

  try {
    const response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Authorization: `KakaoAK ${key}`,
        Accept: "application/json"
      }
    });
    out.attempt.httpStatus = response.status;
    if (!response.ok) {
      const text = await response.text();
      out.attempt.error = `HTTP ${response.status} ${text.slice(0, 80)}`;
      out.attempt.durationMs = Date.now() - started;
      return out;
    }
    const data = (await response.json()) as {
      documents?: KakaoPlace[];
      meta?: { total_count?: number; pageable_count?: number; is_end?: boolean };
    };
    out.ok = true;
    out.places = data.documents ?? [];
    out.total = data.meta?.total_count ?? out.places.length;
    out.pageable = data.meta?.pageable_count ?? out.places.length;
    out.attempt.durationMs = Date.now() - started;
    return out;
  } catch (error) {
    out.attempt.durationMs = Date.now() - started;
    out.attempt.error =
      error instanceof Error
        ? error.name === "AbortError"
          ? `timeout ${args.timeoutMs ?? 6000}ms`
          : error.message
        : "kakao local request failed";
    return out;
  } finally {
    clearTimeout(timer);
  }
}

/** 페이징해서 더 많은 결과 (최대 3페이지 × 15건 = 45건) */
export async function searchKakaoLocalPaged(
  args: Parameters<typeof searchKakaoLocal>[0]
): Promise<KakaoLocalResult> {
  const collected: KakaoPlace[] = [];
  let lastAttempt: KakaoLocalResult["attempt"] = { durationMs: 0 };
  let total = 0;
  for (let page = 1; page <= 3; page += 1) {
    const r = await searchKakaoLocal({ ...args, page, size: 15 });
    lastAttempt = r.attempt;
    if (!r.ok) {
      return {
        ok: collected.length > 0,
        query: args.query,
        total,
        pageable: total,
        places: collected,
        attempt: lastAttempt
      };
    }
    collected.push(...r.places);
    total = r.total;
    if (r.places.length < 15) break;
  }
  return {
    ok: true,
    query: args.query,
    total,
    pageable: total,
    places: collected,
    attempt: lastAttempt
  };
}
