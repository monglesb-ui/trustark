import type {
  AnalyzeRequest,
  BusinessType,
  CompetitionDensityFinding,
  DensityLabel
} from "@/lib/types";
import {
  fetchStoresInRadius,
  summarizeCommercialAttempt,
  type CommercialStoreRow
} from "@/lib/server/commercial-area-api";
import type { GeocodeResult } from "@/lib/server/vworld";
import type { TraceRecorder } from "../trace";

const AGENT = "Search Context Agent" as const; // 기존 trace union 재사용 — 추후 별도 agent명 추가 가능
const TOOL = "fetchStoresInRadius" as const;

/** 업종 → 소상공인 상권정보 대분류 코드 매핑 (대략). undefined면 필터 없이 호출하고 name 필터링으로 보강 */
const BUSINESS_TYPE_TO_LCLS: Partial<Record<BusinessType, string>> = {
  restaurant: "I", // 음식
  cafe: "I", // 음식 (커피점/카페)
  beauty: "F", // 생활서비스
  pc_room: "O", // 관광/여가/오락
  karaoke: "O"
};

/** 업종명 키워드 정규식 (응답 row의 indsSclsNm/indsMclsNm/bizesNm에 매칭) */
const BUSINESS_TYPE_KEYWORDS: Partial<Record<BusinessType, RegExp>> = {
  restaurant: /(한식|중식|양식|일식|분식|음식점|식당|뷔페|기타.*음식)/,
  cafe: /(카페|커피|디저트|베이커리|제과|coffee)/i,
  beauty: /(미용|헤어|이용|네일|메이크업|에스테틱)/,
  academy: /(학원|교습|과외)/,
  pc_room: /(PC|피씨|컴퓨터.*게임)/i,
  karaoke: /(노래|코노|karaoke|가라오케)/i
};

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  restaurant: "음식점",
  cafe: "카페",
  beauty: "미용실·이용원",
  academy: "학원·교습소",
  pc_room: "PC방",
  karaoke: "노래방",
  other: "기타 업종"
};

function labelDensity(filteredCount: number): { label: DensityLabel; score: number } {
  // 단순 임계값. 향후 자치구·업종별 baseline으로 정교화 가능.
  if (filteredCount >= 30) return { label: "매우 높음", score: 90 };
  if (filteredCount >= 15) return { label: "높음", score: 70 };
  if (filteredCount >= 5) return { label: "보통", score: 45 };
  return { label: "낮음", score: 20 };
}

function filterByBusinessType(rows: CommercialStoreRow[], type: BusinessType): CommercialStoreRow[] {
  const regex = BUSINESS_TYPE_KEYWORDS[type];
  if (!regex) return rows;
  return rows.filter((row) => {
    const text = `${row.indsSclsNm ?? ""} ${row.indsMclsNm ?? ""} ${row.bizesNm ?? ""}`;
    return regex.test(text);
  });
}

export async function runCompetitionDensityAgent({
  payload,
  geocode,
  trace,
  radiusMeters = 500
}: {
  payload: AnalyzeRequest;
  geocode: GeocodeResult | null;
  trace: TraceRecorder;
  radiusMeters?: number;
}): Promise<CompetitionDensityFinding | null> {
  const lat = geocode?.result?.lat;
  const lng = geocode?.result?.lng;
  if (typeof lat !== "number" || typeof lng !== "number") {
    trace.record(
      AGENT,
      TOOL,
      `business=${payload.business_type ?? "?"} address=${payload.address}`,
      "좌표 미확보 — 동종업종 검색 생략",
      "missing"
    );
    return null;
  }

  const businessType = (payload.business_type ?? "other") as BusinessType;
  const businessLabel = BUSINESS_TYPE_LABELS[businessType] ?? businessType;
  const lcls = BUSINESS_TYPE_TO_LCLS[businessType];

  const inputSummary = `cx=${lng.toFixed(4)} cy=${lat.toFixed(4)} r=${radiusMeters}m type=${businessType}${lcls ? ` lcls=${lcls}` : ""}`;

  try {
    return await trace.run(
      AGENT,
      TOOL,
      inputSummary,
      async () => {
        // 1차: 입력 radius로 시도
        let result = await fetchStoresInRadius({
          cx: lng,
          cy: lat,
          radius: radiusMeters,
          indsLcls: lcls,
          numOfRows: 1000
        });
        let effectiveRadius = radiusMeters;
        // 2차 fallback: 외곽·주거지역에서 0건이면 1000m로 확장 (최대치)
        if (result.ok && result.items.length === 0 && radiusMeters < 1000) {
          const expanded = await fetchStoresInRadius({
            cx: lng,
            cy: lat,
            radius: 1000,
            indsLcls: lcls,
            numOfRows: 1000
          });
          if (expanded.ok && expanded.items.length > 0) {
            result = expanded;
            effectiveRadius = 1000;
          }
        }

        if (!result.ok) {
          throw new Error(summarizeCommercialAttempt(result.attempt));
        }

        const filtered = filterByBusinessType(result.items, businessType);
        const density = labelDensity(filtered.length);
        const sampleStores = filtered.slice(0, 5).map((s) => ({
          name: s.bizesNm ?? "(이름 없음)",
          category: s.indsSclsNm ?? s.indsMclsNm,
          address: s.rdnmAdr ?? s.lnoAdr
        }));

        const finding: CompetitionDensityFinding = {
          business_type_label: businessLabel,
          radius_meters: effectiveRadius,
          total_stores: filtered.length,
          all_stores_in_radius: result.items.length,
          density_label: density.label,
          density_score: density.score,
          sample_stores: sampleStores,
          source: "소상공인진흥공단 상권정보 API",
          diagnostic: summarizeCommercialAttempt(result.attempt),
          note:
            filtered.length === 0
              ? "이 반경에서 동종업종 매장이 검색되지 않았습니다. 입력 좌표·업종 필터를 다시 확인해 보세요."
              : `반경 ${radiusMeters}m 내 ${businessLabel} ${filtered.length}건 운영 중 (반경 전체 매장 ${result.items.length}건 중).`
        };
        return finding;
      },
      (finding) => ({
        status: finding && finding.total_stores > 0 ? "success" : "missing",
        outputSummary: finding
          ? `${finding.business_type_label} ${finding.total_stores}건 / 반경 ${finding.radius_meters}m 전체 ${finding.all_stores_in_radius}건 · ${finding.density_label}`
          : "결과 없음"
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "competition density 호출 실패";
    trace.record(AGENT, TOOL, inputSummary, message.slice(0, 120), "failed");
    return null;
  }
}
