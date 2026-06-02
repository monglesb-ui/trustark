import type { AnalyzeRequest, AnalyzeResponse, DataSourceStatus } from "@/lib/types";
import {
  applyBuildingRegisterSummary,
  lookupBuildingRegister,
  type BuildingRegisterDiagnostics
} from "@/lib/server/building-register";
import type { LegalDongCode } from "@/lib/server/legal-dong";
import type { GeocodeResult } from "@/lib/server/vworld";
import type { TraceRecorder } from "../trace";

const BUILDING_REGISTER_AGENT = "Building Register Agent" as const;

export const buildingRegisterAgentAllowedTools = ["lookupBuildingRegister"] as const;

type BuildingRegisterTool = (typeof buildingRegisterAgentAllowedTools)[number];

function assertAllowedTool(tool: string): asserts tool is BuildingRegisterTool {
  if (!buildingRegisterAgentAllowedTools.includes(tool as BuildingRegisterTool)) {
    throw new Error(`${BUILDING_REGISTER_AGENT} cannot call tool: ${tool}`);
  }
}

function upsertStatus(statuses: DataSourceStatus[] | undefined, status: DataSourceStatus) {
  const current = statuses ?? [];
  const existingIndex = current.findIndex((item) => item.id === status.id);
  if (existingIndex < 0) return [...current, status];
  return current.map((item, index) => (index === existingIndex ? status : item));
}

function diagnosticSummary(diagnostics: BuildingRegisterDiagnostics) {
  if (!diagnostics.hasServiceKey) return "건축HUB 서비스키 없음";
  if (!diagnostics.sigunguCd || !diagnostics.bjdongCd) return "법정동코드 미확보";
  if (diagnostics.bjdongCd === "00000") return `${diagnostics.sigunguCd}-00000 · 동 단위 법정동코드 미확보`;
  if (!diagnostics.bun) return "지번 본번 미확보";

  const last = diagnostics.attempts.at(-1);
  const lot = `${diagnostics.sigunguCd}-${diagnostics.bjdongCd} · ${diagnostics.bun}-${diagnostics.ji ?? "0000"}`;
  if (!last) return `${lot} · 호출 전`;

  const status = [last.httpStatus ? `HTTP ${last.httpStatus}` : null, last.itemCount !== undefined ? `표제부 ${last.itemCount}건` : null]
    .filter(Boolean)
    .join(" · ");
  const error = last.error ? ` · ${last.error.slice(0, 80)}` : "";
  return `${lot} · ${status || "조회 실패"}${error}`;
}

function addressCandidates(payload: AnalyzeRequest, geocode: GeocodeResult) {
  return [
    geocode.result?.parcelAddress,
    geocode.result?.addressType === "parcel" ? geocode.result.address : undefined,
    geocode.result?.roadAddress,
    payload.address
  ].filter((item): item is string => Boolean(item));
}

export async function runBuildingRegisterAgent({
  report,
  payload,
  legalDong,
  geocode,
  trace
}: {
  report: AnalyzeResponse;
  payload: AnalyzeRequest;
  legalDong: LegalDongCode | null;
  geocode: GeocodeResult;
  trace: TraceRecorder;
}) {
  const tool = "lookupBuildingRegister";
  assertAllowedTool(tool);

  const candidates = addressCandidates(payload, geocode);
  const result = await trace.run(
    BUILDING_REGISTER_AGENT,
    tool,
    `region=${legalDong?.regionCode ?? "unknown"} · address=${candidates[0] ?? payload.address}`,
    () => lookupBuildingRegister({ legalDong, addressCandidates: candidates }),
    (lookup) => ({
      status: lookup.summary ? "success" : "missing",
      outputSummary: lookup.summary
        ? `${lookup.summary.mainPurpose ?? lookup.summary.etcPurpose ?? "용도 미확인"} · ${lookup.summary.useApprovalDate ?? "사용승인일 미확인"} · 표제부 ${lookup.summary.sampleSize}건`
        : diagnosticSummary(lookup.diagnostics)
    })
  );

  if (!result.summary) {
    return {
      ...report,
      data_statuses: upsertStatus(report.data_statuses, {
        id: "building-register",
        label: "건축물대장",
        status: legalDong ? "missing" : "fallback",
        detail: diagnosticSummary(result.diagnostics)
      }),
      sections: {
        ...report.sections,
        unverified_items: ["건축물대장 표제부 조회 결과 미확보", ...report.sections.unverified_items]
      }
    } satisfies AnalyzeResponse;
  }

  return {
    ...applyBuildingRegisterSummary(report, result.summary),
    data_statuses: upsertStatus(report.data_statuses, {
      id: "building-register",
      label: "건축물대장",
      status: "success",
      detail: `${result.summary.mainPurpose ?? result.summary.etcPurpose ?? "용도 미확인"} · 사용승인일 ${result.summary.useApprovalDate ?? "-"}`
    })
  } satisfies AnalyzeResponse;
}
