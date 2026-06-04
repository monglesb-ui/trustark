import type {
  AnalyzeRequest,
  BusinessType,
  CompetitionDensityFinding,
  DensityLabel
} from "@/lib/types";
import {
  fetchStoresByUpjong,
  fetchStoresInRadius,
  summarizeCommercialAttempt,
  type CommercialStoreRow
} from "@/lib/server/commercial-area-api";
import { searchNaverLocal, type NaverLocalItem } from "@/lib/server/naver-search";
import { extractSeoulSigungu } from "@/lib/server/seoul-districts";
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

/** Naver Local item → CommercialStoreRow 형태로 변환 (filterByBusinessType 호환) */
function naverLocalToRow(item: NaverLocalItem): CommercialStoreRow {
  return {
    bizesNm: item.title,
    indsSclsNm: item.category,
    indsMclsNm: item.category,
    rdnmAdr: item.roadAddress,
    lnoAdr: item.address
  };
}

/** 입력 주소에서 동(법정동/행정동) 추출 */
function extractDong(address: string): string | null {
  const m = address.match(/([가-힣]+동)(?:\s|\d|$)/);
  return m?.[1] ?? null;
}

export async function runCompetitionDensityAgent({
  payload,
  geocode,
  trace,
  radiusMeters = 200
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
        let fallbackNote = "";

        // 2차 fallback: 1000m로 확장
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
            fallbackNote = "(반경 1000m로 자동 확장)";
          }
        }

        // 3차 fallback: 자치구 중심 좌표로 1000m 재호출 (API 외곽 데이터 누락 대응)
        const { sigungu, signguCd, center } = extractSeoulSigungu(payload.address ?? "");
        if (result.ok && result.items.length === 0 && center) {
          const recentered = await fetchStoresInRadius({
            cx: center.lng,
            cy: center.lat,
            radius: 1000,
            indsLcls: lcls,
            numOfRows: 1000
          });
          if (recentered.ok && recentered.items.length > 0) {
            result = recentered;
            effectiveRadius = 1000;
            fallbackNote = `(${sigungu ?? "자치구"} 중심 좌표로 재호출 — 입력 좌표 외곽 데이터 누락 대응)`;
          }
        }

        // 4차 fallback: 자치구 단위 호출 (좌표 무관)
        if (result.ok && result.items.length === 0 && signguCd) {
          const byDistrict = await fetchStoresByUpjong({
            indsLcls: lcls,
            ctprvnCd: "11",
            signguCd,
            numOfRows: 1000
          });
          if (byDistrict.ok && byDistrict.items.length > 0) {
            result = byDistrict;
            effectiveRadius = 0;
            fallbackNote = `(반경 검색 모두 0건 → ${sigungu ?? "자치구"} 전체로 fallback)`;
          }
        }

        if (!result.ok) {
          throw new Error(summarizeCommercialAttempt(result.attempt));
        }

        // 5차 fallback: 소상공인 API 모두 0건이면 Naver Local 검색 사용
        // (실시간으로 인근 매장 직접 검색. 신정동·목동 등 외곽 데이터 한계 우회)
        let usedNaverFallback = false;
        if (result.items.length === 0) {
          const dong = extractDong(payload.address ?? "");
          const locationKw = dong || sigungu || payload.address?.slice(0, 20) || "서울";
          const naverQuery = `${locationKw} ${businessLabel}`;
          const naverResult = await searchNaverLocal(naverQuery, 5);
          if (naverResult.items.length > 0) {
            result = {
              ok: true,
              items: naverResult.items.map(naverLocalToRow),
              totalCount: naverResult.total,
              rawText: undefined,
              attempt: {
                endpoint: "naver-local",
                urlRedacted: `query=${naverQuery}`,
                httpStatus: naverResult.diagnostics.httpStatus,
                totalCount: naverResult.total,
                rowCount: naverResult.items.length,
                durationMs: 0
              }
            };
            effectiveRadius = 0;
            fallbackNote = `(반경 검색 모두 0건 → Naver 지역 검색 "${naverQuery}"으로 fallback · 정확한 반경 거리는 추후 보강)`;
            usedNaverFallback = true;
          }
        }

        const filtered = filterByBusinessType(result.items, businessType);
        // Naver fallback의 경우 카테고리에 "카페" 포함 매장이 모두 매칭되니 그대로 filtered 사용
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
          source: usedNaverFallback
            ? "Naver 지역 검색 (소상공인 API 데이터 부족 시 fallback)"
            : "소상공인진흥공단 상권정보 API",
          diagnostic: summarizeCommercialAttempt(result.attempt),
          note:
            filtered.length === 0
              ? `이 ${effectiveRadius === 0 ? "자치구" : `반경 ${effectiveRadius}m`}에서 ${businessLabel} 매장이 검색되지 않았습니다. ${fallbackNote}`
              : `${effectiveRadius === 0 ? "자치구 전체" : `반경 ${effectiveRadius}m`} 내 ${businessLabel} ${filtered.length}건 운영 중 (전체 매장 ${result.items.length}건 중). ${fallbackNote}`
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
