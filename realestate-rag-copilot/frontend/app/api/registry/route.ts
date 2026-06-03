import { NextResponse } from "next/server";
import type { AnalyzeRequest, AnalyzeResponse } from "@/lib/types";
import { createTraceRecorder, withTraces } from "@/lib/server/agent-runtime/trace";
import { runRegistryAgent } from "@/lib/server/agent-runtime/agents/registry-agent";

function appendTraces(report: AnalyzeResponse, traces: ReturnType<typeof createTraceRecorder>["traces"]) {
  return withTraces(report, [...(report.agent_traces ?? []), ...traces]);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as {
      payload?: AnalyzeRequest;
      report?: AnalyzeResponse;
    };

    if (!body.payload || !body.report) {
      return NextResponse.json({ error: "payload와 report가 필요합니다." }, { status: 400 });
    }

    const trace = createTraceRecorder();
    const updated = await runRegistryAgent({
      report: body.report,
      payload: body.payload,
      legalDong: null,
      trace,
      allowPaidLookup: true
    });

    return NextResponse.json(appendTraces(updated, trace.traces));
  } catch (error) {
    const message = error instanceof Error ? error.message : "등기부등본 열람 실행 중 오류가 발생했습니다.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
