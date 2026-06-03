import type { AnalyzeRequest, AnalyzeResponse, MapMarker } from "@/lib/types";
import { getPropertyTypeGroup } from "@/lib/property-types";
import { serverEnv } from "./env";

type RentEndpoint = {
  name: string;
  url: string;
};

type RentTransaction = {
  id: string;
  label: string;
  deposit: number;
  monthlyRent: number;
  area?: number | null;
  floor?: string;
  buildingName?: string;
  dealMonth: string;
};

type SaleTransaction = {
  id: string;
  label: string;
  salePrice: number;
  area?: number | null;
  floor?: string;
  buildingName?: string;
  dealMonth: string;
};

export type RentMarketSummary = {
  source: string;
  endpointName: string;
  lawdCode: string;
  dealMonths: string[];
  transactions: RentTransaction[];
  complexName: string | null;
  matchMode: "complex" | "regional";
  regionalSampleSize: number;
  matchedSampleSize: number;
  averageDeposit: number | null;
  averageMonthlyRent: number | null;
  latestTransaction: RentTransaction | null;
  sampleSize: number;
};

export type SaleMarketSummary = {
  source: string;
  endpointName: string;
  lawdCode: string;
  dealMonths: string[];
  transactions: SaleTransaction[];
  complexName: string | null;
  matchMode: "complex" | "regional";
  regionalSampleSize: number;
  matchedSampleSize: number;
  averageSalePrice: number | null;
  latestTransaction: SaleTransaction | null;
  sampleSize: number;
};

export type MarketApiAttempt = {
  dealMonth: string;
  ok: boolean;
  keyType?: "encoded" | "decoded";
  httpStatus?: number;
  itemCount?: number;
  error?: string;
};

export type MarketLookupDiagnostics = {
  endpointName: string;
  lawdCode: string;
  dealMonths: string[];
  hasServiceKey: boolean;
  attempts: MarketApiAttempt[];
};

export type MarketLookupResult<T> = {
  summary: T | null;
  diagnostics: MarketLookupDiagnostics;
};

const APT_RENT_ENDPOINT: RentEndpoint = {
  name: "국토교통부_아파트 전월세 실거래가",
  url: "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent"
};

const ROWHOUSE_RENT_ENDPOINT: RentEndpoint = {
  name: "국토교통부_연립다세대 전월세 실거래가",
  url: "https://apis.data.go.kr/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent"
};

const APT_TRADE_ENDPOINT: RentEndpoint = {
  name: "국토교통부_아파트 매매 실거래가 상세",
  url: "https://apis.data.go.kr/1613000/RTMSDataSvcAptTradeDev/getRTMSDataSvcAptTradeDev"
};

const ROWHOUSE_TRADE_ENDPOINT: RentEndpoint = {
  name: "국토교통부_연립다세대 매매 실거래가",
  url: "https://apis.data.go.kr/1613000/RTMSDataSvcRHTrade/getRTMSDataSvcRHTrade"
};

function getServiceKeys() {
  const keys: Array<{ key: string; type: "encoded" | "decoded" }> = [];
  if (serverEnv.dataGoKrServiceKeyEncoded) {
    keys.push({ key: serverEnv.dataGoKrServiceKeyEncoded, type: "encoded" });
  }
  if (serverEnv.dataGoKrServiceKeyDecoded && serverEnv.dataGoKrServiceKeyDecoded !== serverEnv.dataGoKrServiceKeyEncoded) {
    keys.push({ key: serverEnv.dataGoKrServiceKeyDecoded, type: "decoded" });
  }
  return keys;
}

function endpointFor(propertyType: string) {
  const group = getPropertyTypeGroup(propertyType);
  if (group === "apartment") return APT_RENT_ENDPOINT;
  return ROWHOUSE_RENT_ENDPOINT;
}

function tradeEndpointFor(propertyType: string) {
  const group = getPropertyTypeGroup(propertyType);
  if (group === "apartment") return APT_TRADE_ENDPOINT;
  return ROWHOUSE_TRADE_ENDPOINT;
}

