import { NextResponse } from "next/server";
import { buildMockAnalysis } from "@/lib/mock-analysis";
import { getPropertyTypeGroup, getPropertyTypeLabel } from "@/lib/property-types";
import type { AnalyzeRequest, AnalyzeResponse, DataSourceStatus, MapMarker } from "@/lib/types";
import { createTraceRecorder, withTraces } from "@/lib/server/agent-runtime/trace";
import { runMarketDataAgent } from "@/lib/server/agent-runtime/agents/market-data-agent";
import { runRagEvidenceAgent } from "@/lib/server/agent-runtime/agents/rag-evidence-agent";
import { runRiskScoringAgent } from "@/lib/server/agent-runtime/agents/risk-scoring-agent";
import { runLocationContextAgent } from "@/lib/server/agent-runtime/agents/location-context-agent";
import { runBuildingRegisterAgent } from "@/lib/server/agent-runtime/agents/building-register-agent";
import { runSearchContextAgent } from "@/lib/server/agent-runtime/agents/search-context-agent";
import { runReportAgent } from "@/lib/server/agent-runtime/agents/report-agent";
import { recordRuntimeFallback, runValidationAgent } from "@/lib/server/agent-runtime/agents/validation-agent";
import { serverEnv } from "@/lib/server/env";
import { extractLegalDongQuery, type LegalDongCode } from "@/lib/server/legal-dong";
import {
  applyRentMarketSummary,
  applySaleMarketSummary,
  type MarketLookupDiagnostics
} from "@/lib/server/real-transactions";
import type { GeocodeResult } from "@/lib/server/vworld";

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

function upsertStatus(statuses: DataSourceStatus[] | undefined, status: DataSourceStatus) {
  const current = statuses ?? [];
  const existingIndex = current.findIndex((item) => item.id === status.id);
  if (existingIndex < 0) return [...current, status];
  return current.map((item, index) => (index === existingIndex ? status : item));
}

function withStatus(report: AnalyzeResponse, status: DataSourceStatus) {
  return {
    ...report,
    data_statuses: upsertStatus(report.data_statuses, status)
  } satisfies AnalyzeResponse;
}

function geocodeFailureDetail(geocode: GeocodeResult) {
  const diagnostics = geocode.diagnostics;
  if (!diagnostics) return "주소 정규화 결과 없음 · 대체 좌표 사용";
  if (!diagnostics.hasClientId || !diagnostics.hasClientSecret) {
    return `네이버 서버 키 미설정 · id=${diagnostics.hasClientId ? "있음" : "없음"} secret=${diagnostics.hasClientSecret ? "있음" : "없음"}`;
  }

  const last = diagnostics.attempts.at(-1);
  if (!last) return `네이버 후보 ${diagnostics.candidates.length}개 생성 · 호출 없음`;

  const status = [last.httpStatus ? `HTTP ${last.httpStatus}` : null, last.apiStatus ? `API ${last.apiStatus}` : null]
    .filter(Boolean)
    .join(" · ");
  const count = last.addressCount !== undefined ? `결과 ${last.addressCount}건` : "결과 없음";
  const error = last.error ? ` · ${last.error.slice(0, 80)}` : "";

  return `${status || "네이버 호출 실패"} · ${count} · 후보 ${diagnostics.candidates.length}개${error}`;
}

function marketFailureDetail(diagnostics?: MarketLookupDiagnostics | null) {
  if (!diagnostics) return "진단 정보 없음";
  if (!diagnostics.hasServiceKey) return "data.go.kr 서비스키 없음";

  const totalItems = diagnostics.attempts.reduce((sum, item) => sum + (item.itemCount ?? 0), 0);
  const last = diagnostics.attempts.at(-1);
  const months = diagnostics.dealMonths.slice(0, diagnostics.attempts.length || 1).join(",");

  if (!last) {
    return `${diagnostics.endpointName} · LAWD_CD ${diagnostics.lawdCode} · 호출 전`;
  }

  const status = [last.httpStatus ? `HTTP ${last.httpStatus}` : null, last.itemCount !== undefined ? `표본 ${totalItems}건` : null]
    .filter(Boolean)
    .join(" · ");
  const key = last.keyType ? ` · key=${last.keyType}` : "";
  const error = last.error ? ` · ${last.error.slice(0, 80)}` : "";

  return `${diagnostics.endpointName} · LAWD_CD ${diagnostics.lawdCode} · ${months} · ${status || "호출 실패"}${key}${error}`;
}

