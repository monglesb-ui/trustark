import { addressSearchCandidates } from "./address-normalize";
import { serverEnv } from "./env";
import type { GeocodedAddress } from "./vworld";

type NaverAddressElement = {
  types?: string[];
  longName?: string;
  shortName?: string;
};

type NaverGeocodeAddress = {
  roadAddress?: string;
  jibunAddress?: string;
  x?: string;
  y?: string;
  addressElements?: NaverAddressElement[];
};

type NaverGeocodeResponse = {
  status?: string;
  errorMessage?: string;
  errorCode?: string;
  message?: string;
  addresses?: NaverGeocodeAddress[];
};

export type NaverGeocodeDiagnostics = {
  hasClientId: boolean;
  hasClientSecret: boolean;
  candidates: string[];
  attempts: Array<{
    query: string;
    ok: boolean;
    httpStatus?: number;
    apiStatus?: string;
    addressCount?: number;
    error?: string;
  }>;
};

const NAVER_GEOCODE_ENDPOINT = "https://maps.apigw.ntruss.com/map-geocode/v2/geocode";

function legalDongFromElements(elements: NaverAddressElement[] | undefined) {
  if (!elements) return undefined;

  const part = (type: string) =>
    elements.find((item) => item.types?.includes(type))?.longName ??
    elements.find((item) => item.types?.includes(type))?.shortName;

  return [part("SIDO"), part("SIGUGUN"), part("DONG")].filter(Boolean).join(" ") || undefined;
}

function parseNaverAddress(data: NaverGeocodeResponse, originalAddress: string) {
  if (data.status !== "OK") return null;

  const item = data.addresses?.[0];
  const lng = Number(item?.x);
  const lat = Number(item?.y);

  if (!item || !Number.isFinite(lat) || !Number.isFinite(lng)) return null;

  return {
    lat,
    lng,
    address: item.roadAddress || item.jibunAddress || originalAddress,
    source: "naver:maps:geocode",
    addressType: item.roadAddress ? "road" : "parcel",
    legalDong: legalDongFromElements(item.addressElements)
  } satisfies GeocodedAddress;
}

async function fetchNaverGeocode(query: string) {
  const clientId = serverEnv.naverMapClientId;
  const clientSecret = serverEnv.naverMapClientSecret;
  if (!clientId || !clientSecret) {
    return {
      result: null,
      attempt: {
        query,
        ok: false,
        error: "missing NAVER_MAP_CLIENT_ID or NAVER_MAP_CLIENT_SECRET"
      }
    };
  }

  const url = new URL(NAVER_GEOCODE_ENDPOINT);
  url.searchParams.set("query", query);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      headers: {
        "x-ncp-apigw-api-key-id": clientId,
        "x-ncp-apigw-api-key": clientSecret
      },
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) {
      return {
        result: null,
        attempt: {
          query,
          ok: false,
          httpStatus: response.status,
          error: await response.text()
        }
      };
    }

    const data = (await response.json()) as NaverGeocodeResponse;
    const result = parseNaverAddress(data, query);

    return {
      result,
      attempt: {
        query,
        ok: Boolean(result),
        httpStatus: response.status,
        apiStatus: data.status,
        addressCount: data.addresses?.length ?? 0,
        error: data.errorMessage ?? data.errorCode ?? data.message
      }
    };
  } catch (error) {
    return {
      result: null,
      attempt: {
        query,
        ok: false,
        error: error instanceof Error ? error.message : "unknown fetch error"
      }
    };
  } finally {
    clearTimeout(timeout);
  }
}

export async function geocodeAddressWithNaver(address: string): Promise<{
  result: GeocodedAddress | null;
  diagnostics: NaverGeocodeDiagnostics;
}> {
  const candidates = addressSearchCandidates(address);
  const diagnostics: NaverGeocodeDiagnostics = {
    hasClientId: Boolean(serverEnv.naverMapClientId),
    hasClientSecret: Boolean(serverEnv.naverMapClientSecret),
    candidates,
    attempts: []
  };

  if (!serverEnv.naverMapClientId || !serverEnv.naverMapClientSecret) {
    diagnostics.attempts.push({
      query: candidates[0] ?? address,
      ok: false,
      error: "missing NAVER_MAP_CLIENT_ID or NAVER_MAP_CLIENT_SECRET"
    });
    return { result: null, diagnostics };
  }

  for (const candidate of candidates) {
    const { result, attempt } = await fetchNaverGeocode(candidate);
    diagnostics.attempts.push(attempt);
    if (result) return { result, diagnostics };
  }

  return { result: null, diagnostics };
}