function recentDealMonths(count = 6) {
  const months: string[] = [];
  const date = new Date();
  date.setDate(1);

  for (let index = 0; index < count; index += 1) {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    months.push(`${year}${month}`);
    date.setMonth(date.getMonth() - 1);
  }

  return months;
}

function parseMoney(value?: string | null) {
  if (!value) return 0;
  const numeric = value.replace(/[^\d.-]/g, "");
  return Number(numeric) * 10000 || 0;
}

function parseNumber(value?: string | null) {
  if (!value) return null;
  const numeric = value.replace(/[^\d.-]/g, "");
  const parsed = Number(numeric);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeComplexName(value?: string | null) {
  if (!value) return "";
  return value
    .toLowerCase()
    .replace(/\([^)]*\)/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .replace(/아파트|APT|apt/g, "")
    .replace(/제?(\d+)단지/g, "$1")
    .trim();
}

function extractComplexName(address: string) {
  const compact = address.replace(/\s+/g, " ").trim();
  const direct = compact.match(/([가-힣A-Za-z0-9·\-]+(?:아파트|단지|타운|마을|빌리지|빌라|맨션|자이|래미안|푸르지오|힐스테이트|롯데캐슬|아이파크|더샵)[가-힣A-Za-z0-9·\-]*)/);
  if (direct?.[1]) return direct[1].replace(/^[\d\-]+/, "").trim();

  const tokens = compact.split(" ");
  const lastUseful = [...tokens].reverse().find((token) => /[가-힣]/.test(token) && !/^\d/.test(token));
  return lastUseful && normalizeComplexName(lastUseful).length >= 4 ? lastUseful : null;
}

function selectComparableTransactions<T extends { label: string; buildingName?: string; dealMonth: string }>(
  transactions: T[],
  address: string
) {
  const complexName = extractComplexName(address);
  const normalizedTarget = normalizeComplexName(complexName);

  if (!complexName || normalizedTarget.length < 4) {
    return {
      transactions,
      complexName,
      matchMode: "regional" as const,
      regionalSampleSize: transactions.length,
      matchedSampleSize: 0
    };
  }

  const matched = transactions.filter((item) => {
    const normalizedItem = normalizeComplexName(item.buildingName || item.label);
    if (!normalizedItem || normalizedItem.length < 3) return false;
    return normalizedItem.includes(normalizedTarget) || normalizedTarget.includes(normalizedItem);
  });

  return {
    transactions: matched.length > 0 ? matched : transactions,
    complexName,
    matchMode: matched.length > 0 ? ("complex" as const) : ("regional" as const),
    regionalSampleSize: transactions.length,
    matchedSampleSize: matched.length
  };
}

function newestTransaction<T extends { dealMonth: string }>(transactions: T[]) {
  return [...transactions].sort((a, b) => b.dealMonth.localeCompare(a.dealMonth))[0] ?? null;
}

function textOf(itemXml: string, names: string[]) {
  for (const name of names) {
    const match = itemXml.match(new RegExp(`<${name}>([\\s\\S]*?)</${name}>`));
    if (match?.[1]) {
      return match[1].replace(/<!\[CDATA\[([\s\S]*?)\]\]>/, "$1").trim();
    }
  }

  return "";
}

function parseTransactions(xml: string, dealMonth: string): RentTransaction[] {
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const transactions: RentTransaction[] = [];

  itemMatches.forEach((match, index) => {
    const itemXml = match[1];
    const deposit = parseMoney(textOf(itemXml, ["deposit", "보증금액", "보증금"]));
    const monthlyRent = parseMoney(textOf(itemXml, ["monthlyRent", "월세금액", "월세"]));
    const area = parseNumber(textOf(itemXml, ["excluUseAr", "전용면적"]));
    const buildingName = textOf(itemXml, ["aptNm", "mhouseNm", "연립다세대", "단지"]);
    const floor = textOf(itemXml, ["floor", "층"]);
    const dong = textOf(itemXml, ["umdNm", "법정동"]);

    if (deposit <= 0) return;

    transactions.push({
      id: `${dealMonth}-${index}`,
      label: buildingName || dong || `표본 ${index + 1}`,
      deposit,
      monthlyRent,
      area,
      floor,
      buildingName,
      dealMonth
    });
  });

  return transactions;
}

function parseSaleTransactions(xml: string, dealMonth: string): SaleTransaction[] {
  const itemMatches = [...xml.matchAll(/<item>([\s\S]*?)<\/item>/g)];
  const transactions: SaleTransaction[] = [];

  itemMatches.forEach((match, index) => {
    const itemXml = match[1];
    const salePrice = parseMoney(textOf(itemXml, ["dealAmount", "거래금액"]));
    const area = parseNumber(textOf(itemXml, ["excluUseAr", "전용면적"]));
    const buildingName = textOf(itemXml, ["aptNm", "mhouseNm", "연립다세대", "단지"]);
    const floor = textOf(itemXml, ["floor", "층"]);
    const dong = textOf(itemXml, ["umdNm", "법정동"]);

    if (salePrice <= 0) return;

    transactions.push({
      id: `${dealMonth}-${index}`,
      label: buildingName || dong || `매매 표본 ${index + 1}`,
      salePrice,
      area,
      floor,
      buildingName,
      dealMonth
    });
  });

  return transactions;
}

async function fetchRentTransactions(endpoint: RentEndpoint, lawdCode: string, dealMonth: string) {
  const serviceKeys = getServiceKeys();
  if (serviceKeys.length === 0) {
    return {
      items: [],
      attempt: { dealMonth, ok: false, error: "missing DATA_GO_KR service key" }
    };
  }

  let lastAttempt: MarketApiAttempt = { dealMonth, ok: false, error: "no service key attempted" };

  for (const serviceKey of serviceKeys) {
    const url = new URL(endpoint.url);
    url.searchParams.set("serviceKey", serviceKey.key);
    url.searchParams.set("LAWD_CD", lawdCode);
    url.searchParams.set("DEAL_YMD", dealMonth);
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("numOfRows", "100");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store"
      });

      if (!response.ok) {
        lastAttempt = { dealMonth, ok: false, keyType: serviceKey.type, httpStatus: response.status, error: await response.text() };
        if (response.status === 401 || response.status === 403) continue;
        return { items: [], attempt: lastAttempt };
      }

      const items = parseTransactions(await response.text(), dealMonth);
      return {
        items,
        attempt: { dealMonth, ok: items.length > 0, keyType: serviceKey.type, httpStatus: response.status, itemCount: items.length }
      };
    } catch (error) {
      lastAttempt = {
        dealMonth,
        ok: false,
        keyType: serviceKey.type,
        error: error instanceof Error ? error.message : "unknown rent fetch error"
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { items: [], attempt: lastAttempt };
}

async function fetchSaleTransactions(endpoint: RentEndpoint, lawdCode: string, dealMonth: string) {
  const serviceKeys = getServiceKeys();
  if (serviceKeys.length === 0) {
    return {
      items: [],
      attempt: { dealMonth, ok: false, error: "missing DATA_GO_KR service key" }
    };
  }

  let lastAttempt: MarketApiAttempt = { dealMonth, ok: false, error: "no service key attempted" };

  for (const serviceKey of serviceKeys) {
    const url = new URL(endpoint.url);
    url.searchParams.set("serviceKey", serviceKey.key);
    url.searchParams.set("LAWD_CD", lawdCode);
    url.searchParams.set("DEAL_YMD", dealMonth);
    url.searchParams.set("pageNo", "1");
    url.searchParams.set("numOfRows", "100");

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 6000);

    try {
      const response = await fetch(url, {
        signal: controller.signal,
        cache: "no-store"
      });

      if (!response.ok) {
        lastAttempt = { dealMonth, ok: false, keyType: serviceKey.type, httpStatus: response.status, error: await response.text() };
        if (response.status === 401 || response.status === 403) continue;
        return { items: [], attempt: lastAttempt };
      }

      const items = parseSaleTransactions(await response.text(), dealMonth);
      return {
        items,
        attempt: { dealMonth, ok: items.length > 0, keyType: serviceKey.type, httpStatus: response.status, itemCount: items.length }
      };
    } catch (error) {
      lastAttempt = {
        dealMonth,
        ok: false,
        keyType: serviceKey.type,
        error: error instanceof Error ? error.message : "unknown sale fetch error"
      };
    } finally {
      clearTimeout(timeout);
    }
  }

  return { items: [], attempt: lastAttempt };
}

