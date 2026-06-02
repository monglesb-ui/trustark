export function normalizeKoreanAddress(address: string) {
  return address
    .replace(/\([^)]*\)/g, " ")
    .replace(/\b\d+\s*층\b/g, " ")
    .replace(/\b\d+\s*호\b/g, " ")
    .replace(/([가-힣]+(?:로|길))\s+(\d)/g, "$1$2")
    .replace(/\s+/g, " ")
    .trim();
}

export function addressSearchCandidates(address: string) {
  const normalized = normalizeKoreanAddress(address);
  if (!normalized) return [];

  const candidates = [normalized];
  const hasSido = /(?:서울특별시|서울시|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|충청북도|충청남도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)/.test(normalized);

  if (!hasSido && /^[가-힣]+구\s/.test(normalized)) {
    candidates.push(`서울특별시 ${normalized}`);
    candidates.push(`서울시 ${normalized}`);
  }

  const spacedRoad = normalized.replace(/([가-힣]+로)(\d+길)/g, "$1 $2");
  if (spacedRoad !== normalized) {
    candidates.push(spacedRoad);
    if (!hasSido && /^[가-힣]+구\s/.test(spacedRoad)) {
      candidates.push(`서울특별시 ${spacedRoad}`);
    }
  }

  return [...new Set(candidates)];
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
