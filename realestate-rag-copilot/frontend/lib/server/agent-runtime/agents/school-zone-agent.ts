import type {
  AnalyzeRequest,
  BusinessType,
  SchoolZoneFinding,
  SchoolZoneImpact
} from "@/lib/types";
import {
  fetchSchools,
  summarizeNeisAttempt,
  type SchoolInfoRow
} from "@/lib/server/neis-api";
import type { TraceRecorder } from "../trace";

const AGENT = "Location Context Agent" as const;
const TOOL = "fetchSchoolsByDistrict" as const;

const OFFICE_CODES: Record<string, string> = {
  서울특별시: "B10",
  서울시: "B10",
  서울: "B10",
  부산광역시: "C10",
  대구광역시: "D10",
  인천광역시: "E10",
  광주광역시: "F10",
  대전광역시: "G10",
  울산광역시: "H10",
  세종특별자치시: "I10",
  경기도: "J10",
  강원특별자치도: "K10",
  충청북도: "M10",
  충청남도: "N10",
  전북특별자치도: "P10",
  전라남도: "Q10",
  경상북도: "R10",
  경상남도: "S10",
  제주특별자치도: "T10"
};

const HIGH_IMPACT: BusinessType[] = ["pc_room", "karaoke"];
const MEDIUM_IMPACT: BusinessType[] = ["restaurant"];

const BUSINESS_TYPE_LABELS: Record<BusinessType, string> = {
  restaurant: "음식점",
  cafe: "카페",
  beauty: "미용실·이용원",
  academy: "학원·교습소",
  pc_room: "PC방",
  karaoke: "노래방",
  other: "기타 업종"
};

const schoolCache = new Map<string, { rows: SchoolInfoRow[]; at: number }>();
const CACHE_TTL = 60 * 60 * 1000;

function extractSidoSigungu(address: string): { sido?: string; sigungu?: string; road?: string } {
  const sidoMatch = address.match(
    /(서울특별시|서울시|서울|부산광역시|대구광역시|인천광역시|광주광역시|대전광역시|울산광역시|세종특별자치시|경기도|강원특별자치도|충청북도|충청남도|전북특별자치도|전라남도|경상북도|경상남도|제주특별자치도)/
  );
  const sigunguMatch = address.match(/([가-힣]+(?:특별자치시|광역시|시|군|구))\s/);
  const roadMatch = address.match(/([가-힣A-Za-z0-9]+(?:로|길))\s*\d+/);
  return {
    sido: sidoMatch?.[1],
    sigungu: sigunguMatch && sigunguMatch[1] !== sidoMatch?.[1] ? sigunguMatch[1] : undefined,
    road: roadMatch?.[1]
  };
}

function impactFor(businessType: BusinessType, schoolsInDistrict: number): { level: SchoolZoneImpact; message: string; label: string } {
  const label = BUSINESS_TYPE_LABELS[businessType] ?? "기타 업종";
  if (schoolsInDistrict === 0) {
    return {
      level: "low",
      label,
      message: `이 자치구에서 인근 학교 정보를 찾지 못했습니다 — 정화구역 영향은 별도 확인 필요.`
    };
  }
  if (HIGH_IMPACT.includes(businessType)) {
    return {
      level: "high",
      label,
      message: `${label}은(는) 학교환경위생정화구역(절대 200m · 상대 50m) 내에서 영업 제한·심의 대상입니다. 인근 학교 위치를 정확히 확인하세요.`
    };
  }
  if (MEDIUM_IMPACT.includes(businessType)) {
    return {
      level: "medium",
      label,
      message: `${label}은(는) 정화구역 내 영업이 일반적으로 가능하지만, 소음·악취·청소년 출입 등 시설 기준이 강화될 수 있습니다.`
    };
  }
  return {
    level: "low",
    label,
    message: `${label}은(는) 학교환경위생정화구역 영향이 낮은 편입니다. 단, 청소년 출입 가능 여부는 확인 필요.`
  };
}