function filterByContractType(transactions: RentTransaction[], contractType: AnalyzeRequest["contract_type"]) {
  if (contractType === "jeonse") {
    const jeonse = transactions.filter((item) => item.monthlyRent === 0);
    return jeonse.length > 0 ? jeonse : transactions;
  }

  if (contractType === "monthly") {
    const monthly = transactions.filter((item) => item.monthlyRent > 0);
    return monthly.length > 0 ? monthly : transactions;
  }

  return transactions;
}

function average(values: number[]) {
  const usable = values.filter((value) => value > 0);
  if (usable.length === 0) return null;
  return Math.round(usable.reduce((sum, value) => sum + value, 0) / usable.length);
}

export async function lookupRentMarketSummary(
  lawdCode: string,
  propertyType: string,
  contractType: AnalyzeRequest["contract_type"],
  address: string
): Promise<MarketLookupResult<RentMarketSummary>> {
  const serviceKeys = getServiceKeys();
  const endpoint = endpointFor(propertyType);
  const dealMonths = recentDealMonths();
  const diagnostics: MarketLookupDiagnostics = {
    endpointName: endpoint.name,
    lawdCode,
    dealMonths,
    hasServiceKey: serviceKeys.length > 0,
    attempts: []
  };

  if (serviceKeys.length === 0 || !lawdCode) return { summary: null, diagnostics };

  const collected: RentTransaction[] = [];

  for (const dealMonth of dealMonths) {
    const result = await fetchRentTransactions(endpoint, lawdCode, dealMonth);
    diagnostics.attempts.push(result.attempt);
    collected.push(...result.items);
  }

  const regional = filterByContractType(collected, contractType);
  if (regional.length === 0) return { summary: null, diagnostics };

  const comparable = selectComparableTransactions(regional, address);
  const filtered = comparable.transactions.slice(0, 12);

  return {
    summary: {
      source: endpoint.url,
      endpointName: endpoint.name,
      lawdCode,
      dealMonths,
      transactions: filtered,
      complexName: comparable.complexName,
      matchMode: comparable.matchMode,
      regionalSampleSize: comparable.regionalSampleSize,
      matchedSampleSize: comparable.matchedSampleSize,
      averageDeposit: average(filtered.map((item) => item.deposit)),
      averageMonthlyRent: average(filtered.map((item) => item.monthlyRent)),
      latestTransaction: newestTransaction(filtered),
      sampleSize: filtered.length
    },
    diagnostics
  };
}

