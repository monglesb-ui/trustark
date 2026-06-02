import type { AnalyzeRequest } from "@/lib/types";
import { lookupLegalDongCode, type LegalDongCode } from "@/lib/server/legal-dong";
import {
  lookupRentMarketSummary,
  lookupSaleMarketSummary,
  type MarketLookupDiagnostics,
  type MarketLookupResult,
  type RentMarketSummary,
  type SaleMarketSummary
} from "@/lib/server/real-transactions";
import type { TraceRecorder } from "../trace";

const MARKET_DATA_AGENT = "Market Data Agent" as const;

export const marketDataAgentAllowedTools = [
  "lookupLegalDongCode",
  "lookupRentMarketSummary",
  "lookupSaleMarketSummary"
] as const;

type MarketDataTool = (typeof marketDataAgentAllowedTools)[number];

export type MarketDataAgentResult = {
  legalDong: LegalDongCode | null;
  rentLookup: MarketLookupResult<RentMarketSummary> | null;
  rentSummary: RentMarketSummary | null;
  saleLookup: MarketLookupResult<SaleMarketSummary> | null;
  saleSummary: SaleMarketSummary | null;
};

function assertAllowedTool(tool: string): asserts tool is MarketDataTool {
  if (!marketDataAgentAllowedTools.includes(tool as MarketDataTool)) {
    throw new Error(`${MARKET_DATA_AGENT} cannot call tool: ${tool}`);
  }
}

function marketDiagnosticSummary(diagnostics?: MarketLookupDiagnostics | null) {
  if (!diagnostics) return "진단 정보 없음";
  if (!diagnostics.hasServiceKey) return "data.go.kr 서비스키 없음";

  const totalItems = diagnostics.attempts.reduce((sum, item) => sum + (item.itemCount ?? 0), 0);
  const last = diagnostics.attempts.at(-1);
  const months = diagnostics.dealMonths.slice(0, diagnostics.attempts.length || 1).join(",");

  if (!last) {
    return `${diagnostics.endpointName} · LAWD_CD ${diagnostics.lawdCode} · 호출 전`;
  }

  const status = [last.httpStatus ? `HTTP ${last.httpStatus}` : null, last.itemCount !== undefined ? `표본 ${totalItems}건` : null]
    .filter(Boolean)
    .join(" · ");
  const key = last.keyType ? ` · key=${last.keyType}` : "";
  const error = last.error ? ` · ${last.error.slice(0, 80)}` : "";

  return `${diagnostics.endpointName} · LAWD_CD ${diagnostics.lawdCode} · ${months} · ${status || "호출 실패"}${key}${error}`;
}

async function callMarketTool<T>(
  trace: TraceRecorder,
  tool: MarketDataTool,
  inputSummary: string,
  task: () => Promise<T>,
  summarize: (result: T) => { status?: "success" | "fallback" | "missing" | "failed"; outputSummary: string }
) {
  assertAllowedTool(tool);
  return trace.run(MARKET_DATA_AGENT, tool, inputSummary, task, summarize);
}

export async function runMarketDataAgent({
  payload,
  legalDongQuery,
  trace
}: {
  payload: AnalyzeRequest;
  legalDongQuery: string;
  trace: TraceRecorder;
}): Promise<MarketDataAgentResult> {
  const legalDong = await callMarketTool(
    trace,
    "lookupLegalDongCode",
    legalDongQuery,
    () => lookupLegalDongCode(legalDongQuery),
    (result) => ({
      status: result ? "success" : "missing",
      outputSummary: result ? `${result.lawdCode} · ${result.addressName}` : "법정동코드 매칭 없음"
    })
  );

  if (!legalDong) {
    return {
      legalDong,
      rentLookup: null,
      rentSummary: null,
      saleLookup: null,
      saleSummary: null
    };
  }

  const rentLookup = await callMarketTool(
    trace,
    "lookupRentMarketSummary",
    `LAWD_CD ${legalDong.lawdCode} · ${payload.property_type} · ${payload.contract_type}`,
    () => lookupRentMarketSummary(legalDong.lawdCode, payload.property_type, payload.contract_type, payload.address),
    (result) => ({
      status: result.summary ? "success" : "missing",
      outputSummary: result.summary
        ? `${result.summary.matchMode === "complex" ? "입력 단지" : "지역 참고"} 전월세 표본 ${result.summary.sampleSize}건 · 평균 ${result.summary.averageDeposit ? result.summary.averageDeposit.toLocaleString("ko-KR") : "-"}원`
        : marketDiagnosticSummary(result.diagnostics)
    })
  );

  const saleLookup = await callMarketTool(
    trace,
    "lookupSaleMarketSummary",
    `LAWD_CD ${legalDong.lawdCode} · ${payload.property_type}`,
    () => lookupSaleMarketSummary(legalDong.lawdCode, payload.property_type, payload.address),
    (result) => ({
      status: result.summary ? "success" : "missing",
      outputSummary: result.summary
        ? `${result.summary.matchMode === "complex" ? "입력 단지" : "지역 참고"} 매매 표본 ${result.summary.sampleSize}건 · 평균 ${result.summary.averageSalePrice ? result.summary.averageSalePrice.toLocaleString("ko-KR") : "-"}원`
        : marketDiagnosticSummary(result.diagnostics)
    })
  );

  return {
    legalDong,
    rentLookup,
    rentSummary: rentLookup.summary,
    saleLookup,
    saleSummary: saleLookup.summary
  };
}
