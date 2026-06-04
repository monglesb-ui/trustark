import { NextResponse } from "next/server";
import { fetchSeoulRestaurants, summarizeSeoulAttempt } from "@/lib/server/seoul-open-api";
import { fetchSchools, summarizeNeisAttempt } from "@/lib/server/neis-api";
import { searchOrdinances, summarizeLawAttempt } from "@/lib/server/law-api";
import {
  fetchStoresInRadius,
  summarizeCommercialAttempt
} from "@/lib/server/commercial-area-api";
import { serverEnv } from "@/lib/server/env";

/**
 * 임시 디버그 endpoint — 3개 신규 API(서울 일반음식점, NEIS 학교, ELIS 자치법규)가
 * 서버 환경변수로 정상 호출되는지 한 번에 점검.
 *
 * 응답은 키 값을 포함하지 않으며, 각 API의 성공/실패·소요 시간·상위 sample만 노출.
 * 검증 후 이 endpoint는 삭제 권장.
 *
 * 사용: GET https://trust-ark.vercel.app/api/debug/api-check
 */

export async function GET() {
  const envSummary = {
    seoulRestaurantApiKey: Boolean(serverEnv.seoulRestaurantApiKey),
    neisApiKey: Boolean(serverEnv.neisApiKey),
    lawApiKey: Boolean(serverEnv.lawApiKey),
    commercialApiKey: Boolean(serverEnv.commercialApiKey)
  };

  // 1) 서울 일반음식점 - 강남구 1페이지 (1~10건)
  const seoulResult = await fetchSeoulRestaurants({
    district: "강남구",
    maxPages: 1,
    pageSize: 10
  });

  // 2) NEIS 학교 - 서울(B10) 1페이지 (1~5건)
  const neisResult = await fetchSchools({
    officeCode: "B10",
    maxPages: 1
  });

  // 3) ELIS 자치법규 - "식품위생" 검색 1페이지
  const lawResult = await searchOrdinances({
    query: "식품위생",
    organization: "서울특별시 강남구",
    display: 5,
    page: 1
  });

  // 4) 소상공인 상권정보 - 강남역 좌표 반경 500m 상가업소 5건
  const commercialResult = await fetchStoresInRadius({
    cx: 127.0276, // 강남역 경도
    cy: 37.4979, // 강남역 위도
    radius: 500,
    numOfRows: 5
  });

  return NextResponse.json({
    env: envSummary,
    checks: {
      seoul_restaurants: {
        ok: seoulResult.ok,
        attempt: summarizeSeoulAttempt(seoulResult.attempt),
        total: seoulResult.totalCount,
        sample_count: seoulResult.rows.length,
        sample: seoulResult.rows.slice(0, 2).map((r) => ({
          businessName: r.BPLCNM,
          status: r.TRDSTATENM,
          address: r.SITEWHLADDR,
          xy: r.X && r.Y ? `${r.X.trim()}, ${r.Y.trim()}` : null
        }))
      },
      neis_schools: {
        ok: neisResult.ok,
        attempt: summarizeNeisAttempt(neisResult.attempt),
        total: neisResult.totalCount,
        sample_count: neisResult.rows.length,
        sample: neisResult.rows.slice(0, 2).map((r) => ({
          name: r.SCHUL_NM,
          kind: r.SCHUL_KND_SC_NM,
          address: r.ORG_RDNMA
        }))
      },
      law_ordinances: {
        ok: lawResult.ok,
        attempt: summarizeLawAttempt(lawResult.attempt),
        raw_top_keys: lawResult.data && typeof lawResult.data === "object"
          ? Object.keys(lawResult.data as Record<string, unknown>).slice(0, 10)
          : null,
        sample: lawResult.rawText ? lawResult.rawText.slice(0, 400) : null
      },
      commercial_stores: {
        ok: commercialResult.ok,
        attempt: summarizeCommercialAttempt(commercialResult.attempt),
        total: commercialResult.totalCount,
        sample_count: commercialResult.items.length,
        sample: commercialResult.items.slice(0, 3).map((r) => ({
          name: r.bizesNm,
          category: r.indsSclsNm ?? r.indsMclsNm ?? r.indsLclsNm,
          address: r.rdnmAdr ?? r.lnoAdr,
          coords: r.lat && r.lon ? `${r.lat}, ${r.lon}` : null
        }))
      }
    },
    note: "이 endpoint는 검증용 임시 라우트. 검증 완료 후 삭제 권장."
  });
}
