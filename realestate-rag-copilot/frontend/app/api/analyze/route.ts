import { NextResponse } from "next/server";
import { buildMockAnalysis } from "@/lib/mock-analysis";
import type { AnalyzeRequest, AnalyzeResponse, MapMarker } from "@/lib/types";
import { serverEnv } from "@/lib/server/env";
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

export async function POST(request: Request) {
  let payload: AnalyzeRequest;

  try {
    payload = (await request.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ message: "분석 요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const mockReport = buildMockAnalysis(payload);

  if (!serverEnv.vworldApiKey) {
    return NextResponse.json(mockReport);
  }

  try {
    const geocoded = await geocodeAddress(payload.address);
    return NextResponse.json(applyGeocoding(mockReport, geocoded, payload));
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
