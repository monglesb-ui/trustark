import type { AnalyzeRequest, AnalyzeResponse, MapMarker } from "@/lib/types";
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

const APT_RENT_ENDPOINT: RentEndpoint = {
  name: "국토교통부_아파트 전월세 실거래가",
  url: "https://apis.data.go.kr/1613000/RTMSDataSvcAptRent/getRTMSDataSvcAptRent"
};

const ROWHOUSE_RENT_ENDPOINT: RentEndpoint = {
  name: "국토교통부_연립다세대 전월세 실거래가",
  url: "https://apis.data.go.kr/1613000/RTMSDataSvcRHRent/getRTMSDataSvcRHRent"
};

function getServiceKey() {
  return serverEnv.dataGoKrServiceKeyEncoded ?? serverEnv.dataGoKrServiceKeyDecoded;
}

function endpointFor(propertyType: string) {
  const normalized = propertyType.toLowerCase();
  if (normalized.includes("apt") || normalized.includes("아파트")) return APT_RENT_ENDPOINT;
  return ROWHOUSE_RENT_ENDPOINT;
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
