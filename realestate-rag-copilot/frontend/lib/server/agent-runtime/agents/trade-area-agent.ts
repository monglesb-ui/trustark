import type { AnalyzeRequest, TradeAreaFinding } from "@/lib/types";
import {
  SEOUL_TRADE_AREA_SERVICES,
  fetchSeoulTradeArea,
  summarizeSeoulAttempt,
  type SeoulTradeAreaRow
} from "@/lib/server/seoul-open-api";
import { extractSeoulSigungu } from "@/lib/server/seoul-districts";
import type { TraceRecorder } from "../trace";

const AGENT = "Market Data Agent" as const;
const TOOL = "fetchSeoulTradeArea" as const;

/** 가장 최근 분기 코드 추정 (예: 2026 → "20254" 직전 분기) */
function recentQuarters(count = 2): string[] {
  const now = new Date();
  // 발표시점 기준 최근 데이터는 보통 1~2분기 전. 안전하게 4분기 시도.
  const year = now.getFullYear();
  const quarter = Math.floor(now.getMonth() / 3) + 1;
  const quarters: string[] = [];
  let y = year;
  let q = quarter - 1; // 직전 분기부터
  for (let i = 0; i < count; i += 1) {
    if (q <= 0) {
      y -= 1;
      q = 4;
    }
    quarters.push(`${y}${q}`);
    q -= 1;
  }
  return quarters;
}

function num(value: string | undefined): number {
  if (!value) return 0;
  const n = Number(value);
  return Number.isFinite(n) ? n : 0;
}

function avg(numbers: number[]): number {
  if (numbers.length === 0) return 0;
  return numbers.reduce((sum, x) => sum + x, 0) / numbers.length;
}

/** 응답 row가 사용자 자치구에 속하는지 판정.
 *  SIGNGU_CD 필드가 응답에 있을 수도, 없을 수도. ADSTRD_CD 앞 5자리 = 시군구코드. */
function rowMatchesDistrict(row: SeoulTradeAreaRow, signguCd: string): boolean {
  const explicitSiggng = (row.SIGNGU_CD ?? row.SIGNGU_CD_NM ?? "").toString();
  if (explicitSiggng && explicitSiggng.startsWith(signguCd)) return true;
  const adstrd = (row.ADSTRD_CD ?? "").toString();
  if (adstrd && adstrd.startsWith(signguCd)) return true;
  // 상권코드 prefix가 자치구코드와 매칭되는 패턴 (서울 상권코드 일부는 자치구 prefix 사용)
  const trdar = (row.TRDAR_CD ?? "").toString();
  if (trdar && trdar.length >= 5 && trdar.startsWith(signguCd.slice(0, 4))) return true;
  return false;
}

