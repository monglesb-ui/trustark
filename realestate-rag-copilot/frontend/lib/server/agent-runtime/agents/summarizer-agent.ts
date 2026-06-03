import type { AnalyzeRequest, AnalyzeResponse, PlannerOutput } from "@/lib/types";
import { getOpenAIClient } from "@/lib/server/openai-client";
import type { TraceRecorder } from "../trace";

const SUMMARIZER_AGENT = "Summarizer Agent" as const;
const SUMMARIZER_TOOL = "writeReportSummary" as const;
const SUMMARIZER_MODEL = "gpt-4o";

const SYSTEM_PROMPT = `당신은 한국 부동산 계약 위험 분석 코파일럿의 Summarizer 에이전트입니다.
입력으로 구조화된 분석 결과(시세, 등기, 건축물대장, 위험 점수, 미확인 항목 등)와 Planner가 추정한 사용자 의도를 받습니다.

다음을 산출하세요:
- summary: 사용자에게 보여줄 2~3문장의 요약. 단정 표현은 피하고, "현재 데이터 기준", "추가 확인 필요" 같은 안전 표현을 유지. Planner의 의도를 반영해 가장 우려되는 항목을 먼저 언급.
- ranked_next_actions: 사용자가 가장 먼저 해야 할 후속 행동을 우선순위 순으로 3~6개. 각 항목은 구체적(예: "등기부등본을 발급해 근저당권·압류·가압류 여부 확인")이고 한 줄.

원본 next_actions를 참고하되 우선순위와 표현을 다듬어 새로 구성해도 좋습니다. 단정·법적 판단은 금지.`;

type SummarizerOutput = {
  summary: string;
  ranked_next_actions: string[];
};

function buildReportSnapshot(report: AnalyzeResponse): string {
  const lines: string[] = [];
  lines.push(`risk_score: ${report.risk_score} · risk_level: ${report.risk_level}`);
  if (report.score_breakdown) {
    lines.push(
      `score_breakdown: base ${report.score_breakdown.base_score}(${report.score_breakdown.base_reason}) + ${report.score_breakdown.adjustments
        .map((a) => `+${a.delta}(${a.reason.slice(0, 60)})`)
        .join(" ") || "(no adjustments)"} = ${report.score_breakdown.final_score}`
    );
  }
  const mc = report.market_comparison;
  lines.push(
    `market_comparison: deposit_input=${mc.input_deposit ?? "-"} · sale_avg=${mc.nearby_avg_sale_price ?? "-"} · jeonse_ratio=${mc.jeonse_ratio ?? "-"}% · rent_samples=${mc.rent_sample_size ?? 0} · sale_samples=${mc.sale_sample_size ?? 0} · match=${mc.match_mode ?? "-"}`
  );
  if (report.registry) {
    lines.push(
      `registry: status=${report.registry.status} · mortgages=${report.registry.mortgageCount ?? "-"} · attachments=${report.registry.attachmentCount ?? "-"} · note=${report.registry.note.slice(0, 100)}`
    );
  }
  if (report.building_register) {
    lines.push(
      `building_register: purpose=${report.building_register.mainPurpose ?? "-"} · approval=${report.building_register.useApprovalDate ?? "-"} · violation=${report.building_register.violationBuilding ?? "-"}`
    );
  }
  if (report.data_statuses?.length) {
    lines.push(`data_statuses: ${report.data_statuses.map((s) => `${s.id}=${s.status}`).join(", ")}`);
  }
  if (report.risk_signals?.length) {
    lines.push("risk_signals:");
    for (const sig of report.risk_signals.slice(0, 6)) {
      lines.push(`  - [${sig.severity}] ${sig.title}: ${sig.description.slice(0, 120)}`);
    }
  }
  if (report.sections.unverified_items.length) {
    lines.push(`unverified_items: ${report.sections.unverified_items.slice(0, 6).join(" | ")}`);
  }
  if (report.next_actions.length) {
    lines.push(`current_next_actions: ${report.next_actions.slice(0, 8).join(" | ")}`);
  }
  return lines.join("\n");
}

export async function runSummarizerAgent({
  payload,
  report,
  planner,
  trace
}: {
  payload: AnalyzeRequest;
  report: AnalyzeResponse;
  planner: PlannerOutput | null;
  trace: TraceRecorder;
}): Promise<AnalyzeResponse> {
  const client = getOpenAIClient();
  if (!client) {
    trace.record(
      SUMMARIZER_AGENT,
      SUMMARIZER_TOOL,
      `risk=${report.risk_score}`,
      "OPENAI_API_KEY 미설정 · Summarizer 건너뜀 · 기존 템플릿 유지",
      "missing"
    );
    return report;
  }

  const snapshot = buildReportSnapshot(report);
  const plannerLines = planner
    ? `Planner intent_tags: ${planner.intent_tags.join(", ") || "(none)"}\nPlanner emphasis: ${planner.emphasis.join(" | ") || "(none)"}\nPlanner question_summary: ${planner.user_question_summary}`
    : "Planner: (출력 없음)";
  const userPayload = `사용자 질문: ${payload.user_question?.trim() || "(질문 없음)"}\n\n${plannerLines}\n\n=== 분석 결과 스냅샷 ===\n${snapshot}`;

  const inputSummary = `risk=${report.risk_score} · planner=${planner ? planner.intent_tags.length : 0}태그 · 스냅샷 ${snapshot.length}자`;

  try {
    const result = await trace.run(
      SUMMARIZER_AGENT,
      SUMMARIZER_TOOL,
      inputSummary,
      async () => {
        const completion = await client.chat.completions.create({
          model: SUMMARIZER_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPayload }
          ],
          tools: [
            {
              type: "function",
              function: {
                name: SUMMARIZER_TOOL,
                description: "summary와 ranked_next_actions를 산출합니다.",
                parameters: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    summary: {
                      type: "string",
                      description: "2~3문장. 단정 표현 금지. 사용자 의도를 반영."
                    },
                    ranked_next_actions: {
                      type: "array",
                      items: { type: "string" },
                      description: "우선순위 높은 순으로 3~6개의 구체적 액션"
                    }
                  },
                  required: ["summary", "ranked_next_actions"]
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: SUMMARIZER_TOOL } }
        });

        const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
        if (!toolCall || toolCall.type !== "function") return null;
        const parsed = JSON.parse(toolCall.function.arguments) as SummarizerOutput;
        if (typeof parsed.summary !== "string" || !Array.isArray(parsed.ranked_next_actions)) return null;
        const cleanedActions = parsed.ranked_next_actions.filter((a) => typeof a === "string" && a.trim()).slice(0, 8);
        if (!parsed.summary.trim() || cleanedActions.length === 0) return null;
        return { summary: parsed.summary.trim(), ranked_next_actions: cleanedActions };
      },
      (out) => ({
        status: out ? "success" : "failed",
        outputSummary: out
          ? `summary ${out.summary.length}자 · actions ${out.ranked_next_actions.length}개`
          : "function_call 응답 없음"
      })
    );

    if (!result) return report;

    return {
      ...report,
      summary: result.summary,
      next_actions: result.ranked_next_actions
    };
  } catch (error) {
    return report;
  }
}
