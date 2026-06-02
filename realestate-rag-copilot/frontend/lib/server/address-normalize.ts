export function normalizeKoreanAddress(address: string) {
  return address
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+\s*층\b/g, " ")
    .replace(/([가-힣]+(?:로|길))\s+(\d)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

export function inferLegalDongFromRoadName(address: string) {
  const normalized = normalizeKoreanAddress(address);
  const tokens = normalized.split(" ").filter(Boolean);
  const roadToken = tokens.find((token) => /[가-힣]+(?:로|길)\d*/.test(token));
  const match = roadToken?.match(/([가-힣]+동)(?:로|길)/);

  if (!match?.[1]) return null;

  const districtIndex = tokens.findIndex((token) => /[구군]$/.test(token));
  const cityIndex = tokens.findIndex((token) => /시$/.test(token));
  const boundaryIndex = districtIndex >= 0 ? districtIndex : cityIndex;

  if (boundaryIndex < 0) return match[1];

  return [...tokens.slice(0, boundaryIndex + 1), match[1]].join(" ");
}
