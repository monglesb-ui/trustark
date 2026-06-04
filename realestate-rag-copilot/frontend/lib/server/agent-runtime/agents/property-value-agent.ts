import type { AnalyzeRequest, PropertyValueFinding } from "@/lib/types";
import {
  lookupRentMarketSummary,
  lookupSaleMarketSummary
} from "@/lib/server/real-transactions";
import type { TraceRecorder } from "../trace";

const AGENT = "Market Data Agent" as const;
const TOOL = "lookupRegionalMarket" as const;

// 서울 25개 자치구 → LAWD_CD 5자리. 전국 확장 가능하지만 우선 서울 위주 데모.
const SEOUL_LAWD_CODE: Record<string, string> = {
  종로구: "11110",
  중구: "11140",
  용산구: "11170",
  성동구: "11200",
  광진구: "11215",
  동대문구: "11230",
  중랑구: "11260",
  성북구: "11290",
  강북구: "11305",
  도봉구: "11320",
  노원구: "11350",
  은평구: "11380",
  서대문구: "11410",
  마포구: "11440",
  양천구: "11470",
  강서구: "11500",
  구로구: "11530",
  금천구: "11545",
  영등포구: "11560",
  동작구: "11590",
  관악구: "11620",
  서초구: "11650",
  강남구: "11680",
  송파구: "11710",
  강동구: "11740"
};

function extractLawdCode(address: string): { lawdCode?: string; sigungu?: string } {
  const sigunguMatch = address.match(/([가-힣]+구)\s/);
  const sigungu = sigunguMatch?.[1];
  if (!sigungu) return {};
  const lawdCode = SEOUL_LAWD_CODE[sigungu];
  return { lawdCode, sigungu };
}

function regionLabel(address: string, sigungu: string | undefined): string {
  const roadMatch = address.match(/([가-힣A-Za-z0-9]+(?:로|길))\s*\d+/);
  if (roadMatch && sigungu) return `${sigungu} ${roadMatch[1]}`;
  return sigungu ?? address.slice(0, 30);
}

export async function runPropertyValueAgent({
  payload,
  trace
}: {
  payload: AnalyzeRequest;
  trace: TraceRecorder;
}): Promise<PropertyValueFinding | null> {
  const address = payload.address ?? "";
  const { lawdCode, sigungu } = extractLawdCode(address);
  const inputSummary = `address=${address.slice(0, 40)} sigungu=${sigungu ?? "?"} lawd=${lawdCode ?? "?"}`;

  if (!lawdCode) {
    trace.record(AGENT, TOOL, inputSummary, "자치구 추출 실패 또는 서울 외 지역 — 시세 조회 생략", "missing");
    return null;
  }

  try {
    return await trace.run(
      AGENT,
      TOOL,
      inputSummary,
      async () => {
        const [saleResult, rentResult] = await Promise.all([
          lookupSaleMarketSummary(lawdCode, "apartment", address),
          lookupRentMarketSummary(lawdCode, "apartment", "monthly", address)
        ]);

        const sale = saleResult.summary;
        const rent = rentResult.summary;

        const dealMonths = Array.from(
          new Set([...(sale?.dealMonths ?? []), ...(rent?.dealMonths ?? [])])
        ).sort();

        const finding: PropertyValueFinding = {
          region_label: regionLabel(address, sigungu),
          reference_property_type: "아파트 (참고 시세 — 상업용 부동산 전용 endpoint는 추후 연동)",
          average_sale_price: sale?.averageSalePrice ?? null,
          average_deposit: rent?.averageDeposit ?? null,
          average_monthly_rent: rent?.averageMonthlyRent ?? null,
          sale_sample_size: sale?.sampleSize ?? 0,
          rent_sample_size: rent?.sampleSize ?? 0,
          deal_months: dealMonths,
          source: "data.go.kr 국토부 실거래가 (아파트 매매 + 전월세)",
          diagnostic: `sale=${sale?.sampleSize ?? 0}건 / rent=${rent?.sampleSize ?? 0}건`,
          note:
            (sale?.sampleSize ?? 0) + (rent?.sampleSize ?? 0) === 0
              ? "이 법정동의 최근 6개월 실거래 데이터를 찾지 못했습니다. 사용자 입력 주소를 재확인하세요."
              : `최근 ${dealMonths.length}개월 거래 데이터 기준. 상업용 부동산 시세는 인근 아파트 시세를 참고치로 활용 — 실제 상가 시세와 차이 있을 수 있음.`
        };
        return finding;
      },
      (finding) => ({
        status:
          finding && (finding.sale_sample_size > 0 || finding.rent_sample_size > 0)
            ? "success"
            : "missing",
        outputSummary: finding
          ? `${finding.region_label} · sale=${finding.sale_sample_size}건 · rent=${finding.rent_sample_size}건`
          : "실거래 0건"
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "시세 조회 실패";
    trace.record(AGENT, TOOL, inputSummary, message.slice(0, 120), "failed");
    return null;
  }
}
