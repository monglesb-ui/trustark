import { serverEnv } from "./env";
import { inferLegalDongFromRoadName, normalizeKoreanAddress } from "./address-normalize";

type LegalDongRow = {
  region_cd?: string;
  sido_cd?: string;
  sgg_cd?: string;
  umd_cd?: string;
  ri_cd?: string;
  locatadd_nm?: string;
  locallow_nm?: string;
};

export type LegalDongCode = {
  regionCode: string;
  lawdCode: string;
  addressName: string;
  sidoCode?: string;
  sggCode?: string;
  umdCode?: string;
  source: string;
};

const LEGAL_DONG_ENDPOINT = "https://apis.data.go.kr/1741000/StanReginCd/getStanReginCdList";

function getServiceKey() {
  return serverEnv.dataGoKrServiceKeyDecoded ?? serverEnv.dataGoKrServiceKeyEncoded;
}

function normalizeSpaces(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

export function extractLegalDongQuery(address: string) {
  const roadLegalDong = inferLegalDongFromRoadName(address);
  if (roadLegalDong) return roadLegalDong;

  const cleaned = normalizeSpaces(normalizeKoreanAddress(address))
    .replace(/\d+-?\d*.*$/g, "")
    .trim();
  const tokens = cleaned.split(" ").filter(Boolean);
  const dongIndex = tokens.findIndex((token) => /[동읍면가리]$/.test(token));

  if (dongIndex >= 0) {
    return tokens.slice(0, dongIndex + 1).join(" ");
  }

  return tokens.slice(0, Math.min(tokens.length, 3)).join(" ");
}

function collectRows(value: unknown): LegalDongRow[] {
  if (!value) return [];

  if (Array.isArray(value)) {
    return value.flatMap((item) => collectRows(item));
  }

  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const rows: LegalDongRow[] = [];

  if (typeof record.region_cd === "string" && typeof record.locatadd_nm === "string") {
    rows.push(record as LegalDongRow);
  }

  Object.values(record).forEach((item) => {
    rows.push(...collectRows(item));
  });

  return rows;
}

function scoreRow(row: LegalDongRow, query: string) {
  const name = row.locatadd_nm ?? "";
  const regionCode = row.region_cd ?? "";
  let score = 0;

  if (name === query) score += 100;
  if (name.includes(query) || query.includes(name)) score += 40;
  if (regionCode.length === 10) score += 10;
  if (!regionCode.endsWith("00000000")) score += 8;
  if (!regionCode.endsWith("00000")) score += 5;
  if (!regionCode.endsWith("00")) score += 2;

  return score;
}

function pickBestRow(rows: LegalDongRow[], query: string) {
  return rows
    .filter((row) => row.region_cd && row.locatadd_nm)
    .sort((a, b) => scoreRow(b, query) - scoreRow(a, query))[0];
}

export async function lookupLegalDongCode(query: string): Promise<LegalDongCode | null> {
  const serviceKey = getServiceKey();
  const normalizedQuery = normalizeSpaces(query);

  if (!serviceKey || !normalizedQuery) return null;

  const url = new URL(LEGAL_DONG_ENDPOINT);
  url.searchParams.set("ServiceKey", serviceKey);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "10");
  url.searchParams.set("type", "json");
  url.searchParams.set("locatadd_nm", normalizedQuery);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) return null;

    const data = await response.json();
    const row = pickBestRow(collectRows(data), normalizedQuery);

    if (!row?.region_cd || !row.locatadd_nm) return null;

    return {
      regionCode: row.region_cd,
      lawdCode: row.region_cd.slice(0, 5),
      addressName: row.locatadd_nm,
      sidoCode: row.sido_cd,
      sggCode: row.sgg_cd,
      umdCode: row.umd_cd,
      source: "data.go.kr:StanReginCd:getStanReginCdList"
    };
  } catch {
    return null;
  } finally {
    clearTimeout(timeout);
  }
}