async function loadSchools(officeCode: string): Promise<{ rows: SchoolInfoRow[]; diagnostic: string }> {
  const now = Date.now();
  const cached = schoolCache.get(officeCode);
  if (cached && now - cached.at < CACHE_TTL && cached.rows.length > 0) {
    return { rows: cached.rows, diagnostic: `cache hit (${cached.rows.length})` };
  }
  // pSize 1000으로 5페이지까지 = 5000건. 서울 전체 학교 약 2400건 커버.
  const result = await fetchSchools({ officeCode, maxPages: 5 });
  const diagnostic = `${summarizeNeisAttempt(result.attempt)} · loaded=${result.rows.length}`;
  if (result.ok && result.rows.length > 0) {
    schoolCache.set(officeCode, { rows: result.rows, at: now });
  }
  return { rows: result.rows, diagnostic };
}

export async function runSchoolZoneAgent({
  payload,
  trace
}: {
  payload: AnalyzeRequest;
  trace: TraceRecorder;
}): Promise<SchoolZoneFinding | null> {
  const { sido, sigungu, road } = extractSidoSigungu(payload.address ?? "");
  const officeCode = sido ? OFFICE_CODES[sido] : undefined;

  const inputSummary = `sido=${sido ?? "?"} sigungu=${sigungu ?? "?"} road=${road ?? "?"} office=${officeCode ?? "?"}`;

  if (!officeCode || !sigungu) {
    trace.record(
      AGENT,
      TOOL,
      inputSummary,
      `시도/자치구 추출 실패 — 학교 검색 생략`,
      "missing"
    );
    return null;
  }

  const businessType = (payload.business_type ?? "other") as BusinessType;

  try {
    return await trace.run(
      AGENT,
      TOOL,
      inputSummary,
      async () => {
        const { rows, diagnostic } = await loadSchools(officeCode);
        // 매칭: ORG_RDNMA(도로명) + LCTN_SC_NM(시도명)에서 sigungu 텍스트 검색.
        // 사용자 sigungu가 "양천구"라면 "서울 양천구..." / "서울특별시 양천구..." 모두 매칭.
        const districtSchools = rows.filter((r) => {
          const addr = `${r.ORG_RDNMA ?? ""} ${r.LCTN_SC_NM ?? ""} ${r.JU_ORG_NM ?? ""}`;
          return addr.includes(sigungu);
        });
        const sameRoadSchools = road
          ? districtSchools.filter((r) => (r.ORG_RDNMA ?? "").includes(road))
          : [];
        const sampleAddresses = rows
          .slice(0, 3)
          .map((r) => r.ORG_RDNMA?.slice(0, 30) ?? "?")
          .join(" | ");
        const diagnosticExtra = `${diagnostic} · sample=[${sampleAddresses}]`;

        const nearby = (sameRoadSchools.length > 0 ? sameRoadSchools : districtSchools.slice(0, 5)).map((s) => ({
          name: s.SCHUL_NM ?? "(이름 없음)",
          kind: s.SCHUL_KND_SC_NM ?? "기타",
          address: s.ORG_RDNMA ?? "",
          matchedBy: (sameRoadSchools.length > 0 ? "same_road" : "same_district") as "same_road" | "same_district"
        }));

        const kindCounts = districtSchools.reduce<Record<string, number>>((acc, s) => {
          const kind = s.SCHUL_KND_SC_NM ?? "기타";
          acc[kind] = (acc[kind] ?? 0) + 1;
          return acc;
        }, {});

        const impact = impactFor(businessType, districtSchools.length);

        const finding: SchoolZoneFinding = {
          district: sigungu,
          total_schools_in_district: districtSchools.length,
          nearby_schools: nearby,
          school_kind_counts: kindCounts,
          business_type_label: impact.label,
          impact_level: impact.level,
          impact_message: impact.message,
          source: "NEIS 학교알리미 schoolInfo",
          diagnostic: diagnosticExtra,
          note:
            sameRoadSchools.length > 0
              ? `같은 도로(${road})에 학교 ${sameRoadSchools.length}건 — 정화구역 영향 확인 필요.`
              : `${sigungu} 전체 학교 ${districtSchools.length}건 — 정확한 200m 거리는 추후 좌표 매칭으로 보강 예정.`
        };
        return finding;
      },
      (finding) => ({
        status: finding && finding.total_schools_in_district > 0 ? "success" : "missing",
        outputSummary: finding
          ? `${finding.district} 학교 ${finding.total_schools_in_district}건 · ${finding.business_type_label} 영향=${finding.impact_level}`
          : "학교 정보 없음"
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "school zone 조회 실패";
    trace.record(AGENT, TOOL, inputSummary, message.slice(0, 120), "failed");
    return null;
  }
}
