import type { AnalyzeResponse } from "@/lib/types";
import { serverEnv } from "./env";
import type { LegalDongCode } from "./legal-dong";

const BUILDING_REGISTER_TITLE_ENDPOINT = "https://apis.data.go.kr/1613000/BldRgstHubService/getBrTitleInfo";

type BuildingRegisterItem = {
  platPlc?: unknown;
  newPlatPlc?: unknown;
  bldNm?: unknown;
  mainPurpsCdNm?: unknown;
  etcPurps?: unknown;
  hhldCnt?: unknown;
  fmlyCnt?: unknown;
  grndFlrCnt?: unknown;
  ugrndFlrCnt?: unknown;
  useAprDay?: unknown;
  violBldYn?: unknown;
};

export type BuildingRegisterSummary = {
  source: string;
  address: string;
  roadAddress?: string;
  buildingName?: string;
  mainPurpose?: string;
  etcPurpose?: string;
  householdCount?: number | null;
  familyCount?: number | null;
  groundFloors?: number | null;
  undergroundFloors?: number | null;
  useApprovalDate?: string;
  violationBuilding?: boolean | null;
  sampleSize: number;
};

export type BuildingRegisterDiagnostics = {
  hasServiceKey: boolean;
  sigunguCd?: string;
  bjdongCd?: string;
  platGbCd?: string;
  bun?: string;
  ji?: string;
  attempts: Array<{
    ok: boolean;
    keyType?: "encoded" | "decoded";
    httpStatus?: number;
    itemCount?: number;
    error?: string;
  }>;
};

export type BuildingRegisterLookupResult = {
  summary: BuildingRegisterSummary | null;
  diagnostics: BuildingRegisterDiagnostics;
};

function getServiceKeys() {
  const keys: Array<{ key: string; type: "encoded" | "decoded" }> = [];
  if (serverEnv.buildingHubServiceKeyEncoded) {
    keys.push({ key: serverEnv.buildingHubServiceKeyEncoded, type: "encoded" });
  }
  if (serverEnv.buildingHubServiceKeyDecoded && serverEnv.buildingHubServiceKeyDecoded !== serverEnv.buildingHubServiceKeyEncoded) {
    keys.push({ key: serverEnv.buildingHubServiceKeyDecoded, type: "decoded" });
  }
  return keys;
}

