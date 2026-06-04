import { NextResponse } from "next/server";
import { buildAnalysisSkeleton } from "@/lib/analysis-skeleton";
import { getPropertyTypeGroup, getPropertyTypeLabel } from "@/lib/property-types";
import type {
  AnalyzeRequest,
  AnalyzeResponse,
  DataSourceStatus,
  ExecutionPlanEntry,
  MapMarker,
  PlannableAgent,
  PlanPriority,
  PlannerOutput
} from "@/lib/types";
import { createTraceRecorder, withTraces } from "@/lib/server/agent-runtime/trace";
import { runMarketDataAgent } from "@/lib/server/agent-runtime/agents/market-data-agent";
import { runRagEvidenceAgent } from "@/lib/server/agent-runtime/agents/rag-evidence-agent";
import { runRiskScoringAgent } from "@/lib/server/agent-runtime/agents/risk-scoring-agent";
import { runLocationContextAgent } from "@/lib/server/agent-runtime/agents/location-context-agent";
import { runBuildingRegisterAgent } from "@/lib/server/agent-runtime/agents/building-register-agent";
import { runRegistryAgent } from "@/lib/server/agent-runtime/agents/registry-agent";
import { runSearchContextAgent } from "@/lib/server/agent-runtime/agents/search-context-agent";
import { runReportAgent } from "@/lib/server/agent-runtime/agents/report-agent";
import { recordRuntimeFallback, runValidationAgent } from "@/lib/server/agent-runtime/agents/validation-agent";
import { runPlannerAgent } from "@/lib/server/agent-runtime/agents/planner-agent";
import { runSummarizerAgent } from "@/lib/server/agent-runtime/agents/summarizer-agent";
import { runCompetitionDensityAgent } from "@/lib/server/agent-runtime/agents/competition-density-agent";
import { runSchoolZoneAgent } from "@/lib/server/agent-runtime/agents/school-zone-agent";
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
  const propertyTypeBreakdown: AnalyzeResponse["score_breakdown"] =
    adjustedScore > report.risk_score
      ? {
          base_score: adjustedScore,
          base_reason: `${label} 보정 (외부 시세 데이터 도착 전 임시 기준)`,
          adjustments: [],
          final_score: adjustedScore
        }
      : report.score_breakdown;

  return {
    ...report,
    request_property_type: payload.property_type,
    risk_score: adjustedScore,
    risk_level: adjustedScore >= 75 ? "근거 매우 부족" : adjustedScore >= 60 ? "근거 보강 필요" : report.risk_level,
    score_breakdown: propertyTypeBreakdown,
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

const PLAN_AGENT_LABEL: Record<PlannableAgent, string> = {
  market_data: "실거래가",
  building_register: "건축물대장",
  registry: "등기부등본",
  search_context: "외부 검색 맥락"
};

const PLAN_AGENT_TO_STATUS_ID: Record<PlannableAgent, string[]> = {
  market_data: ["rent-market", "sale-market"],
  building_register: ["building-register"],
  registry: ["registry"],
  search_context: ["search-context"]
};

function priorityFor(plan: ExecutionPlanEntry[] | undefined, agent: PlannableAgent): PlanPriority {
  if (!plan) return "normal";
  return plan.find((e) => e.agent === agent)?.priority ?? "normal";
}

function noteFor(plan: ExecutionPlanEntry[] | undefined, agent: PlannableAgent): string {
  if (!plan) return "";
  return plan.find((e) => e.agent === agent)?.notes ?? "";
}

function markSkipped(report: AnalyzeResponse, statusId: string, label: string, note: string) {
  return withStatus(report, {
    id: statusId,
    label,
    status: "missing",
    detail: `Planner: optional 우선순위 - 실행 생략 · ${note || "사용자 의도와 직접 관련 없음"}`
  });
}

function appendCriticalWarnings(report: AnalyzeResponse, plan: ExecutionPlanEntry[] | undefined): AnalyzeResponse {
  if (!plan) return report;
  const issues: string[] = [];
  for (const entry of plan) {
    if (entry.priority !== "critical") continue;
    const statusIds = PLAN_AGENT_TO_STATUS_ID[entry.agent];
    const failedOrMissing = statusIds.some((id) => {
      const ds = report.data_statuses?.find((s) => s.id === id);
      return !ds || ds.status === "failed" || ds.status === "missing";
    });
    if (failedOrMissing) {
      issues.push(
        `⚠ 사용자 의도상 critical 데이터 미확보 — ${PLAN_AGENT_LABEL[entry.agent]}: ${entry.notes || "Planner가 우선 확인 항목으로 지정했으나 현재 자동 분석에서 확보되지 않았습니다."}`
      );
    }
  }
  if (issues.length === 0) return report;
  return {
    ...report,
    warnings: [...issues, ...report.warnings]
  } satisfies AnalyzeResponse;
}

function buildModePlaceholder(payload: AnalyzeRequest): AnalyzeResponse {
  const skeleton = buildAnalysisSkeleton(payload);
  const modeLabel =
    payload.mode === "business_permit"
      ? "창업·영업 적합성"
      : payload.mode === "commercial_use"
        ? "상가 활용성"
        : "터무니 검토";
  const placeholderMessage = `[${modeLabel}] 모드는 곧 출시됩니다. 현재는 입력값을 받아 placeholder 결과만 보여드립니다. 발표 직전 LOCALDATA·LURIS·법령 RAG 연동으로 정식 활성화 예정.`;
  const statuses: DataSourceStatus[] = [
    { id: "mode-runtime", label: `${modeLabel} 검증`, status: "missing", detail: "정식 활성화 전 — placeholder" },
    { id: "geocoding", label: "지도 지오코딩", status: "missing", detail: "정식 활성화 전 — placeholder" },
    { id: "zoning", label: "용도지역", status: "missing", detail: "LURIS 연동 후 활성" },
    { id: "school-zone", label: "정화구역", status: "missing", detail: "학교알리미 연동 후 활성" },
    { id: "competition", label: "동종업종 밀집도", status: "missing", detail: "LOCALDATA 연동 후 활성" },
    { id: "license-requirement", label: "인허가 절차", status: "missing", detail: "법령 RAG 연동 후 활성" }
  ];
  return {
    ...skeleton,
    requested_mode: payload.mode,
    risk_level: "준비 중 모드",
    summary: placeholderMessage,
    data_statuses: statuses,
    evidence: [
      ...skeleton.evidence,
      {
        title: `${modeLabel} 모드 안내`,
        description:
          "이 모드는 LOCALDATA(전국 인허가 사업장), LURIS(용도지역), 학교알리미, ELIS(자치구 조례) 등 무료 공공 API를 연동해 곧 활성화됩니다. 발표 시연에서는 부동산 임차·매수 모드를 사용해 주세요.",
        source: "tumuni:mode_placeholder"
      }
    ],
    next_actions: [
      "지금은 부동산 임차·매수 모드를 사용해 주세요.",
      "API 신청 완료 후 1차 활성화 예정 (LOCALDATA + LURIS).",
      "디엘톤 발표 시연에서는 부동산 모드의 분석 흐름을 보여드립니다."
    ]
  } satisfies AnalyzeResponse;
}

export async function POST(request: Request) {
  let payload: AnalyzeRequest;

  try {
    payload = (await request.json()) as AnalyzeRequest;
  } catch {
    return NextResponse.json({ message: "분석 요청 형식이 올바르지 않습니다." }, { status: 400 });
  }

  // === 창업·상가 모드: placeholder + 부분 실데이터 (Planner + Competition Density 등) === //
  if (payload.mode && payload.mode !== "real_estate") {
    const trace = createTraceRecorder();
    const base = buildModePlaceholder(payload);

    // 1) Planner — 의도 분류 + 실행 계획 (OpenAI 사용 가시화). 부동산 모드와 동일.
    const planner: PlannerOutput | null = await runPlannerAgent({ payload, trace });

    // 2) 좌표 변환 (부동산 모드의 Location Context Agent 재사용)
    const geocode = await runLocationContextAgent({ payload, trace });

    // 3) Competition Density — business_permit 모드에서만 의미 있음
    const competitionFinding =
      payload.mode === "business_permit"
        ? await runCompetitionDensityAgent({ payload, geocode, trace, radiusMeters: 500 })
        : null;

    // 4) School Zone — business_permit 모드 (학교 정화구역 영향)
    const schoolZoneFinding =
      payload.mode === "business_permit"
        ? await runSchoolZoneAgent({ payload, trace })
        : null;

    // base의 data_statuses를 실제 결과로 덮어쓰기
    const enrichedStatuses: DataSourceStatus[] = (base.data_statuses ?? []).map((s) => {
      if (s.id === "geocoding") {
        return geocode.result
          ? { ...s, status: "success" as const, detail: `${geocode.result.source} · ${geocode.result.address}` }
          : { ...s, status: "fallback" as const, detail: "좌표 변환 실패 · 대체 좌표 사용" };
      }
      if (s.id === "competition" && competitionFinding) {
        return {
          ...s,
          status: "success" as const,
          detail: `반경 ${competitionFinding.radius_meters}m ${competitionFinding.business_type_label} ${competitionFinding.total_stores}건 · ${competitionFinding.density_label}`
        };
      }
      return s;
    });

    const enrichedEvidence = competitionFinding
      ? [
          ...base.evidence,
          {
            title: `반경 ${competitionFinding.radius_meters}m ${competitionFinding.business_type_label} 밀집도`,
            description: competitionFinding.note,
            source: "commercial_area:store_radius"
          }
        ]
      : base.evidence;

    const enriched: AnalyzeResponse = {
      ...base,
      data_statuses: enrichedStatuses,
      evidence: enrichedEvidence,
      planner: planner ?? undefined,
      business_findings:
        competitionFinding || schoolZoneFinding
          ? {
              ...(competitionFinding ? { competition: competitionFinding } : {}),
              ...(schoolZoneFinding ? { school_zone: schoolZoneFinding } : {})
            }
          : undefined,
      location: geocode.result
        ? {
            lat: geocode.result.lat,
            lng: geocode.result.lng,
            address: geocode.result.address
          }
        : base.location,
      sections: {
        ...base.sections,
        confirmed_facts: [
          `검토 모드: ${payload.mode === "business_permit" ? "창업·영업 적합성" : "상가 활용성"}`,
          payload.business_type
            ? `검토 업종: ${payload.business_type}`
            : payload.commercial_purpose
              ? `검토 목적: ${payload.commercial_purpose}`
              : "",
          `입력 주소: ${payload.address}`,
          geocode.result ? `좌표 변환: ${geocode.result.lat.toFixed(4)}, ${geocode.result.lng.toFixed(4)}` : "좌표 변환: 실패",
          ...(competitionFinding
            ? [
                `반경 500m ${competitionFinding.business_type_label} ${competitionFinding.total_stores}건 (전체 ${competitionFinding.all_stores_in_radius}건)`,
                `동종업종 밀집도 평가: ${competitionFinding.density_label}`
              ]
            : []),
          ...base.sections.confirmed_facts
        ].filter(Boolean)
      }
    };

    return NextResponse.json(withTraces(enriched, trace.traces));
  }

  // real_estate 모드의 optional 필드를 안전 기본값으로 normalize
  // (form에서 "더 자세히"를 펼치지 않은 경우 deposit/monthly_rent 등이 비어있을 수 있음)
  const normalized: AnalyzeRequest = {
    ...payload,
    mode: payload.mode ?? "real_estate",
    contract_type: payload.contract_type ?? "jeonse",
    property_type: payload.property_type ?? "other",
    deposit: typeof payload.deposit === "number" ? payload.deposit : 0,
    monthly_rent: typeof payload.monthly_rent === "number" ? payload.monthly_rent : 0,
    sale_price: payload.sale_price ?? null,
    user_question: payload.user_question ?? ""
  };
  payload = normalized;

  const trace = createTraceRecorder();

  try {
    const skeletonReport = applyPropertyTypeContext(buildAnalysisSkeleton(payload), payload);
    const planner: PlannerOutput | null = await runPlannerAgent({ payload, trace });
    const executionPlan = planner?.execution_plan;
    const ragResult = runRagEvidenceAgent({ report: skeletonReport, payload, trace });
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

    const buildingRegisterReport =
      priorityFor(executionPlan, "building_register") === "optional"
        ? markSkipped(marketReport, "building-register", "건축물대장", noteFor(executionPlan, "building_register"))
        : await runBuildingRegisterAgent({
            report: marketReport,
            payload,
            legalDong,
            geocode,
            trace
          });
    const registryReport = await runRegistryAgent({
      report: buildingRegisterReport,
      payload,
      legalDong,
      trace,
      allowPaidLookup: false
    });
    const searchContextReport =
      priorityFor(executionPlan, "search_context") === "optional"
        ? markSkipped(registryReport, "search-context", "외부 검색 맥락", noteFor(executionPlan, "search_context"))
        : await runSearchContextAgent({ report: registryReport, payload, trace });
    const scoredReport = runRiskScoringAgent({ report: searchContextReport, payload, trace });
    const reportWithPlanner: AnalyzeResponse = planner ? { ...scoredReport, planner } : scoredReport;
    const reportWithWarnings = appendCriticalWarnings(reportWithPlanner, executionPlan);
    const summarizedReport = await runSummarizerAgent({
      payload,
      report: reportWithWarnings,
      planner,
      trace
    });
    const composedReport = runReportAgent({ report: summarizedReport, trace });
    const finalReport: AnalyzeResponse = {
      ...runValidationAgent({ report: composedReport, trace }),
      requested_mode: payload.mode
    };

    return NextResponse.json(withTraces(finalReport, trace.traces));
  } catch (error) {
    const message = error instanceof Error ? error.message : "분석 처리 중 서버 오류가 발생했습니다.";
    recordRuntimeFallback({ trace, inputSummary: payload.address, outputSummary: message.slice(0, 160) });

    if (!serverEnv.useMockFallback) {
      return NextResponse.json({ message }, { status: 502 });
    }

    const skeleton = applyPropertyTypeContext(buildAnalysisSkeleton(payload), payload);
    const ragFallback = runRagEvidenceAgent({ report: skeleton, payload, trace });
    const failedDetail = message.slice(0, 120);
    const failedStatuses: DataSourceStatus[] = [
      { id: "geocoding", label: "지도 지오코딩", status: "failed", detail: failedDetail },
      { id: "legal-dong", label: "법정동코드", status: "failed", detail: "런타임 오류로 미실행" },
      { id: "rent-market", label: "전월세 실거래가", status: "failed", detail: "런타임 오류로 미실행" },
      { id: "sale-market", label: "매매 실거래가", status: "failed", detail: "런타임 오류로 미실행" },
      { id: "api-runtime", label: "분석 API 런타임", status: "failed", detail: failedDetail }
    ];
    const flagged: AnalyzeResponse = failedStatuses.reduce((acc, status) => withStatus(acc, status), ragFallback.report);
    const warned: AnalyzeResponse = {
      ...flagged,
      warnings: [`분석 API 런타임 오류로 외부 데이터 단계를 건너뛰었습니다: ${message}`, ...flagged.warnings]
    };
    const scored = runRiskScoringAgent({ report: warned, payload, trace });
    const composed = runReportAgent({ report: scored, trace });
    const validated: AnalyzeResponse = {
      ...runValidationAgent({ report: composed, trace }),
      requested_mode: payload.mode
    };
    return NextResponse.json(withTraces(validated, trace.traces));
  }
}
