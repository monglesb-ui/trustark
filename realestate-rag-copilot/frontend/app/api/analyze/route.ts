import { NextResponse } from "next/server";
import { buildMockAnalysis } from "@/lib/mock-analysis";
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

export async function POST(request: Request) {
  let payload: AnalyzeRequest;

  try {
    payload = (await request.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ message: "분석 요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const mockReport = buildMockAnalysis(payload);

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
