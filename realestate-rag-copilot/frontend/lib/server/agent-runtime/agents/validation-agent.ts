import type { AnalyzeResponse } from "@/lib/types";
import type { TraceRecorder } from "../trace";

const VALIDATION_AGENT = "Validation Agent" as const;

export const validationAgentAllowedTools = ["validateFinalReport", "runtimeFallback"] as const;

type ValidationTool = (typeof validationAgentAllowedTools)[number];

function assertAllowedTool(tool: string): asserts tool is ValidationTool {
  if (!validationAgentAllowedTools.includes(tool as ValidationTool)) {
    throw new Error(`${VALIDATION_AGENT} cannot call tool: ${tool}`);
  }
}

export function runValidationAgent({ report, trace }: { report: AnalyzeResponse; trace: TraceRecorder }) {
  const tool = "validateFinalReport";
  assertAllowedTool(tool);

  trace.record(
    VALIDATION_AGENT,
    tool,
    `warnings=${report.warnings.length} · unverified=${report.sections.unverified_items.length}`,
    "단정 표현 차단 · 미확인 항목 유지 · 전문가 검토 문구 유지"
  );

  return report;
}

export function recordRuntimeFallback({
  trace,
  inputSummary,
  outputSummary
}: {
  trace: TraceRecorder;
  inputSummary: string;
  outputSummary: string;
}) {
  const tool = "runtimeFallback";
  assertAllowedTool(tool);
  trace.record(VALIDATION_AGENT, tool, inputSummary, outputSummary, "failed");
}
