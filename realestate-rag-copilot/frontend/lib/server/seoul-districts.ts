/**
 * 서울 25개 자치구의 시군구 코드 매핑.
 *
 * - LAWD_CD: 국토부 실거래가 API (앞 5자리 시군구코드)
 * - signguCd: 행정안전부 표준 시군구 코드 (동일 5자리)
 *
 * 추후 전국 확장 시 별도 모듈로 분리.
 */
/** 자치구별 중심 좌표 (자치구청 또는 자치구 대표 상권 좌표).
 *  좌표 API 외곽 데이터 누락 시 fallback용. */
export const SEOUL_SIGUNGU_CENTER: Record<string, { lat: number; lng: number }> = {
  종로구: { lat: 37.5735, lng: 126.9788 },
  중구: { lat: 37.5641, lng: 126.9979 },
  용산구: { lat: 37.5326, lng: 126.9904 },
  성동구: { lat: 37.5634, lng: 127.0369 },
  광진구: { lat: 37.5384, lng: 127.0826 },
  동대문구: { lat: 37.5743, lng: 127.0395 },
  중랑구: { lat: 37.6065, lng: 127.0926 },
  성북구: { lat: 37.5894, lng: 127.0167 },
  강북구: { lat: 37.6396, lng: 127.0257 },
  도봉구: { lat: 37.6688, lng: 127.0471 },
  노원구: { lat: 37.6541, lng: 127.0568 },
  은평구: { lat: 37.6027, lng: 126.9291 },
  서대문구: { lat: 37.5791, lng: 126.9368 },
  마포구: { lat: 37.5663, lng: 126.9019 },
  양천구: { lat: 37.5169, lng: 126.8665 }, // 목동중심상권
  강서구: { lat: 37.5509, lng: 126.8495 },
  구로구: { lat: 37.4955, lng: 126.8874 },
  금천구: { lat: 37.4569, lng: 126.8956 },
  영등포구: { lat: 37.5264, lng: 126.8963 },
  동작구: { lat: 37.5124, lng: 126.9393 },
  관악구: { lat: 37.4784, lng: 126.9516 },
  서초구: { lat: 37.4836, lng: 127.0327 },
  강남구: { lat: 37.5172, lng: 127.0473 },
  송파구: { lat: 37.5145, lng: 127.1056 },
  강동구: { lat: 37.5301, lng: 127.1238 }
};

export const SEOUL_SIGUNGU_CODE: Record<string, string> = {
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

export function extractSeoulSigungu(address: string): {
  sigungu?: string;
  signguCd?: string;
  center?: { lat: number; lng: number };
} {
  const sigunguMatch = address.match(/([가-힣]+구)\s/);
  const sigungu = sigunguMatch?.[1];
  if (!sigungu) return {};
  return {
    sigungu,
    signguCd: SEOUL_SIGUNGU_CODE[sigungu],
    center: SEOUL_SIGUNGU_CENTER[sigungu]
  };
}
