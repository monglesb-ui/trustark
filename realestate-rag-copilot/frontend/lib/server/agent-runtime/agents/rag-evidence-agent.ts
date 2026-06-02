import type { AnalyzeRequest, AnalyzeResponse } from "@/lib/types";
import type { TraceRecorder } from "../trace";

const RAG_EVIDENCE_AGENT = "RAG Evidence Agent" as const;

export const ragEvidenceAgentAllowedTools = ["retrieveChecklistEvidence"] as const;

type RagEvidenceTool = (typeof ragEvidenceAgentAllowedTools)[number];

function assertAllowedTool(tool: string): asserts tool is RagEvidenceTool {
  if (!ragEvidenceAgentAllowedTools.includes(tool as RagEvidenceTool)) {
    throw new Error(`${RAG_EVIDENCE_AGENT} cannot call tool: ${tool}`);
  }
}

function retrieveChecklistEvidence(report: AnalyzeResponse) {
  return report.evidence.filter((item) => item.source.startsWith("rag_docs"));
}

export function runRagEvidenceAgent({
  report,
  payload,
  trace
}: {
  report: AnalyzeResponse;
  payload: AnalyzeRequest;
  trace: TraceRecorder;
}) {
  const tool = "retrieveChecklistEvidence";
  assertAllowedTool(tool);

  const evidence = retrieveChecklistEvidence(report);
  trace.record(
    RAG_EVIDENCE_AGENT,
    tool,
    `question=${payload.user_question || "기본 전세 계약 확인 질문"}`,
    `RAG 체크리스트 근거 ${evidence.length}건 준비`
  );

  return {
    report,
    evidence
  };
}