function applyGeocoding(report: AnalyzeResponse, geocode: GeocodeResult, payload: AnalyzeRequest) {
  const geocoded = geocode.result;
  if (!geocoded) {
    return withStatus(report, {
      id: "geocoding",
      label: "지도 지오코딩",
      status: "fallback",
      detail: geocodeFailureDetail(geocode)
    });
  }

  const provider = geocoded.source.startsWith("naver") ? "네이버" : "VWorld";

  return {
    ...report,
    data_statuses: upsertStatus(report.data_statuses, {
      id: "geocoding",
      label: "지도 지오코딩",
      status: "success",
      detail: `${provider} ${geocoded.addressType === "parcel" ? "지번" : "도로명"} 좌표 변환 성공`
    }),
    location: {
      lat: geocoded.lat,
      lng: geocoded.lng,
      address: geocoded.address
    },
    markers: updateTargetMarker(report.markers, geocoded.lat, geocoded.lng, payload.deposit),
    evidence: [
      {
        title: "실제 주소 좌표 변환",
        description: `${provider} ${geocoded.addressType === "parcel" ? "지번" : "도로명"} 주소 API로 대상 주소를 좌표로 변환했습니다.`,
        source: geocoded.source
      },
      ...report.evidence
    ],
    sections: {
      ...report.sections,
      confirmed_facts: [
        `${provider} 지오코딩 결과: ${geocoded.address} (${geocoded.lat.toFixed(6)}, ${geocoded.lng.toFixed(6)})`,
        ...(geocoded.legalDong ? [`법정동 후보: ${geocoded.legalDong}`] : []),
        ...report.sections.confirmed_facts
      ],
      assumptions: report.sections.assumptions.filter((item) => item !== "주소는 샘플 좌표로 변환되었습니다.")
    }
  } satisfies AnalyzeResponse;
}

function applyLegalDongCode(
  report: AnalyzeResponse,
  legalDong: LegalDongCode | null,
  query: string
) {
  if (!legalDong) {
    return {
      ...report,
      data_statuses: upsertStatus(report.data_statuses, {
        id: "legal-dong",
        label: "법정동코드",
        status: "missing",
        detail: `${query} 조회 결과 없음`
      }),
      sections: {
        ...report.sections,
        unverified_items: [`법정동코드 조회 결과 없음: ${query}`, ...report.sections.unverified_items]
      }
    } satisfies AnalyzeResponse;
  }

  return {
    ...report,
    data_statuses: upsertStatus(report.data_statuses, {
      id: "legal-dong",
      label: "법정동코드",
      status: "success",
      detail: `${legalDong.regionCode} · LAWD_CD ${legalDong.lawdCode}`
    }),
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
  const typeActions: Record<string, string[]> = {
    multifamily: [
      "다가구주택 전체 임차인의 보증금 합계와 선순위 확정일자 순위를 확인",
      "건물 전체 등기부등본에서 근저당권, 압류, 가압류와 임대인 소유관계를 확인",
      "전입신고 가능 여부와 전세보증금 반환보증 가입 가능 여부를 보증기관 기준으로 확인"
    ],
    rowhouse: [
      "동일 건물·동일 면적대의 다세대/연립 실거래 표본을 추가 확보",
      "개별 호실 등기부등본과 건축물대장의 용도·위반건축물 여부 확인"
    ],
    officetel: [
      "주거용 사용 가능 여부와 전입신고 가능 여부 확인",
      "전세보증금 반환보증 가입 가능 여부를 보증기관 기준으로 확인"
    ],
    mixed_use: [
      "상가와 주거 부분의 면적·용도 구분을 건축물대장에서 확인",
      "주택임대차보호법 적용 범위와 보증보험 가능 여부 확인"
    ]
  };

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
    next_actions: unique([...(typeActions[group] ?? []), ...report.next_actions]),
    sections: {
      ...report.sections,
      confirmed_facts: [`주택 유형: ${label}`, ...report.sections.confirmed_facts],
      unverified_items: [...messages, ...report.sections.unverified_items]
    }
  } satisfies AnalyzeResponse;
}

function unique(items: string[]) {
  return [...new Set(items)];
}

