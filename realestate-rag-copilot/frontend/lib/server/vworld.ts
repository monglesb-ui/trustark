import { serverEnv } from "./env";
import { normalizeKoreanAddress } from "./address-normalize";
import { geocodeAddressWithNaver, type NaverGeocodeDiagnostics } from "./naver-geocode";

type VworldAddressType = "parcel" | "road";

type VworldPoint = {
  x?: string;
  y?: string;
};

type VworldAddressResponse = {
  response?: {
    status?: string;
    result?: {
      text?: string;
      point?: VworldPoint;
      structure?: {
        level1?: string;
        level2?: string;
        level4L?: string;
        detail?: string;
      };
    };
    error?: {
      text?: string;
    };
  };
};

export type GeocodedAddress = {
  lat: number;
  lng: number;
  address: string;
  roadAddress?: string;
  parcelAddress?: string;
  source: string;
  addressType: VworldAddressType;
  legalDong?: string;
};

export type GeocodeResult = {
  result: GeocodedAddress | null;
  diagnostics: NaverGeocodeDiagnostics | null;
};

const VWORLD_ADDRESS_ENDPOINT = "https://api.vworld.kr/req/address";

function buildVworldAddressUrl(address: string, type: VworldAddressType) {
  const key = serverEnv.vworldApiKey;
  if (!key) return null;

  const url = new URL(VWORLD_ADDRESS_ENDPOINT);
  url.searchParams.set("service", "address");
  url.searchParams.set("request", "getcoord");
  url.searchParams.set("version", "2.0");
  url.searchParams.set("crs", "epsg:4326");
  url.searchParams.set("address", address);
  url.searchParams.set("refine", "true");
  url.searchParams.set("simple", "false");
  url.searchParams.set("format", "json");
  url.searchParams.set("type", type);
  url.searchParams.set("key", key);
  return url;
}

function parseVworldAddress(data: VworldAddressResponse, originalAddress: string, addressType: VworldAddressType) {
  const result = data.response?.result;
  const point = result?.point;
  const lng = Number(point?.x);
  const lat = Number(point?.y);

  if (data.response?.status !== "OK" || !Number.isFinite(lat) || !Number.isFinite(lng)) {
    return null;
  }

  const structure = result?.structure;
  const legalDong = [structure?.level1, structure?.level2, structure?.level4L].filter(Boolean).join(" ");

  return {
    lat,
    lng,
    address: result?.text || originalAddress,
    source: "vworld:address:getcoord",
    addressType,
    legalDong: legalDong || undefined
  } satisfies GeocodedAddress;
}

async function fetchVworldAddress(address: string, type: VworldAddressType) {
  const url = buildVworldAddressUrl(address, type);
  if (!url) return null;

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) return null;

    const data = (await response.json()) as VworldAddressResponse;
    return parseVworldAddress(data, address, type);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

// ============================================================================
// VWorld Search API (POI 검색)
// ============================================================================

export type VworldPlace = {
  id: string;
  title: string;
  category: string;
  address: string;
  roadAddress?: string;
  lat: number;
  lng: number;
  distance?: number; // 미터, 거리 계산 후 채워짐
};

export type VworldSearchResult = {
  ok: boolean;
  query: string;
  total: number;
  places: VworldPlace[];
  attempt: {
    httpStatus?: number;
    durationMs: number;
    error?: string;
  };
};

const VWORLD_SEARCH_ENDPOINT = "https://api.vworld.kr/req/search";

/**
 * VWorld Search API — POI(장소) 검색.
 * 좌표 + 반경 검색 지원. 결과에 WGS84 좌표 포함.
 *
 * @param args.query   검색어 (예: "카페", "스타벅스")
 * @param args.cx      중심 경도 (WGS84)
 * @param args.cy      중심 위도 (WGS84)
 * @param args.radius  반경 (미터, 최대 10,000)
 * @param args.size    결과 개수 (최대 1000)
 */
