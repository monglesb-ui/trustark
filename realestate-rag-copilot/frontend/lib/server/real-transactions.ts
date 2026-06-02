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
  averageDeposit: number | null;
  averageMonthlyRent: number | null;
  sampleSize: number;
};

export type SaleMarketSummary = {
  source: string;
  endpointName: string;
  lawdCode: string;
  dealMonths: string[];
  transactions: SaleTransaction[];
  averageSalePrice: number | null;
  sampleSize: number;
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

function getServiceKey() {
  return serverEnv.dataGoKrServiceKeyEncoded ?? serverEnv.dataGoKrServiceKeyDecoded;
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
  const serviceKey = getServiceKey();
  if (!serviceKey) return [];

  const url = new URL(endpoint.url);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("LAWD_CD", lawdCode);
  url.searchParams.set("DEAL_YMD", dealMonth);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "30");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) return [];

    return parseTransactions(await response.text(), dealMonth);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
}

async function fetchSaleTransactions(endpoint: RentEndpoint, lawdCode: string, dealMonth: string) {
  const serviceKey = getServiceKey();
  if (!serviceKey) return [];

  const url = new URL(endpoint.url);
  url.searchParams.set("serviceKey", serviceKey);
  url.searchParams.set("LAWD_CD", lawdCode);
  url.searchParams.set("DEAL_YMD", dealMonth);
  url.searchParams.set("pageNo", "1");
  url.searchParams.set("numOfRows", "30");

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 6000);

  try {
    const response = await fetch(url, {
      signal: controller.signal,
      cache: "no-store"
    });

    if (!response.ok) return [];

    return parseSaleTransactions(await response.text(), dealMonth);
  } catch {
    return [];
  } finally {
    clearTimeout(timeout);
  }
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
  contractType: AnalyzeRequest["contract_type"]
): Promise<RentMarketSummary | null> {
  const serviceKey = getServiceKey();
  if (!serviceKey || !lawdCode) return null;

  const endpoint = endpointFor(propertyType);
  const dealMonths = recentDealMonths();
  const collected: RentTransaction[] = [];

  for (const dealMonth of dealMonths) {
    const transactions = await fetchRentTransactions(endpoint, lawdCode, dealMonth);
    collected.push(...transactions);
    if (collected.length >= 8) break;
  }

  const filtered = filterByContractType(collected, contractType).slice(0, 12);
  if (filtered.length === 0) return null;

  return {
    source: endpoint.url,
    endpointName: endpoint.name,
    lawdCode,
    dealMonths,
    transactions: filtered,
    averageDeposit: average(filtered.map((item) => item.deposit)),
    averageMonthlyRent: average(filtered.map((item) => item.monthlyRent)),
    sampleSize: filtered.length
  };
}

