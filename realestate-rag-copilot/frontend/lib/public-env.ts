export const publicEnv = {
  trustArkApiBaseUrl:
    process.env.NEXT_PUBLIC_TRUST_ARK_API_BASE_URL ?? process.env.NEXT_PUBLIC_API_BASE_URL,
  naverMapClientId:
    process.env.NEXT_PUBLIC_NAVER_MAP_CLIENT_ID ?? process.env.NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID
};