export async function lookupSaleMarketSummary(
  lawdCode: string,
  propertyType: string,
  address: string
): Promise<MarketLookupResult<SaleMarketSummary>> {
  const serviceKeys = getServiceKeys();
  const endpoint = tradeEndpointFor(propertyType);
  const dealMonths = recentDealMonths(12);
  const diagnostics: MarketLookupDiagnostics = {
    endpointName: endpoint.name,
    lawdCode,
    dealMonths,
    hasServiceKey: serviceKeys.length > 0,
    attempts: []
  };

  if (serviceKeys.length === 0 || !lawdCode) return { summary: null, diagnostics };

  const collected: SaleTransaction[] = [];

  for (const dealMonth of dealMonths) {
    const result = await fetchSaleTransactions(endpoint, lawdCode, dealMonth);
    diagnostics.attempts.push(result.attempt);
    collected.push(...result.items);
  }

  const comparable = selectComparableTransactions(collected, address);
  const transactions = comparable.transactions.slice(0, 12);
  if (transactions.length === 0) return { summary: null, diagnostics };

  return {
    summary: {
      source: endpoint.url,
      endpointName: endpoint.name,
      lawdCode,
      dealMonths,
      transactions,
      complexName: comparable.complexName,
      matchMode: comparable.matchMode,
      regionalSampleSize: comparable.regionalSampleSize,
      matchedSampleSize: comparable.matchedSampleSize,
      averageSalePrice: average(transactions.map((item) => item.salePrice)),
      latestTransaction: newestTransaction(transactions),
      sampleSize: transactions.length
    },
    diagnostics
  };
}