export async function lookupSaleMarketSummary(lawdCode: string, propertyType: string): Promise<SaleMarketSummary | null> {
  const serviceKey = getServiceKey();
  if (!serviceKey || !lawdCode) return null;

  const endpoint = tradeEndpointFor(propertyType);
  const dealMonths = recentDealMonths(12);
  const collected: SaleTransaction[] = [];

  for (const dealMonth of dealMonths) {
    const transactions = await fetchSaleTransactions(endpoint, lawdCode, dealMonth);
    collected.push(...transactions);
    if (collected.length >= 8) break;
  }

  const transactions = collected.slice(0, 12);
  if (transactions.length === 0) return null;

  return {
    source: endpoint.url,
    endpointName: endpoint.name,
    lawdCode,
    dealMonths,
    transactions,
    averageSalePrice: average(transactions.map((item) => item.salePrice)),
    sampleSize: transactions.length
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

  return {
    ...report,
    markers: marketMarkers(report, summary),
    market_comparison: {
      ...report.market_comparison,
      nearby_avg_deposit: summary.averageDeposit,
      nearby_avg_monthly_rent: summary.averageMonthlyRent,
      input_deposit: inputDeposit,
      difference_rate: differenceRate,
      sample_size: summary.sampleSize
    },
    evidence: [
      {
        title: "실거래가 전월세 표본 조회",
        description: `${summary.endpointName}에서 ${summary.lawdCode} 지역의 최근 전월세 표본 ${summary.sampleSize}건을 조회했습니다.${sampleDescriptions ? ` 주요 표본: ${sampleDescriptions}` : ""}`,
        source: summary.source
      },
      ...report.evidence
    ],
    sections: {
      ...report.sections,
      confirmed_facts: [
        `실거래가 전월세 표본 ${summary.sampleSize}건 조회`,
        `실거래가 평균 보증금: ${summary.averageDeposit ? summary.averageDeposit.toLocaleString("ko-KR") : "-"}원`,
        ...report.sections.confirmed_facts.filter((item) => item !== "주변 mock 전세 표본은 4건입니다.")
      ],
      assumptions: [
        "실거래 표본은 법정동 앞 5자리 지역코드와 최근 계약월 기준으로 조회했습니다.",
        ...report.sections.assumptions.filter((item) => !item.includes("mock 거래 표본"))
      ]
    }
  } satisfies AnalyzeResponse;
}

function riskLevel(score: number) {
  if (score >= 75) return "위험 · HIGH";
  if (score >= 60) return "검토 필요";
  return "낮음";
}

export function applySaleMarketSummary(report: AnalyzeResponse, summary: SaleMarketSummary, payload: AnalyzeRequest) {
  const inputDeposit = payload.deposit || report.market_comparison.input_deposit || 0;
  const salePrice = payload.sale_price || summary.averageSalePrice || report.market_comparison.input_sale_price || 0;
  const jeonseRatio = salePrice > 0 ? Math.round((inputDeposit / salePrice) * 100) : null;
  const adjustedScore =
    jeonseRatio === null
      ? report.risk_score
      : jeonseRatio >= 90
        ? Math.max(report.risk_score, 86)
        : jeonseRatio >= 80
          ? Math.max(report.risk_score, 78)
          : jeonseRatio >= 70
            ? Math.max(report.risk_score, 65)
            : report.risk_score;
  const sampleDescriptions = summary.transactions
    .slice(0, 3)
    .map((item) => `${item.dealMonth} ${item.label} 매매가 ${Math.round(item.salePrice / 10000).toLocaleString("ko-KR")}만원`)
    .join(", ");
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
    ...report,
    risk_score: adjustedScore,
    risk_level: riskLevel(adjustedScore),
    summary:
      jeonseRatio !== null && jeonseRatio >= 80
        ? `실거래 매매 표본 기준 전세가율이 ${jeonseRatio}%로 높습니다. 계약 전 권리관계, 선순위 채권, 보증보험 가능 여부를 우선 확인해 주세요.`
        : report.summary,
    market_comparison: {
      ...report.market_comparison,
      nearby_avg_sale_price: summary.averageSalePrice,
      input_sale_price: payload.sale_price ?? summary.averageSalePrice,
      input_deposit: inputDeposit
    },
    risk_signals: [...highRiskSignal, ...(report.risk_signals ?? [])],
    evidence: [
      {
        title: "실거래가 매매 표본 조회",
        description: `${summary.endpointName}에서 ${summary.lawdCode} 지역의 최근 매매 표본 ${summary.sampleSize}건을 조회했습니다.${sampleDescriptions ? ` 주요 표본: ${sampleDescriptions}` : ""}`,
        source: summary.source
      },
      ...report.evidence
    ],
    sections: {
      ...report.sections,
      confirmed_facts: [
        `실거래가 매매 표본 ${summary.sampleSize}건 조회`,
        `실거래가 평균 매매가: ${summary.averageSalePrice ? summary.averageSalePrice.toLocaleString("ko-KR") : "-"}원`,
        ...(jeonseRatio !== null ? [`실거래 매매가 기준 전세가율: ${jeonseRatio}%`] : []),
        ...report.sections.confirmed_facts
      ],
      assumptions: [
        "전세가율은 입력 보증금과 최근 매매 실거래 표본 평균을 기준으로 계산했습니다.",
        ...report.sections.assumptions
      ]
    }
  } satisfies AnalyzeResponse;
}