export async function POST(request: Request) {
  let payload: AnalyzeRequest;

  try {
    payload = (await request.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ message: "분석 요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  const trace = createTraceRecorder();

  try {
    const mockReport = applyPropertyTypeContext(buildMockAnalysis(payload), payload);
    const ragResult = runRagEvidenceAgent({ report: mockReport, payload, trace });
    const geocode = await runLocationContextAgent({ payload, trace });
    const geocodedReport = applyGeocoding(ragResult.report, geocode, payload);
    const legalDongQuery =
      typeof geocode.result?.legalDong === "string" && geocode.result.legalDong.trim()
        ? geocode.result.legalDong
        : extractLegalDongQuery(String(payload.address ?? ""));
    const marketData = await runMarketDataAgent({ payload, legalDongQuery, trace });
    const legalDong = marketData.legalDong;
    const codedReport = applyLegalDongCode(geocodedReport, legalDong, legalDongQuery);
    const rentLookup = marketData.rentLookup;
    const rentSummary = rentLookup?.summary ?? null;
    const rentReport = rentSummary
      ? withStatus(applyRentMarketSummary(codedReport, rentSummary, payload), {
          id: "rent-market",
          label: "전월세 실거래가",
          status: "success",
          detail:
            rentSummary.matchMode === "complex"
              ? `입력 단지 매칭 ${rentSummary.sampleSize}건 · 최근 ${rentSummary.latestTransaction ? rentSummary.latestTransaction.deposit.toLocaleString("ko-KR") : "-"}원 · 평균 ${rentSummary.averageDeposit ? rentSummary.averageDeposit.toLocaleString("ko-KR") : "-"}원`
              : `단지 매칭 없음 · 지역 표본 ${rentSummary.sampleSize}건 · 평균 보증금 ${rentSummary.averageDeposit ? rentSummary.averageDeposit.toLocaleString("ko-KR") : "-"}원`
        })
      : withStatus(codedReport, {
        id: "rent-market",
        label: "전월세 실거래가",
        status: legalDong ? "missing" : "fallback",
          detail: legalDong ? marketFailureDetail(rentLookup?.diagnostics) : "법정동코드 없음 · 대체 표본 유지"
        });
    const saleLookup = marketData.saleLookup;
    const saleSummary = saleLookup?.summary ?? null;

    const marketReport = saleSummary
      ? withStatus(applySaleMarketSummary(rentReport, saleSummary, payload), {
          id: "sale-market",
          label: "매매 실거래가",
          status: "success",
          detail:
            saleSummary.matchMode === "complex"
              ? `입력 단지 매칭 ${saleSummary.sampleSize}건 · 최근 ${saleSummary.latestTransaction ? saleSummary.latestTransaction.salePrice.toLocaleString("ko-KR") : "-"}원 · 평균 ${saleSummary.averageSalePrice ? saleSummary.averageSalePrice.toLocaleString("ko-KR") : "-"}원`
              : `단지 매칭 없음 · 지역 표본 ${saleSummary.sampleSize}건 · 평균 매매가 ${saleSummary.averageSalePrice ? saleSummary.averageSalePrice.toLocaleString("ko-KR") : "-"}원`
        })
      : withStatus(rentReport, {
        id: "sale-market",
        label: "매매 실거래가",
        status: legalDong ? "missing" : "fallback",
          detail: legalDong ? marketFailureDetail(saleLookup?.diagnostics) : "법정동코드 없음 · 전세가율 미확정"
        });

    const buildingRegisterReport = await runBuildingRegisterAgent({
      report: marketReport,
      payload,
      legalDong,
      geocode,
      trace
    });
    const searchContextReport = await runSearchContextAgent({ report: buildingRegisterReport, payload, trace });
    const scoredReport = runRiskScoringAgent({ report: searchContextReport, payload, trace });
    const composedReport = runReportAgent({ report: scoredReport, trace });
    const finalReport = runValidationAgent({ report: composedReport, trace });

    return NextResponse.json(withTraces(finalReport, trace.traces));
  } catch (error) {
    const fallbackReport = applyPropertyTypeContext(buildMockAnalysis(payload), payload);
    const message = error instanceof Error ? error.message : "분석 처리 중 서버 오류가 발생했습니다.";
    recordRuntimeFallback({ trace, inputSummary: payload.address, outputSummary: message.slice(0, 160) });

    if (!serverEnv.useMockFallback) {
      return NextResponse.json({ message }, { status: 502 });
    }

    return NextResponse.json(withTraces(runRiskScoringAgent({ report: withStatus({
      ...fallbackReport,
      warnings: [`분석 API 일부 단계에서 오류가 발생해 대체 분석으로 전환했습니다: ${message}`, ...fallbackReport.warnings]
    }, {
      id: "api-runtime",
      label: "분석 API 런타임",
      status: "failed",
      detail: message.slice(0, 120)
    }), payload, trace }), trace.traces));
  }
}
