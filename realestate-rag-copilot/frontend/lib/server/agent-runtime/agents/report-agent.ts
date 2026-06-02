import type { AnalyzeResponse } from "@/lib/types";
import type { TraceRecorder } from "../trace";

const REPORT_AGENT = "Report Agent" as const;

export const reportAgentAllowedTools = ["composeReport"] as const;

type ReportTool = (typeof reportAgentAllowedTools)[number];

function assertAllowedTool(tool: string): asserts tool is ReportTool {
  if (!reportAgentAllowedTools.includes(tool as ReportTool)) {
    throw new Error(`${REPORT_AGENT} cannot call tool: ${tool}`);
  }
}

export function runReportAgent({ report, trace }: { report: AnalyzeResponse; trace: TraceRecorder }) {
  const tool = "composeReport";
  assertAllowedTool(tool);

  trace.record(
    REPORT_AGENT,
    tool,
    `signals=${(report.risk_signals ?? []).length} · evidence=${report.evidence.length}`,
    "dashboard/document/agent report sections ready"
  );

  return report;
}
