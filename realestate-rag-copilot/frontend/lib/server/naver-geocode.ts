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
  addresses?: NaverGeocodeAddress[];
};

const NAVER_GEOCODE_ENDPOINT = "https://naveropenapi.apigw.ntruss.com/map-geocode/v2/geocode";

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
  if (!serverEnv.naverMapClientId || !serverEnv.naverMapClientSecret) return null;

  const url = new URL(NAVER_GEOCODE_ENDPOINT);
  url.searchParams.set("query", query);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      headers: {
        "x-ncp-apigw-api-key-id": serverEnv.naverMapClientId,
        "x-ncp-apigw-api-key": serverEnv.naverMapClientSecret
      },
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) return null;

    const data = (await response.json()) as NaverGeocodeResponse;
    return parseNaverAddress(data, query);
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

export async function geocodeAddressWithNaver(address: string) {
  for (const candidate of addressSearchCandidates(address)) {
    const result = await fetchNaverGeocode(candidate);
    if (result) return result;
  }

  return null;
}
