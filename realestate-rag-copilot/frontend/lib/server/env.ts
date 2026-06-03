import "server-only";

function flag(value: string | undefined, defaultValue: boolean) {
  if (value === undefined) return defaultValue;
  return !["0", "false", "no", "off"].includes(value.toLowerCase());
}

export const serverEnv = {
  appEnv: process.env.APP_ENV ?? "local",
  trustArkApiBaseUrl: process.env.TRUST_ARK_API_BASE_URL,
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
  codefRegistryInquiryType: process.env.CODEF_REGISTRY_INQUIRY_TYPE,

  realEstateProviderApiKey: process.env.REAL_ESTATE_PROVIDER_API_KEY
};

export function requireServerEnv(name: keyof typeof serverEnv) {
  const value = serverEnv[name];
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}