function textValue(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function parseNumber(value: unknown) {
  const text = textValue(value);
  if (!text) return null;
  const parsed = Number(text.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeLot(value: number | string | undefined) {
  if (value === undefined || value === "") return "0000";
  return String(value).replace(/[^\d]/g, "").padStart(4, "0").slice(-4);
}

function parseLotNumber(addresses: string[]) {
  for (const address of addresses) {
    if (typeof address !== "string") continue;
    const normalized = address.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
    const match = normalized.match(/(?:^|\s)(산\s*)?(\d{1,4})(?:-(\d{1,4}))?(?:\s|$|[^\d-])/);
    if (!match) continue;

    return {
      platGbCd: match[1] ? "1" : "0",
      bun: normalizeLot(match[2]),
      ji: normalizeLot(match[3])
    };
  }

  return null;
}

function collectItems(value: unknown): BuildingRegisterItem[] {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectItems(item));
  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const rows: BuildingRegisterItem[] = [];
  if (textValue(record.platPlc) || textValue(record.newPlatPlc)) {
    rows.push(record as BuildingRegisterItem);
  }

  Object.values(record).forEach((item) => {
    rows.push(...collectItems(item));
  });

  return rows;
}

function normalizeUseApprovalDate(value: unknown) {
  const text = textValue(value);
  if (!text || text.length !== 8) return text;
  return `${text.slice(0, 4)}.${text.slice(4, 6)}.${text.slice(6, 8)}`;
}

function toSummary(items: BuildingRegisterItem[]): BuildingRegisterSummary | null {
  const item = items[0];
  if (!item) return null;
  const violationValue = textValue(item.violBldYn);

  return {
    source: BUILDING_REGISTER_TITLE_ENDPOINT,
    address: textValue(item.platPlc) ?? textValue(item.newPlatPlc) ?? "건축물대장 주소 미확인",
    roadAddress: textValue(item.newPlatPlc),
    buildingName: textValue(item.bldNm),
    mainPurpose: textValue(item.mainPurpsCdNm),
    etcPurpose: textValue(item.etcPurps),
    householdCount: parseNumber(item.hhldCnt),
    familyCount: parseNumber(item.fmlyCnt),
    groundFloors: parseNumber(item.grndFlrCnt),
    undergroundFloors: parseNumber(item.ugrndFlrCnt),
    useApprovalDate: normalizeUseApprovalDate(item.useAprDay),
    violationBuilding: violationValue ? violationValue === "1" || violationValue.toUpperCase() === "Y" : null,
    sampleSize: items.length
  };
}

export async function lookupBuildingRegister({
  legalDong,
  addressCandidates
}: {
  legalDong: LegalDongCode | null;
  addressCandidates: string[];
}): Promise<BuildingRegisterLookupResult> {
  const serviceKeys = getServiceKeys();
  const regionCode = legalDong?.regionCode;
  const sigunguCd = regionCode?.slice(0, 5);
  const bjdongCd = regionCode?.slice(5, 10);
  const lot = parseLotNumber(addressCandidates);
  const diagnostics: BuildingRegisterDiagnostics = {
    hasServiceKey: serviceKeys.length > 0,
    sigunguCd,
    bjdongCd,
    platGbCd: lot?.platGbCd,
    bun: lot?.bun,
    ji: lot?.ji,
    attempts: []
  };

  if (serviceKeys.length === 0 || !sigunguCd || !bjdongCd || bjdongCd === "00000" || !lot) {
    diagnostics.attempts.push({
      ok: false,
      error: !lot
        ? "missing parcel lot number"
        : !bjdongCd || bjdongCd === "00000"
          ? "missing dong-level legal code"
          : "missing service key or legal dong code"
    });
    return { summary: null, diagnostics };
  }

  const dongCode = bjdongCd;
  let lastItems: BuildingRegisterItem[] = [];

  for (const serviceKey of serviceKeys) {
    const url = new URL(BUILDING_REGISTER_TITLE_ENDPOINT);
    url.searchParams.set("serviceKey", serviceKey.key);
    url.searchParams.set("sigunguCd", sigunguCd);
    url.searchParams.set("bjdongCd", dongCode);
    url.searchParams.set("platGbCd", lot.platGbCd);
    url.searchParams.set("bun", lot.bun);
    url.searchParams.set("ji", lot.ji);
    url.searchParams.set("_type", "json");
    url.searchParams.set("numOfRows", "10");
    url.searchParams.set("pageNo", "1");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store"
      });
      const text = await response.text();

      if (!response.ok) {
        diagnostics.attempts.push({
          ok: false,
          keyType: serviceKey.type,
          httpStatus: response.status,
          error: text.slice(0, 160)
        });
        if (response.status === 401 || response.status === 403) continue;
        return { summary: null, diagnostics };
      }

      const data = JSON.parse(text) as unknown;
      lastItems = collectItems(data);
      diagnostics.attempts.push({
        ok: lastItems.length > 0,
        keyType: serviceKey.type,
        httpStatus: response.status,
        itemCount: lastItems.length
      });
      if (lastItems.length > 0) return { summary: toSummary(lastItems), diagnostics };
    } catch (error) {
      diagnostics.attempts.push({
        ok: false,
        keyType: serviceKey.type,
        error: error instanceof Error ? error.message : "unknown building register fetch error"
      });
    } finally {
      clearTimeout(timeout);
    }
  }

  return { summary: toSummary(lastItems), diagnostics };
}

export function applyBuildingRegisterSummary(report: AnalyzeResponse, summary: BuildingRegisterSummary) {
  const purpose = summary.mainPurpose ?? summary.etcPurpose ?? "용도 미확인";
  const violationText =
    summary.violationBuilding === true ? "위반건축물로 표시됨" : summary.violationBuilding === false ? "위반건축물 표시 없음" : "위반건축물 여부 미확인";

  return {
    ...report,
    evidence: [
      {
        title: "건축물대장 표제부 조회",
        description: `${summary.address}의 주용도는 ${purpose}입니다. 사용승인일은 ${summary.useApprovalDate ?? "-"}이고, ${violationText}입니다.`,
        source: "data.go.kr:BldRgstHubService:getBrTitleInfo"
      },
      ...report.evidence
    ],
    risk_signals:
      summary.violationBuilding === true
        ? [
            {
              severity: "높음",
              title: "건축물대장 위반건축물 표시",
              metric: violationText,
              description: "위반건축물은 대출, 보증보험, 전입·대항력 판단에서 추가 리스크가 될 수 있어 원문 확인이 필요합니다.",
              source: "data.go.kr:BldRgstHubService:getBrTitleInfo"
            },
            ...(report.risk_signals ?? [])
          ]
        : report.risk_signals,
    sections: {
      ...report.sections,
      confirmed_facts: [
        `건축물대장 주용도: ${purpose}`,
        ...(summary.useApprovalDate ? [`건축물대장 사용승인일: ${summary.useApprovalDate}`] : []),
        `건축물대장 위반건축물 여부: ${violationText}`,
        ...report.sections.confirmed_facts
      ],
      unverified_items: [
        ...(summary.violationBuilding === null ? ["건축물대장 위반건축물 여부 원문 추가 확인 필요"] : []),
        ...report.sections.unverified_items
      ]
    }
  } satisfies AnalyzeResponse;
}
