import type { AnalyzeRequest } from "@/lib/types";
import { geocodeAddress, type GeocodeResult } from "@/lib/server/vworld";
import type { TraceRecorder } from "../trace";

const LOCATION_CONTEXT_AGENT = "Location Context Agent" as const;

export const locationContextAgentAllowedTools = ["geocodeAddress"] as const;

type LocationContextTool = (typeof locationContextAgentAllowedTools)[number];

function assertAllowedTool(tool: string): asserts tool is LocationContextTool {
  if (!locationContextAgentAllowedTools.includes(tool as LocationContextTool)) {
    throw new Error(`${LOCATION_CONTEXT_AGENT} cannot call tool: ${tool}`);
  }
}

function geocodeFailureSummary(geocode: GeocodeResult) {
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

export async function runLocationContextAgent({
  payload,
  trace
}: {
  payload: AnalyzeRequest;
  trace: TraceRecorder;
}) {
  const tool = "geocodeAddress";
  assertAllowedTool(tool);

  return trace.run(
    LOCATION_CONTEXT_AGENT,
    tool,
    payload.address,
    () => geocodeAddress(payload.address),
    (result) => ({
      status: result.result ? "success" : "fallback",
      outputSummary: result.result
        ? `${result.result.source} · ${result.result.address} · ${result.result.lat.toFixed(5)}, ${result.result.lng.toFixed(5)}`
        : geocodeFailureSummary(result)
    })
  );
}
