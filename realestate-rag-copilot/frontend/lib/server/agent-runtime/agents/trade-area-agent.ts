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
 *  여러 가능한 필드명·매칭 방식을 시도. */
function rowMatchesDistrict(row: SeoulTradeAreaRow, signguCd: string, sigunguName?: string): boolean {
  // 1) SIGNGU_CD 직접 매칭
  const explicitSiggng = String(row.SIGNGU_CD ?? row.SGG_CD ?? "");
  if (explicitSiggng && (explicitSiggng === signguCd || explicitSiggng.startsWith(signguCd))) return true;
  // 2) SIGNGU_CD_NM (시군구명) 매칭
  const sigunguNm = String(row.SIGNGU_CD_NM ?? row.SGG_CD_NM ?? row.SIGNGU_NM ?? "");
  if (sigunguName && sigunguNm && sigunguNm.includes(sigunguName)) return true;
  // 3) ADSTRD_CD 앞 5자리 = 시군구코드
  const adstrd = String(row.ADSTRD_CD ?? row.ADSTRD_CODE ?? "");
  if (adstrd && adstrd.startsWith(signguCd)) return true;
  // 4) TRDAR_CD_NM에 자치구명 포함 (예: "강남구 신논현역")
  const trdarNm = String(row.TRDAR_CD_NM ?? "");
  if (sigunguName && trdarNm && trdarNm.includes(sigunguName)) return true;
  // 5) 상권 영역 코드 매칭 (서울 상권코드 일부는 시군구 prefix 사용)
  const trdar = String(row.TRDAR_CD ?? "");
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

        // ★ 진단 — 응답 첫 row의 키 집합을 trace에 노출 (실제 필드명 식별용)
        const footFirstKeys = Object.keys(footResult.rows[0] ?? {}).slice(0, 25).join(",");
        const salesFirstKeys = salesResult?.rows[0] ? Object.keys(salesResult.rows[0]).slice(0, 20).join(",") : "(없음)";
        const storesFirstKeys = storesResult?.rows[0] ? Object.keys(storesResult.rows[0]).slice(0, 20).join(",") : "(없음)";
        trace.record(
          AGENT,
          "responseFields",
          `${usedQuarter} foot=${footResult.rows.length}`,
          `foot.keys=[${footFirstKeys}] sales.keys=[${salesFirstKeys}] stores.keys=[${storesFirstKeys}]`,
          "success"
        );

        // 자치구 필터
        const districtFoot = footResult.rows.filter((r) => rowMatchesDistrict(r, signguCd, sigungu));
        const districtSales = salesResult?.rows.filter((r) => rowMatchesDistrict(r, signguCd, sigungu)) ?? [];
        const districtStores = storesResult?.rows.filter((r) => rowMatchesDistrict(r, signguCd, sigungu)) ?? [];
        const districtOpClo = openCloseResult?.rows.filter((r) => rowMatchesDistrict(r, signguCd, sigungu)) ?? [];

        // 진단 — 자치구 매칭 결과
        trace.record(
          AGENT,
          "districtMatch",
          `signguCd=${signguCd}`,
          `foot=${districtFoot.length}/${footResult.rows.length} sales=${districtSales.length}/${salesResult?.rows.length ?? 0} stores=${districtStores.length}/${storesResult?.rows.length ?? 0}`,
          districtFoot.length > 0 ? "success" : "missing"
        );

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

        // 연령대별 유동 비율 (총합 대비)
        const totalFlow = avg(usedFoot.map((r) => num(r.TOT_FLPOP_CO))) || 1;
        const age20s = (avg(usedFoot.map((r) => num(r.AGRDE_20_FLPOP_CO))) / totalFlow) * 100;
        const age30s = (avg(usedFoot.map((r) => num(r.AGRDE_30_FLPOP_CO))) / totalFlow) * 100;
        const age40s = (avg(usedFoot.map((r) => num(r.AGRDE_40_FLPOP_CO))) / totalFlow) * 100;

        // 남녀 비율
        const maleFlow = avg(usedFoot.map((r) => num(r.ML_FLPOP_CO)));
        const femaleFlow = avg(usedFoot.map((r) => num(r.FML_FLPOP_CO)));
        const sumMF = maleFlow + femaleFlow;
        const maleRatio = sumMF > 0 ? (maleFlow / sumMF) * 100 : 0;
        const femaleRatio = sumMF > 0 ? (femaleFlow / sumMF) * 100 : 0;

        // 시간대별 피크 (TIME_*_FLPOP_CO 중 최대)
        const hourKeys = [
          "TMZON_00_06_FLPOP_CO",
          "TMZON_06_11_FLPOP_CO",
          "TMZON_11_14_FLPOP_CO",
          "TMZON_14_17_FLPOP_CO",
          "TMZON_17_21_FLPOP_CO",
          "TMZON_21_24_FLPOP_CO"
        ];
        const hourLabels = ["00-06시", "06-11시", "11-14시", "14-17시", "17-21시", "21-24시"];
        const hourValues = hourKeys.map((k) => avg(usedFoot.map((r) => num(r[k]))));
        const peakHourIdx = hourValues.indexOf(Math.max(...hourValues));
        const peakHour = hourValues[peakHourIdx] > 0 ? hourLabels[peakHourIdx] : undefined;

        // 요일별 피크
        const dayKeys = [
          "MON_FLPOP_CO",
          "TUES_FLPOP_CO",
          "WED_FLPOP_CO",
          "THUR_FLPOP_CO",
          "FRI_FLPOP_CO",
          "SAT_FLPOP_CO",
          "SUN_FLPOP_CO"
        ];
        const dayLabels = ["월", "화", "수", "목", "금", "토", "일"];
        const dayValues = dayKeys.map((k) => avg(usedFoot.map((r) => num(r[k]))));
        const peakDayIdx = dayValues.indexOf(Math.max(...dayValues));
        const peakDay = dayValues[peakDayIdx] > 0 ? `${dayLabels[peakDayIdx]}요일` : undefined;

        // 매출: 월 평균
        const monthlySales = avg(
          usedSales.map((r) => num(r.MT_AVRG_SALES_AMT ?? r.THSMON_SELNG_AMT))
        );
        const monthlySalesCount = avg(
          usedSales.map((r) => num(r.THSMON_SELNG_CO ?? r.MT_AVRG_SALES_CO))
        );

        // 신규/폐업 / 총 점포 / 프랜차이즈
        const newStores = avg(usedOpClo.map((r) => num(r.OPBIZ_RT ?? r.OPBIZ_STOR_CO)));
        const closedStores = avg(usedOpClo.map((r) => num(r.CLSBIZ_RT ?? r.CLSBIZ_STOR_CO)));
        const totalStoresAvg = avg(usedStores.map((r) => num(r.TOT_STOR_CO ?? r.STOR_CO)));
        const franchiseStores = avg(usedStores.map((r) => num(r.FRC_STOR_CO)));

        const insights: string[] = [];
        if (weekdayFloat > 0)
          insights.push(`평일 평균 유동인구 ${Math.round(weekdayFloat).toLocaleString()}명/일`);
        if (weekendFloat > 0)
          insights.push(`주말 평균 유동인구 ${Math.round(weekendFloat).toLocaleString()}명/일`);
        if (peakDay) insights.push(`피크 요일: ${peakDay}`);
        if (peakHour) insights.push(`피크 시간대: ${peakHour}`);
        if (age20s + age30s > 0)
          insights.push(`주력 연령대: 20대 ${age20s.toFixed(1)}% / 30대 ${age30s.toFixed(1)}% / 40대 ${age40s.toFixed(1)}%`);
        if (sumMF > 0)
          insights.push(`성별 비율: 남성 ${maleRatio.toFixed(1)}% / 여성 ${femaleRatio.toFixed(1)}%`);
        if (monthlySales > 0)
          insights.push(`월 평균 추정매출 ${(monthlySales / 1_000_000).toFixed(0)}백만원`);
        if (totalStoresAvg > 0) insights.push(`상권당 점포 평균 ${Math.round(totalStoresAvg)}개`);
        if (franchiseStores > 0)
          insights.push(`프랜차이즈 비율: ${((franchiseStores / totalStoresAvg) * 100).toFixed(1)}%`);
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
            avg_sales_count: monthlySalesCount || undefined,
            new_stores: newStores || undefined,
            closed_stores: closedStores || undefined,
            total_stores: totalStoresAvg || undefined,
            franchise_stores: franchiseStores || undefined,
            age_20s_ratio: age20s || undefined,
            age_30s_ratio: age30s || undefined,
            age_40s_ratio: age40s || undefined,
            male_ratio: maleRatio || undefined,
            female_ratio: femaleRatio || undefined,
            peak_hour: peakHour,
            peak_day: peakDay
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
          ? `${finding.district} ${finding.quarter} · ${finding.sample_size}개 상권 · ${finding.insights.slice(0, 2).join(" / ")} · 키집합=${Object.keys(finding.metrics).filter((k) => (finding.metrics as Record<string, unknown>)[k] != null).join(",")}`
          : "상권분석 데이터 없음"
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "trade area failed";
    trace.record(AGENT, TOOL, inputSummary, message.slice(0, 150), "failed");
    return null;
  }
}