function marketMarkers(report: AnalyzeResponse, summary: RentMarketSummary) {
  const target = report.location;
  const offsets = [
    [0.0007, 0.0008],
    [-0.0006, -0.0007],
    [0.0011, -0.0004],
    [-0.0009, 0.001],
    [0.0002, -0.0011],
    [-0.0012, -0.0002]
  ];

  const targetMarkers = report.markers.filter((marker) => marker.marker_type === "target");
  const transactionMarkers: MapMarker[] = summary.transactions.slice(0, 6).map((item, index) => {
    const [latOffset, lngOffset] = offsets[index % offsets.length];
    return {
      id: `actual-rent-${item.id}`,
      label: String(index + 1),
      lat: target.lat + latOffset,
      lng: target.lng + lngOffset,
      marker_type: "nearby",
      amount: item.deposit
    };
  });

  return [...targetMarkers, ...transactionMarkers];
}

export function applyRentMarketSummary(report: AnalyzeResponse, summary: RentMarketSummary, payload: AnalyzeRequest) {
  const inputDeposit = payload.deposit || report.market_comparison.input_deposit || 0;
  const averageDeposit = summary.averageDeposit ?? report.market_comparison.nearby_avg_deposit ?? 0;
  const differenceRate =
    averageDeposit > 0 ? Math.round(((inputDeposit - averageDeposit) / averageDeposit) * 100) : report.market_comparison.difference_rate;
  const sampleDescriptions = summary.transactions
    .slice(0, 3)
    .map((item) => `${item.dealMonth} ${item.label} 보증금 ${Math.round(item.deposit / 10000).toLocaleString("ko-KR")}만원`)
    .join(", ");
  const matchLabel =
    summary.matchMode === "complex" && summary.complexName
      ? `입력 단지명 "${summary.complexName}"과 매칭된`
      : `입력 단지명 매칭이 없어 ${summary.lawdCode} 지역 기준으로 조회한`;

  return {
    ...report,
    markers: marketMarkers(report, summary),
    market_comparison: {
      ...report.market_comparison,
      nearby_avg_deposit: summary.averageDeposit,
      nearby_avg_monthly_rent: summary.averageMonthlyRent,
      input_deposit: inputDeposit,
      complex_name: summary.complexName,
      match_mode: summary.matchMode,
      regional_sample_size: summary.regionalSampleSize,
      rent_sample_size: summary.sampleSize,
      latest_rent_deposit: summary.latestTransaction?.deposit ?? null,
      latest_rent_monthly_rent: summary.latestTransaction?.monthlyRent ?? null,
      latest_rent_deal_month: summary.latestTransaction?.dealMonth ?? null,
      difference_rate: differenceRate,
      sample_size: summary.sampleSize
    },
    evidence: [
      {
        title: summary.matchMode === "complex" ? "입력 단지 전월세 실거래가 조회" : "지역 전월세 실거래가 참고 조회",
        description: `${summary.endpointName}에서 ${matchLabel} 최근 전월세 표본 ${summary.sampleSize}건을 사용했습니다. 지역 전체 후보는 ${summary.regionalSampleSize}건입니다.${sampleDescriptions ? ` 주요 표본: ${sampleDescriptions}` : ""}`,
        source: summary.source
      },
      ...report.evidence
    ],
    sections: {
      ...report.sections,
      confirmed_facts: [
        `${summary.matchMode === "complex" ? "입력 단지" : "지역 참고"} 전월세 실거래가 표본 ${summary.sampleSize}건 조회`,
        `최근 전월세 보증금: ${summary.latestTransaction ? summary.latestTransaction.deposit.toLocaleString("ko-KR") : "-"}원`,
        `전월세 평균 보증금: ${summary.averageDeposit ? summary.averageDeposit.toLocaleString("ko-KR") : "-"}원`,
        ...report.sections.confirmed_facts.filter(
          (item) => item !== "주변 mock 전세 표본은 4건입니다." && item !== "주변 대체 전세 표본은 4건입니다."
        )
      ],
      assumptions: [
        summary.matchMode === "complex"
          ? "실거래 표본은 입력 주소의 단지명과 API 단지명을 매칭해 우선 사용했습니다."
          : "입력 단지명과 직접 매칭되는 실거래 표본이 없어 법정동 지역 표본을 참고값으로 사용했습니다.",
        ...report.sections.assumptions.filter(
          (item) => !item.includes("mock 거래 표본") && !item.includes("대체 거래 표본")
        )
      ]
    }
  } satisfies AnalyzeResponse;
}

