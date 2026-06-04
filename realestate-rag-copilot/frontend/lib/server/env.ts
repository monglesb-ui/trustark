import "server-only";

function flag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

export const serverEnv = {
  useMockFallback: flag(process.env.TRUST_ARK_USE_MOCK_FALLBACK, true),

  openaiApiKey: process.env.OPENAI_API_KEY,

  dataGoKrServiceKeyEncoded: process.env.DATA_GO_KR_SERVICE_KEY_ENCODED,
  dataGoKrServiceKeyDecoded: process.env.DATA_GO_KR_SERVICE_KEY_DECODED,
  buildingHubServiceKeyEncoded:
    process.env.BUILDING_HUB_SERVICE_KEY_ENCODED ??
    process.env.BUILDING_REGISTER_SERVICE_KEY_ENCODED,
  buildingHubServiceKeyDecoded:
    process.env.BUILDING_HUB_SERVICE_KEY_DECODED ??
    process.env.BUILDING_REGISTER_SERVICE_KEY_DECODED,

  vworldApiKey: process.env.VWORLD_API_KEY,

  naverMapClientId:
    process.env.NAVER_MAP_CLIENT_ID ??
    process.env.NAVER_MAPS_CLIENT_ID ??
    process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ??
    process.env.NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID,
  naverMapClientSecret:
    process.env.NAVER_MAP_CLIENT_SECRET ??
    process.env.NAVER_MAPS_CLIENT_SECRET ??
    process.env.NCP_MAP_CLIENT_SECRET ??
    process.env.NCP_MAPS_CLIENT_SECRET,

  naverSearchClientId:
    process.env.NAVER_SEARCH_CLIENT_ID ??
    process.env.NAVER_CLIENT_ID ??
    process.env.NEXT_PUBLIC_NAVER_SEARCH_CLIENT_ID,
  naverSearchClientSecret:
    process.env.NAVER_SEARCH_CLIENT_SECRET ??
    process.env.NAVER_CLIENT_SECRET,

  codefApiHost: process.env.CODEF_API_HOST ?? "https://development.codef.io",
  codefPublicKey: process.env.CODEF_PUBLIC_KEY,
  codefClientId: process.env.CODEF_CLIENT_ID,
  codefClientSecret: process.env.CODEF_CLIENT_SECRET,
  codefConnectedId: process.env.CODEF_CONNECTED_ID,
  codefRegistryEndpoint: process.env.CODEF_REGISTRY_ENDPOINT,
  codefRegistryOrganization: process.env.CODEF_REGISTRY_ORGANIZATION ?? "0002",
  codefRegistryPhoneNo: process.env.CODEF_REGISTRY_PHONE_NO,
  codefRegistryPassword: process.env.CODEF_REGISTRY_PASSWORD,
  codefRegistryPasswordRsa: process.env.CODEF_REGISTRY_PASSWORD_RSA,
  codefRegistryInquiryType: process.env.CODEF_REGISTRY_INQUIRY_TYPE ?? "3",
  codefRegistryIssueType: process.env.CODEF_REGISTRY_ISSUE_TYPE ?? "1",
  codefRegistryRealtyType: process.env.CODEF_REGISTRY_REALTY_TYPE,

  realEstateProviderApiKey: process.env.REAL_ESTATE_PROVIDER_API_KEY,

  // 서울 열린데이터광장 (data.seoul.go.kr) 범용 키
  // 같은 키 하나로 모든 서울 OpenAPI 서비스 호출 가능. 일반음식점·상권분석·인구통계 등 공통.
  seoulOpenApiKey:
    process.env.SEOUL_API_KEY ??
    process.env.SEOUL_RESTAURANT_API_KEY ??
    process.env.SEOUL_COMMERCE_API_KEY,

  // (legacy alias) 일반음식점 전용 키 — 별도 발급한 경우 보존
  seoulRestaurantApiKey:
    process.env.SEOUL_RESTAURANT_API_KEY ?? process.env.SEOUL_API_KEY,

  // 학교알리미 / NEIS (open.neis.go.kr) — 학교 좌표·정화구역 검증
  neisApiKey: process.env.NEIS_API_KEY,

  // 자치법규(ELIS) / 법제처 국가법령정보 공동활용 — OC 인증 파라미터값
  // 다양한 명칭 fallback (OC 단독부터 LAW_API_KEY까지)
  lawApiKey:
    process.env.OC ??
    process.env.LAW_OC ??
    process.env.LAW_API_OC ??
    process.env.LAWGOKR_OC ??
    process.env.NATIONAL_LAW_OC ??
    process.env.LAW_API_KEY ??
    process.env.ELIS_API_KEY ??
    process.env.NEXT_PUBLIC_LAW_API_URL,

  // 소상공인진흥공단 상권정보 (data.go.kr B553077) — 반경 내 상가업소·업종별 분포·매출 추이
  commercialApiKey: process.env.COMMERCIAL_API_KEY,

  // 국토교통부 토지이용계획정보 (LURIS, data.go.kr B551023) — 용도지역·지구단위계획·도시계획시설
  landUseApiKey: process.env.LAND_USE_API_KEY,

  // X (구 Twitter) API v2 — Bearer Token (App-only auth). Recent search 등
  xApiKey:
    process.env.BEARER_TOKEN ??
    process.env.X_BEARER_TOKEN ??
    process.env.X_API_KEY ??
    process.env.TWITTER_BEARER_TOKEN,

  // 카카오 로컬 API — REST API 키 (서버 전용)
  // NEXT_PUBLIC_ 접두 키는 JavaScript SDK 키일 수 있으나 일단 fallback으로 사용 시도
  kakaoRestApiKey:
    process.env.KAKAO_REST_API_KEY ??
    process.env.KAKAO_API_KEY ??
    process.env.NEXT_PUBLIC_KAKAO_REST_API_KEY ??
    process.env.NEXT_PUBLIC_KAKAO_MAP_KEY
};

export function requireServerEnv(name: keyof typeof serverEnv) {
  const value = serverEnv[name];
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}
