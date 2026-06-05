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
import { searchKakaoLocalPaged, type KakaoPlace } from "@/lib/server/kakao-local";
import { extractSeoulSigungu } from "@/lib/server/seoul-districts";
import {
  geocodeAddress,
  searchVworldPlaces,
  type GeocodeResult,
  type VworldPlace
} from "@/lib/server/vworld";
import type { TraceRecorder } from "../trace";

function kakaoPlaceToRow(place: KakaoPlace): CommercialStoreRow {
  return {
    bizesNm: place.place_name,
    indsSclsNm: place.category_group_name ?? place.category_name,
    indsMclsNm: place.category_name,
    rdnmAdr: place.road_address_name,
    lnoAdr: place.address_name
  };
}

function vworldPlaceToRow(place: VworldPlace): CommercialStoreRow {
  return {
    bizesNm: place.title,
    indsSclsNm: place.category,
    indsMclsNm: place.category,
    rdnmAdr: place.roadAddress,
    lnoAdr: place.address
  };
}

/** Haversine 거리 (미터) */
function haversine(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6_371_000;
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLng = toRad(lng2 - lng1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLng / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

/** 입력 주소에서 도로명 추출 (가지번호 제외, "목동로 25길 7" → "목동로 25길") */
function extractRoad(address: string): string | null {
  const m = address.match(/([가-힣A-Za-z0-9]+로(?:\s*\d+길)?)\s*\d+/);
  return m?.[1]?.trim() ?? null;
}

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
        let usedKakao = false;
        let usedVworld = false;
        let vworldDiagnostic = "";

        // ★ 카카오 로컬 키워드 검색 (좌표+반경+카테고리 직접 지원, 최대 45건/검색)
        // 가장 정확. 카페면 CE7 카테고리 그룹 사용.
        const kakaoCategory =
          businessType === "cafe" ? "CE7" :
          businessType === "restaurant" ? "FD6" :
          businessType === "academy" ? "AC5" :
          undefined;

        const kakaoResult = await searchKakaoLocalPaged({
          query: businessLabel,
          cx: lng,
          cy: lat,
          radius: radiusMeters,
          categoryGroupCode: kakaoCategory,
          sort: "distance"
        });
        // 카카오 호출 결과를 즉시 trace에 기록 — 401/0건 등 진단 패널에서 확인 가능
        trace.record(
          AGENT,
          "kakaoLocalSearch",
          `q=${businessLabel} cat=${kakaoCategory ?? "?"} r=${radiusMeters}m`,
          kakaoResult.ok
            ? `places=${kakaoResult.places.length} total=${kakaoResult.total} ${kakaoResult.attempt.durationMs}ms`
            : `실패 HTTP ${kakaoResult.attempt.httpStatus ?? "?"} · ${kakaoResult.attempt.error?.slice(0, 100) ?? "unknown"}`,
          kakaoResult.ok ? (kakaoResult.places.length > 0 ? "success" : "missing") : "failed"
        );

        // 0차: VWorld Search API (POI + 좌표+반경 직접 검색)를 먼저 시도
        // 카페면 "카페"·"커피" 두 키워드 시도해서 누적
        const vworldQueries = businessType === "cafe" ? ["카페", "커피전문점"] : [businessLabel];
        const vworldPlacesAll: VworldPlace[] = [];
        const vworldAttempts: string[] = [];
        for (const q of vworldQueries) {
          const r = await searchVworldPlaces({
            query: q,
            cx: lng,
            cy: lat,
            radius: radiusMeters,
            size: 100
          });
          vworldAttempts.push(
            `${q}: ${r.ok ? `${r.places.length}건/${r.total}` : `err=${r.attempt.error?.slice(0, 40) ?? "?"}`}`
          );
          if (r.ok && r.places.length > 0) {
            vworldPlacesAll.push(...r.places);
            vworldDiagnostic += `${q}=${r.places.length}건; `;
          }
        }
        // VWorld 호출 결과를 진단 패널에 명시
        trace.record(
          AGENT,
          "vworldSearch",
          `cx=${lng.toFixed(4)} cy=${lat.toFixed(4)} r=${radiusMeters}m`,
          vworldAttempts.join(" / "),
          vworldPlacesAll.length > 0 ? "success" : "missing"
        );
        // 중복 제거 (title + address)
        const vworldDedup = Array.from(
          new Map(vworldPlacesAll.map((p) => [`${p.title}|${p.address}`, p])).values()
        );
        const vworldFiltered = vworldDedup.sort((a, b) => (a.distance ?? 0) - (b.distance ?? 0));

        let result: Awaited<ReturnType<typeof fetchStoresInRadius>> | {
          ok: boolean;
          items: CommercialStoreRow[];
          totalCount: number;
          rawText: undefined;
          attempt: {
            endpoint: string;
            urlRedacted: string;
            httpStatus?: number;
            totalCount?: number;
            rowCount?: number;
            durationMs: number;
          };
        };
        let effectiveRadius = radiusMeters;
        let fallbackNote = "";
        let primarySource = "";

        // ★ 1순위 — 카카오 로컬 (가장 정확, 카테고리+반경 직접 지원)
        if (kakaoResult.ok && kakaoResult.places.length > 0) {
          result = {
            ok: true,
            items: kakaoResult.places.map(kakaoPlaceToRow),
            totalCount: kakaoResult.places.length,
            rawText: undefined,
            attempt: {
              endpoint: "kakao-local",
              urlRedacted: `q=${businessLabel} cat=${kakaoCategory ?? "n/a"} r=${radiusMeters}m`,
              httpStatus: kakaoResult.attempt.httpStatus,
              totalCount: kakaoResult.total,
              rowCount: kakaoResult.places.length,
              durationMs: kakaoResult.attempt.durationMs
            }
          };
          usedKakao = true;
          primarySource = "Kakao Local";
          fallbackNote = `(Kakao Local "${businessLabel}" ${kakaoCategory ?? ""} · 반경 ${radiusMeters}m 이내 ${kakaoResult.places.length}건 · 거리순 정렬)`;
        }
        // 2순위 — VWorld Search (POI)
        else if (vworldFiltered.length > 0) {
          result = {
            ok: true,
            items: vworldFiltered.map(vworldPlaceToRow),
            totalCount: vworldFiltered.length,
            rawText: undefined,
            attempt: {
              endpoint: "vworld-search",
              urlRedacted: `queries=[${vworldQueries.join(",")}]`,
              httpStatus: 200,
              totalCount: vworldFiltered.length,
              rowCount: vworldFiltered.length,
              durationMs: 0
            }
          };
          usedVworld = true;
          primarySource = "VWorld Search";
          fallbackNote = `(VWorld POI · ${vworldQueries.join("+")} · ${radiusMeters}m 이내 ${vworldFiltered.length}건)`;
        } else {
          // 3순위 — 소상공인 상권 API
          result = await fetchStoresInRadius({
            cx: lng,
            cy: lat,
            radius: radiusMeters,
            indsLcls: lcls,
            numOfRows: 1000
          });
        }

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

        // 5차 fallback: 소상공인 API 모두 0건이면 Naver Local 검색 + 거리 필터
        // - 쿼리: 도로명 우선 → 동 → 자치구 단계적 정밀도
        // - 결과 5건을 각각 vworld geocode로 좌표 변환 → 사용자 좌표 기준 거리 계산
        // - 입력 radius(200m) 이내만 카운트, 결과는 가까운 순 정렬
        let usedNaverFallback = false;
        let naverDiagnostic = "";
        if (result.items.length === 0) {
          const road = extractRoad(payload.address ?? "");
          const dong = extractDong(payload.address ?? "");
          // Naver Local 5건/쿼리 한도를 우회하기 위해 다양한 키워드 조합 (cafe 동의어 활용)
          const cafeSynonyms = businessType === "cafe" ? ["카페", "커피", "디저트", "베이커리"] : [businessLabel];
          const queries: string[] = [];
          for (const kw of cafeSynonyms) {
            if (road) queries.push(`${road} ${kw}`);
          }
          if (dong) queries.push(`${dong} ${businessLabel}`);
          if (sigungu) queries.push(`${sigungu} ${businessLabel}`);

          let combinedItems: NaverLocalItem[] = [];
          let usedQueries: string[] = [];
          // 모든 쿼리를 시도해 결과 누적 (최대 30건)
          for (const q of queries) {
            const r = await searchNaverLocal(q, 5);
            if (r.items.length > 0) {
              combinedItems = combinedItems.concat(r.items);
              usedQueries.push(q);
              if (combinedItems.length >= 30) break;
            }
          }
          // 중복 제거 (같은 도로명 주소 기준)
          const dedup = Array.from(
            new Map(combinedItems.map((i) => [i.roadAddress || i.address || i.title, i])).values()
          );

          if (dedup.length > 0) {
            // Naver Local의 mapx/mapy는 WGS84 좌표를 1e7 곱한 값.
            // 직접 변환 가능 — vworld 재호출 불필요 (성능 +25x).
            // mapx/mapy 누락된 경우만 vworld 호출 fallback.
            const enriched = await Promise.all(
              dedup.slice(0, 30).map(async (item) => {
                if (typeof item.mapx === "number" && typeof item.mapy === "number") {
                  const itemLng = item.mapx / 1e7;
                  const itemLat = item.mapy / 1e7;
                  // 한국 좌표 범위 sanity check (124~132 lng, 33~39 lat)
                  if (itemLng >= 124 && itemLng <= 132 && itemLat >= 33 && itemLat <= 39) {
                    const distance = haversine(lat, lng, itemLat, itemLng);
                    return { item, distance };
                  }
                }
                // mapx/mapy 없거나 범위 외 — vworld fallback
                try {
                  const g = await geocodeAddress(item.roadAddress || item.address);
                  if (g.result) {
                    const distance = haversine(lat, lng, g.result.lat, g.result.lng);
                    return { item, distance };
                  }
                } catch {}
                return { item, distance: Number.POSITIVE_INFINITY };
              })
            );

            // 입력 radius(200m) 이내 매장 우선, 그 외는 보조 (1km 이내)
            const withinRadius = enriched.filter((e) => e.distance <= radiusMeters);
            const within1km = enriched.filter(
              (e) => e.distance > radiusMeters && e.distance <= 1000
            );
            const sorted = [...withinRadius, ...within1km].sort((a, b) => a.distance - b.distance);

            if (sorted.length > 0) {
              result = {
                ok: true,
                items: sorted.map((s) => naverLocalToRow(s.item)),
                totalCount: sorted.length,
                rawText: undefined,
                attempt: {
                  endpoint: "naver-local+geocode",
                  urlRedacted: `queries=[${usedQueries.join(", ")}]`,
                  httpStatus: 200,
                  totalCount: sorted.length,
                  rowCount: sorted.length,
                  durationMs: 0
                }
              };
              effectiveRadius = withinRadius.length > 0 ? radiusMeters : 1000;
              fallbackNote = `(Naver Local "${usedQueries[0] ?? ""}" + 좌표 거리 필터 · ${withinRadius.length}건은 ${radiusMeters}m 이내, ${within1km.length}건은 1km 이내)`;
              naverDiagnostic = sorted
                .slice(0, 5)
                .map((s) => `${s.item.title.slice(0, 12)}:${Math.round(s.distance)}m`)
                .join(", ");
              usedNaverFallback = true;
            }
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

        // 카드 헤더에 표시될 반경은 사용자가 입력한 radiusMeters를 유지 (혼란 방지).
        // 실제 검색 반경 차이는 note 텍스트로만 명시.
        const finding: CompetitionDensityFinding = {
          business_type_label: businessLabel,
          radius_meters: radiusMeters,
          total_stores: filtered.length,
          all_stores_in_radius: result.items.length,
          density_label: density.label,
          density_score: density.score,
          sample_stores: sampleStores,
          source: usedKakao
            ? "Kakao Local (좌표+반경+카테고리 직접 검색, 거리순 정렬)"
            : usedVworld
              ? "VWorld Search POI (좌표+반경 검색)"
              : usedNaverFallback
                ? "Naver Local + vworld geocode (사용자 좌표 기준 Haversine 거리)"
                : "소상공인진흥공단 상권정보 API",
          diagnostic: usedNaverFallback
            ? `${summarizeCommercialAttempt(result.attempt)} · 거리: ${naverDiagnostic}`
            : summarizeCommercialAttempt(result.attempt),
          note:
            filtered.length === 0
              ? `반경 ${radiusMeters}m에서 ${businessLabel} 매장이 검색되지 않았습니다. ${fallbackNote}`
              : `${businessLabel} ${filtered.length}건 매칭 (${effectiveRadius === 0 ? "자치구 전체" : `${effectiveRadius}m 검색범위`}, 전체 매장 ${result.items.length}건 중). ${fallbackNote}`
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