function riskLevel(score: number) {
  if (score >= 75) return "위험 · HIGH";
  if (score >= 60) return "검토 필요";
  return "낮음";
}

function scoreFromJeonseRatio(jeonseRatio: number | null, fallbackScore: number) {
  if (jeonseRatio === null) return fallbackScore;
  if (jeonseRatio >= 90) return 86;
  if (jeonseRatio >= 80) return 78;
  if (jeonseRatio >= 70) return 65;
  return 52;
}

function removeFallbackMarketSignals(report: AnalyzeResponse) {
  const staleSources = new Set(["국토교통부 전세사기 예방 체크리스트", "fallback 거래 표본 데이터", "risk_rule:deposit_to_market_ratio"]);
  const staleTitlePattern = /깡통전세|전세가율 확인|시세 표본 부족|표본 부족/;

  return {
    ...report,
    risk_signals: (report.risk_signals ?? []).filter(
      (item) => !staleSources.has(item.source) && !staleTitlePattern.test(item.title)
    ),
    evidence: report.evidence.filter((item) => !staleSources.has(item.source) && !staleTitlePattern.test(item.title)),
    sections: {
      ...report.sections,
      confirmed_facts: report.sections.confirmed_facts.filter((item) => !item.includes("주변 대체 전세 표본")),
      assumptions: report.sections.assumptions.filter(
        (item) => !item.includes("대체 거래 표본") && !item.includes("대체 전세 표본") && !item.includes("단순 평균")
      )
    }
  } satisfies AnalyzeResponse;
}

