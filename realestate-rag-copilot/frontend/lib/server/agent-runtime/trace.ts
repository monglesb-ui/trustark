import type { AgentTrace, AnalyzeResponse } from "@/lib/types";

export type TraceAgent =
  | "Market Data Agent"
  | "RAG Evidence Agent"
  | "Location Context Agent"
  | "Risk Scoring Agent"
  | "Report Agent"
  | "Validation Agent";

export type TraceRecorder = ReturnType<typeof createTraceRecorder>;

function traceId(index: number, agent: TraceAgent, tool: string) {
  return `${index}-${agent}-${tool}`.replace(/\s+/g, "-").toLowerCase();
}

export function createTraceRecorder() {
  const traces: AgentTrace[] = [];

  async function run<T>(
    agent: TraceAgent,
    tool: string,
    inputSummary: string,
    task: () => Promise<T>,
    summarize: (result: T) => { status?: AgentTrace["status"]; outputSummary: string }
  ) {
    const started = Date.now();
    const startedAt = new Date(started).toISOString();

    try {
      const result = await task();
      const ended = Date.now();
      const summary = summarize(result);
      traces.push({
        id: traceId(traces.length + 1, agent, tool),
        agent,
        tool,
        status: summary.status ?? "success",
        inputSummary,
        outputSummary: summary.outputSummary,
        startedAt,
        endedAt: new Date(ended).toISOString(),
        durationMs: ended - started
      });
      return result;
    } catch (error) {
      const ended = Date.now();
      traces.push({
        id: traceId(traces.length + 1, agent, tool),
        agent,
        tool,
        status: "failed",
        inputSummary,
        outputSummary: error instanceof Error ? error.message.slice(0, 160) : "tool call failed",
        startedAt,
        endedAt: new Date(ended).toISOString(),
        durationMs: ended - started
      });
      throw error;
    }
  }

  function record(
    agent: TraceAgent,
    tool: string,
    inputSummary: string,
    outputSummary: string,
    status: AgentTrace["status"] = "success"
  ) {
    const now = new Date().toISOString();
    traces.push({
      id: traceId(traces.length + 1, agent, tool),
      agent,
      tool,
      status,
      inputSummary,
      outputSummary,
      startedAt: now,
      endedAt: now,
      durationMs: 0
    });
  }

  return { traces, run, record };
}

export function withTraces(report: AnalyzeResponse, agentTraces: AgentTrace[]) {
  return {
    ...report,
    agent_traces: agentTraces
  } satisfies AnalyzeResponse;
}
