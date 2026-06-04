/**
 * 서울 25개 자치구의 시군구 코드 매핑.
 *
 * - LAWD_CD: 국토부 실거래가 API (앞 5자리 시군구코드)
 * - signguCd: 행정안전부 표준 시군구 코드 (동일 5자리)
 *
 * 추후 전국 확장 시 별도 모듈로 분리.
 */
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

export function extractSeoulSigungu(address: string): { sigungu?: string; signguCd?: string } {
  const sigunguMatch = address.match(/([가-힣]+구)\s/);
  const sigungu = sigunguMatch?.[1];
  if (!sigungu) return {};
  const signguCd = SEOUL_SIGUNGU_CODE[sigungu];
  return { sigungu, signguCd };
}