export function applySaleMarketSummary(report: AnalyzeResponse, summary: SaleMarketSummary, payload: AnalyzeRequest) {
  const cleanedReport = removeFallbackMarketSignals(report);
  const inputDeposit = payload.deposit || report.market_comparison.input_deposit || 0;
  const salePrice = payload.sale_price || summary.averageSalePrice || report.market_comparison.input_sale_price || 0;
  const jeonseRatio = salePrice > 0 ? Math.round((inputDeposit / salePrice) * 100) : null;
  const adjustedScore = scoreFromJeonseRatio(jeonseRatio, cleanedReport.risk_score);
  const baseReason =
    jeonseRatio === null
      ? "전세가율 산정 불가 (직전 점수 유지)"
      : jeonseRatio >= 90
        ? `전세가율 ${jeonseRatio}% · 깡통전세 의심 구간`
        : jeonseRatio >= 80
          ? `전세가율 ${jeonseRatio}% · 위험 구간`
          : jeonseRatio >= 70
            ? `전세가율 ${jeonseRatio}% · 검토 구간`
            : `전세가율 ${jeonseRatio}% · 안전 구간`;
  const sampleDescriptions = summary.transactions
    .slice(0, 3)
    .map((item) => `${item.dealMonth} ${item.label} 매매가 ${Math.round(item.salePrice / 10000).toLocaleString("ko-KR")}만원`)
    .join(", ");
  const matchLabel =
    summary.matchMode === "complex" && summary.complexName
      ? `입력 단지명 "${summary.complexName}"과 매칭된`
      : `입력 단지명 매칭이 없어 ${summary.lawdCode} 지역 기준으로 조회한`;
  const highRiskSignal =
    jeonseRatio !== null && jeonseRatio >= 80
      ? [
          {
            severity: jeonseRatio >= 90 ? "높음" : "확인 필요",
            title: `전세가율 ${jeonseRatio}% - 매매가 대비 보증금 위험 구간`,
            metric: `평균 매매가 ${summary.averageSalePrice ? summary.averageSalePrice.toLocaleString("ko-KR") : "-"}원`,
            description:
              "실거래 매매가 표본 대비 보증금 비율이 높습니다. 경매·가격 하락·선순위 권리 발생 시 보증금 회수 가능성을 추가 검토해야 합니다.",
            source: summary.source
          }
        ]
      : [];

  return {
    ...cleanedReport,
    risk_score: adjustedScore,
    risk_level: riskLevel(adjustedScore),
    score_breakdown: {
      base_score: adjustedScore,
      base_reason: baseReason,
      adjustments: [],
      final_score: adjustedScore
    },
    summary:
      jeonseRatio !== null && jeonseRatio >= 80
        ? `실거래 매매 표본 기준 전세가율이 ${jeonseRatio}%로 높습니다. 계약 전 권리관계, 선순위 채권, 보증보험 가능 여부를 우선 확인해 주세요.`
        : jeonseRatio !== null
          ? `실거래 매매 표본 기준 전세가율은 ${jeonseRatio}%입니다. 가격 기준 위험은 높지 않지만, 등기부등본·선순위 권리·보증보험 가능 여부는 계약 전 확인해야 합니다.`
          : cleanedReport.summary,
    market_comparison: {
      ...cleanedReport.market_comparison,
      nearby_avg_sale_price: summary.averageSalePrice,
      input_sale_price: payload.sale_price ?? summary.averageSalePrice,
      input_deposit: inputDeposit,
      complex_name: cleanedReport.market_comparison.complex_name ?? summary.complexName,
      match_mode: cleanedReport.market_comparison.match_mode === "complex" || summary.matchMode === "complex" ? "complex" : summary.matchMode,
      regional_sample_size: Math.max(cleanedReport.market_comparison.regional_sample_size ?? 0, summary.regionalSampleSize),
      sale_sample_size: summary.sampleSize,
      latest_sale_price: summary.latestTransaction?.salePrice ?? null,
      latest_sale_deal_month: summary.latestTransaction?.dealMonth ?? null,
      jeonse_ratio: jeonseRatio
    },
    risk_signals: [...highRiskSignal, ...(cleanedReport.risk_signals ?? [])],
    evidence: [
      {
        title: summary.matchMode === "complex" ? "입력 단지 매매 실거래가 조회" : "지역 매매 실거래가 참고 조회",
        description: `${summary.endpointName}에서 ${matchLabel} 최근 매매 표본 ${summary.sampleSize}건을 사용했습니다. 지역 전체 후보는 ${summary.regionalSampleSize}건입니다.${sampleDescriptions ? ` 주요 표본: ${sampleDescriptions}` : ""}`,
        source: summary.source
      },
      ...cleanedReport.evidence
    ],
    sections: {
      ...cleanedReport.sections,
      confirmed_facts: [
        `${summary.matchMode === "complex" ? "입력 단지" : "지역 참고"} 매매 실거래가 표본 ${summary.sampleSize}건 조회`,
        `최근 매매 실거래가: ${summary.latestTransaction ? summary.latestTransaction.salePrice.toLocaleString("ko-KR") : "-"}원`,
        `매매 평균 실거래가: ${summary.averageSalePrice ? summary.averageSalePrice.toLocaleString("ko-KR") : "-"}원`,
        ...(jeonseRatio !== null ? [`실거래 매매가 기준 전세가율: ${jeonseRatio}%`] : []),
        ...cleanedReport.sections.confirmed_facts
      ],
      assumptions: [
        summary.matchMode === "complex"
          ? "전세가율은 입력 보증금과 입력 단지 매매 실거래 표본 평균을 기준으로 계산했습니다."
          : "전세가율은 입력 보증금과 지역 매매 실거래 참고 표본 평균을 기준으로 계산했습니다.",
        ...cleanedReport.sections.assumptions
      ]
    }
  } satisfies AnalyzeResponse;
}
