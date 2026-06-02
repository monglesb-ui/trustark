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

  vworldApiKey: process.env.VWORLD_API_KEY,

  naverMapClientSecret: process.env.NAVER_MAP_CLIENT_SECRET,

  realEstateProviderApiKey: process.env.REAL_ESTATE_PROVIDER_API_KEY
};

export function requireServerEnv(name: keyof typeof serverEnv) {
  const value = serverEnv[name];
  if (!value) {
    throw new Error(`Missing required server environment variable: ${name}`);
  }
  return value;
}
