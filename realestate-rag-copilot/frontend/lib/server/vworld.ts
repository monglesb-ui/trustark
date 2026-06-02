import { serverEnv } from "./env";

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
  source: string;
  addressType: VworldAddressType;
  legalDong?: string;
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

export async function geocodeAddress(address: string) {
  const trimmed = address.trim();
  if (!trimmed || !serverEnv.vworldApiKey) return null;

  return (await fetchVworldAddress(trimmed, "parcel")) ?? (await fetchVworldAddress(trimmed, "road"));
}