export async function runTradeAreaAgent({
  payload,
  trace
}: {
  payload: AnalyzeRequest;
  trace: TraceRecorder;
}): Promise<TradeAreaFinding | null> {
  const { sigungu, signguCd } = extractSeoulSigungu(payload.address ?? "");
  const inputSummary = `sigungu=${sigungu ?? "?"} cd=${signguCd ?? "?"}`;

  if (!sigungu || !signguCd) {
    trace.record(AGENT, TOOL, inputSummary, "자치구/시군구코드 미확보 — 상권분석 생략", "missing");
    return null;
  }

  const quarters = recentQuarters(2);

  try {
    return await trace.run(
      AGENT,
      TOOL,
      inputSummary,
      async () => {
        // 분기 시도. 최근 → 이전 순으로.
        let footResult: Awaited<ReturnType<typeof fetchSeoulTradeArea>> | null = null;
        let salesResult: Awaited<ReturnType<typeof fetchSeoulTradeArea>> | null = null;
        let storesResult: Awaited<ReturnType<typeof fetchSeoulTradeArea>> | null = null;
        let openCloseResult: Awaited<ReturnType<typeof fetchSeoulTradeArea>> | null = null;
        let usedQuarter = "";

        for (const q of quarters) {
          const [foot, sales, stores, opclo] = await Promise.all([
            fetchSeoulTradeArea({ service: SEOUL_TRADE_AREA_SERVICES.footTraffic, yyqu: q, maxPages: 2 }),
            fetchSeoulTradeArea({ service: SEOUL_TRADE_AREA_SERVICES.sales, yyqu: q, maxPages: 2 }),
            fetchSeoulTradeArea({ service: SEOUL_TRADE_AREA_SERVICES.stores, yyqu: q, maxPages: 2 }),
            fetchSeoulTradeArea({ service: SEOUL_TRADE_AREA_SERVICES.openClose, yyqu: q, maxPages: 2 })
          ]);
          if (foot.ok && foot.rows.length > 0) {
            footResult = foot;
            salesResult = sales;
            storesResult = stores;
            openCloseResult = opclo;
            usedQuarter = q;
            break;
          }
        }

        if (!footResult || footResult.rows.length === 0) {
          throw new Error(`상권 데이터 응답 0건 (${quarters.join(", ")})`);
        }

        // 자치구 필터
        const districtFoot = footResult.rows.filter((r) => rowMatchesDistrict(r, signguCd));
        const districtSales = salesResult?.rows.filter((r) => rowMatchesDistrict(r, signguCd)) ?? [];
        const districtStores = storesResult?.rows.filter((r) => rowMatchesDistrict(r, signguCd)) ?? [];
        const districtOpClo = openCloseResult?.rows.filter((r) => rowMatchesDistrict(r, signguCd)) ?? [];

        // 매칭 0건이면 전체 응답 평균 (대안)
        const usedFoot = districtFoot.length > 0 ? districtFoot : footResult.rows.slice(0, 50);
        const usedSales = districtSales.length > 0 ? districtSales : salesResult?.rows.slice(0, 50) ?? [];
        const usedStores = districtStores.length > 0 ? districtStores : storesResult?.rows.slice(0, 50) ?? [];
        const usedOpClo = districtOpClo.length > 0 ? districtOpClo : openCloseResult?.rows.slice(0, 50) ?? [];

        // 유동인구: 평일·주말 평균
        const weekdayFloat = avg(
          usedFoot.map((r) => num(r.MDWK_TLE_FLPOP_CO ?? r.WKEND_TLE_FLPOP_CO ?? r.TOT_FLPOP_CO))
        );
        const weekendFloat = avg(
          usedFoot.map((r) => num(r.WKEND_TLE_FLPOP_CO ?? r.MDWK_TLE_FLPOP_CO))
        );

        // 매출: 월 평균
        const monthlySales = avg(
          usedSales.map((r) => num(r.MT_AVRG_SALES_AMT ?? r.THSMON_SELNG_AMT))
        );

        // 신규/폐업 / 총 점포
        const newStores = avg(usedOpClo.map((r) => num(r.OPBIZ_RT ?? r.OPBIZ_STOR_CO)));
        const closedStores = avg(usedOpClo.map((r) => num(r.CLSBIZ_RT ?? r.CLSBIZ_STOR_CO)));
        const totalStoresAvg = avg(usedStores.map((r) => num(r.TOT_STOR_CO ?? r.STOR_CO)));

        const insights: string[] = [];
        if (weekdayFloat > 0)
          insights.push(`평일 평균 유동인구 ${Math.round(weekdayFloat).toLocaleString()}명/일`);
        if (weekendFloat > 0)
          insights.push(`주말 평균 유동인구 ${Math.round(weekendFloat).toLocaleString()}명/일`);
        if (monthlySales > 0)
          insights.push(`월 평균 추정매출 ${(monthlySales / 1_000_000).toFixed(0)}백만원`);
        if (totalStoresAvg > 0) insights.push(`상권당 점포 평균 ${Math.round(totalStoresAvg)}개`);
        if (newStores > 0 || closedStores > 0)
          insights.push(`신규/폐업률 ${newStores.toFixed(1)}% / ${closedStores.toFixed(1)}%`);
        if (insights.length === 0) insights.push("상권 데이터 매칭 부족 — 자치구 평균치 표시");

        const finding: TradeAreaFinding = {
          district: sigungu,
          signgu_cd: signguCd,
          sample_size: districtFoot.length || footResult.rows.length,
          quarter: usedQuarter,
          metrics: {
            avg_weekday_floating: weekdayFloat || undefined,
            avg_weekend_floating: weekendFloat || undefined,
            avg_monthly_sales: monthlySales || undefined,
            new_stores: newStores || undefined,
            closed_stores: closedStores || undefined,
            total_stores: totalStoresAvg || undefined
          },
          insights,
          source: "서울 상권분석 서비스 (data.seoul.go.kr / 4개 endpoint 종합)",
          diagnostic: `${usedQuarter} · foot=${footResult.rows.length} sales=${salesResult?.rows.length ?? 0} stores=${storesResult?.rows.length ?? 0} openClose=${openCloseResult?.rows.length ?? 0} · 자치구 매칭=${districtFoot.length}`
        };
        return finding;
      },
      (finding) => ({
        status: finding && finding.insights.length > 1 ? "success" : "missing",
        outputSummary: finding
          ? `${finding.district} ${finding.quarter} · ${finding.sample_size}개 상권 · ${finding.insights[0] ?? "-"}`
          : "상권분석 데이터 없음"
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "trade area failed";
    trace.record(AGENT, TOOL, inputSummary, message.slice(0, 150), "failed");
    return null;
  }
}
