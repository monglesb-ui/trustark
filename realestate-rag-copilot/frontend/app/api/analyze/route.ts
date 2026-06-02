import { NextResponse } from "next/server";
import { buildMockAnalysis } from "@/lib/mock-analysis";
import { getPropertyTypeGroup, getPropertyTypeLabel } from "@/lib/property-types";
import type { AnalyzeRequest, AnalyzeResponse, MapMarker } from "@/lib/types";
import { serverEnv } from "@/lib/server/env";
import { extractLegalDongQuery, lookupLegalDongCode } from "@/lib/server/legal-dong";
import {
  applyRentMarketSummary,
  applySaleMarketSummary,
  lookupRentMarketSummary,
  lookupSaleMarketSummary
} from "@/lib/server/real-transactions";
import { geocodeAddress } from "@/lib/server/vworld";

function updateTargetMarker(markers: MapMarker[], lat: number, lng: number, amount?: number | null) {
  const nextMarkers = markers.map((marker) =>
    marker.marker_type === "target" ? { ...marker, lat, lng, amount } : marker
  );

  if (nextMarkers.some((marker) => marker.marker_type === "target")) {
    return nextMarkers;
  }

  return [
    {
      id: "target",
      label: "대상",
      lat,
      lng,
      marker_type: "target",
      amount
    },
    ...nextMarkers
  ];
}

function applyGeocoding(report: AnalyzeResponse, geocoded: Awaited<ReturnType<typeof geocodeAddress>>, payload: AnalyzeRequest) {
  if (!geocoded) return report;

  return {
    ...report,
    location: {
      lat: geocoded.lat,
      lng: geocoded.lng,
      address: geocoded.address
    },
    markers: updateTargetMarker(report.markers, geocoded.lat, geocoded.lng, payload.deposit),
    evidence: [
      {
        title: "실제 주소 좌표 변환",
        description: `VWorld ${geocoded.addressType === "parcel" ? "지번" : "도로명"} 주소 API로 대상 주소를 좌표로 변환했습니다.`,
        source: geocoded.source
      },
      ...report.evidence
    ],
    sections: {
      ...report.sections,
      confirmed_facts: [
        `VWorld 지오코딩 결과: ${geocoded.address} (${geocoded.lat.toFixed(6)}, ${geocoded.lng.toFixed(6)})`,
        ...(geocoded.legalDong ? [`법정동 후보: ${geocoded.legalDong}`] : []),
        ...report.sections.confirmed_facts
      ],
      assumptions: report.sections.assumptions.filter((item) => item !== "주소는 샘플 좌표로 변환되었습니다.")
    }
  } satisfies AnalyzeResponse;
}

function applyLegalDongCode(
  report: AnalyzeResponse,
  legalDong: Awaited<ReturnType<typeof lookupLegalDongCode>>,
  query: string
) {
  if (!legalDong) {
    return {
      ...report,
      sections: {
        ...report.sections,
        unverified_items: [`법정동코드 조회 결과 없음: ${query}`, ...report.sections.unverified_items]
      }
    } satisfies AnalyzeResponse;
  }

  return {
    ...report,
    evidence: [
      {
        title: "법정동코드 정규화",
        description: `${legalDong.addressName}의 법정동코드 ${legalDong.regionCode}를 확인했습니다. 실거래가 API 조회에는 앞 5자리 ${legalDong.lawdCode}를 사용합니다.`,
        source: legalDong.source
      },
      ...report.evidence
    ],
    sections: {
      ...report.sections,
      confirmed_facts: [
        `법정동코드: ${legalDong.regionCode}`,
        `실거래가 조회용 지역코드(LAWD_CD): ${legalDong.lawdCode}`,
        ...report.sections.confirmed_facts
      ]
    }
  } satisfies AnalyzeResponse;
}

function applyPropertyTypeContext(report: AnalyzeResponse, payload: AnalyzeRequest) {
  const group = getPropertyTypeGroup(payload.property_type);
  const label = getPropertyTypeLabel(payload.property_type);
  const cautions: Record<string, string[]> = {
    multifamily: ["다가구주택은 호실별 구분등기가 어려울 수 있어 선순위 임차인과 총 보증금 규모 확인이 중요합니다."],
    officetel: ["오피스텔은 주거용 여부, 전입신고 가능 여부, 보증보험 가입 가능 여부를 별도로 확인해야 합니다."],
    mixed_use: ["상가주택은 주거/상가 용도와 임대차보호 적용 범위를 건축물대장과 계약서에서 확인해야 합니다."],
    detached: ["단독주택은 담보권, 대지/건물 소유관계, 건축물대장 용도 확인이 필요합니다."],
    urban_living: ["도시형생활주택은 보증보험 조건과 실거래 표본 신뢰도를 별도로 검토해야 합니다."]
  };
  const messages = cautions[group] ?? [];

  if (messages.length === 0) {
    return {
      ...report,
      request_property_type: payload.property_type
    } satisfies AnalyzeResponse;
  }

  const adjustedScore = Math.max(report.risk_score, 60);

  return {
    ...report,
    request_property_type: payload.property_type,
    risk_score: adjustedScore,
    risk_level: adjustedScore >= 75 ? "위험 · HIGH" : adjustedScore >= 60 ? "검토 필요" : report.risk_level,
    risk_signals: [
      {
        severity: "확인 필요",
        title: `${label} 특화 확인 항목`,
        metric: label,
        description: messages[0],
        source: "risk_rule:property_type_context"
      },
      ...(report.risk_signals ?? [])
    ],
    sections: {
      ...report.sections,
      confirmed_facts: [`주택 유형: ${label}`, ...report.sections.confirmed_facts],
      unverified_items: [...messages, ...report.sections.unverified_items]
    }
  } satisfies AnalyzeResponse;
}

export async function POST(request: Request) {
  let payload: AnalyzeRequest;

  try {
    payload = (await request.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ message: "분석 요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

    const mockReport = applyPropertyTypeContext(buildMockAnalysis(payload), payload);

  try {
    const geocoded = await geocodeAddress(payload.address);
    const geocodedReport = applyGeocoding(mockReport, geocoded, payload);
    const legalDongQuery = geocoded?.legalDong ?? extractLegalDongQuery(payload.address);
    const legalDong = await lookupLegalDongCode(legalDongQuery);
    const codedReport = applyLegalDongCode(geocodedReport, legalDong, legalDongQuery);
    const rentSummary = legalDong
      ? await lookupRentMarketSummary(legalDong.lawdCode, payload.property_type, payload.contract_type)
      : null;
    const rentReport = rentSummary ? applyRentMarketSummary(codedReport, rentSummary, payload) : codedReport;
    const saleSummary = legalDong ? await lookupSaleMarketSummary(legalDong.lawdCode, payload.property_type) : null;

    return NextResponse.json(saleSummary ? applySaleMarketSummary(rentReport, saleSummary, payload) : rentReport);
  } catch (error) {
    if (!serverEnv.useMockFallback) {
      const message = error instanceof Error ? error.message : "주소 지오코딩에 실패했습니다.";
      return NextResponse.json({ message }, { status: 502 });
    }

    return NextResponse.json({
      ...mockReport,
      warnings: ["VWorld 지오코딩에 실패해 mock 좌표로 분석했습니다.", ...mockReport.warnings]
    });
  }
}