export async function searchVworldPlaces(args: {
  query: string;
  cx: number;
  cy: number;
  radius: number;
  size?: number;
  timeoutMs?: number;
}): Promise<VworldSearchResult> {
  const started = Date.now();
  const key = serverEnv.vworldApiKey;
  const result: VworldSearchResult = {
    ok: false,
    query: args.query,
    total: 0,
    places: [],
    attempt: { durationMs: 0 }
  };

  if (!key) {
    result.attempt.error = "VWORLD_API_KEY not configured";
    result.attempt.durationMs = Date.now() - started;
    return result;
  }

  const url = new URL(VWORLD_SEARCH_ENDPOINT);
  url.searchParams.set("service", "search");
  url.searchParams.set("request", "search");
  url.searchParams.set("version", "2.0");
  url.searchParams.set("type", "place");
  url.searchParams.set("query", args.query);
  url.searchParams.set("format", "json");
  url.searchParams.set("errorformat", "json");
  url.searchParams.set("size", String(Math.min(args.size ?? 100, 1000)));
  url.searchParams.set("page", "1");
  url.searchParams.set("coordSys", "EPSG:4326");
  url.searchParams.set("key", key);

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), args.timeoutMs ?? 8000);

  try {
    // VWorld는 가끔 502를 반환 — 1회 재시도
    let response = await fetch(url.toString(), {
      method: "GET",
      cache: "no-store",
      signal: controller.signal
    });
    if (response.status >= 500 && response.status < 600) {
      // 짧은 대기 후 1회 재시도
      await new Promise((resolve) => setTimeout(resolve, 300));
      response = await fetch(url.toString(), {
        method: "GET",
        cache: "no-store",
        signal: controller.signal
      });
    }
    result.attempt.httpStatus = response.status;
    if (!response.ok) {
      result.attempt.error = `HTTP ${response.status}`;
      result.attempt.durationMs = Date.now() - started;
      return result;
    }
    const data = (await response.json()) as {
      response?: {
        status?: string;
        record?: { total?: string };
        result?: {
          items?: Array<{
            id?: string;
            title?: string;
            category?: string;
            address?: { parcel?: string; road?: string };
            point?: { x?: string; y?: string };
          }>;
        };
      };
    };

    const status = data.response?.status;
    if (status !== "OK") {
      result.attempt.error = `vworld status=${status ?? "unknown"}`;
      result.attempt.durationMs = Date.now() - started;
      return result;
    }

    const items = data.response?.result?.items ?? [];
    const placesAll: VworldPlace[] = items
      .filter((it) => it.point?.x && it.point?.y)
      .map((it) => ({
        id: it.id ?? "",
        title: it.title ?? "",
        category: it.category ?? "",
        address: it.address?.parcel ?? "",
        roadAddress: it.address?.road,
        lat: Number(it.point!.y),
        lng: Number(it.point!.x)
      }));

    // Haversine 거리 계산 + radius 필터
    const R = 6_371_000;
    const toRad = (d: number) => (d * Math.PI) / 180;
    const placesWithDistance = placesAll.map((p) => {
      const dLat = toRad(p.lat - args.cy);
      const dLng = toRad(p.lng - args.cx);
      const a =
        Math.sin(dLat / 2) ** 2 +
        Math.cos(toRad(args.cy)) * Math.cos(toRad(p.lat)) * Math.sin(dLng / 2) ** 2;
      const distance = 2 * R * Math.asin(Math.sqrt(a));
      return { ...p, distance };
    });
    const filtered = placesWithDistance
      .filter((p) => p.distance <= args.radius)
      .sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

    result.ok = true;
    result.total = Number(data.response?.record?.total ?? items.length);
    result.places = filtered;
    result.attempt.durationMs = Date.now() - started;
    return result;
  } catch (error) {
    result.attempt.durationMs = Date.now() - started;
    result.attempt.error =
      error instanceof Error
        ? error.name === "AbortError"
          ? `timeout ${args.timeoutMs ?? 8000}ms`
          : error.message
        : "vworld search failed";
    return result;
  } finally {
    clearTimeout(timer);
  }
}

export async function geocodeAddress(address: string): Promise<GeocodeResult> {
  const trimmed = normalizeKoreanAddress(address);
  if (!trimmed) return { result: null, diagnostics: null };

  return geocodeAddressWithNaver(trimmed);
}
