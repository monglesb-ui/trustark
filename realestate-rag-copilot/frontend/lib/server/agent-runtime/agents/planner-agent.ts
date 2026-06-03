import type { AnalyzeRequest, PlannerOutput } from "@/lib/types";
import { getOpenAIClient } from "@/lib/server/openai-client";
import { getPropertyTypeLabel } from "@/lib/property-types";
import type { TraceRecorder } from "../trace";

const PLANNER_AGENT = "Planner Agent" as const;
const PLANNER_TOOL = "interpretGoals" as const;
const PLANNER_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `당신은 한국 부동산 계약 위험 분석 코파일럿의 Planner 에이전트입니다.
사용자의 계약 조건과 자유 질문을 읽고, 후속 분석 단계가 어떤 신호를 우선시해야 하는지 산출합니다.

intent_tags 후보 (필요한 만큼 선택):
- concern_jeonse_fraud: 깡통전세/전세사기 우려
- concern_rights_transfer: 권리관계 변동/근저당
- concern_owner_change: 임대인 변경/소유권 이전
- concern_guarantee_insurance: 전세보증금 반환보증 가입 가능성
- concern_market_price: 시세 적정성/표본 신뢰도
- concern_building_violation: 위반건축물/주거용 여부
- concern_senior_lien: 선순위 임차인/체납
- concern_multi_household: 다가구 호실별 부담
- general_first_time: 첫 계약자 일반 안내

사용자가 명시한 질문이 없거나 막연하면 계약 유형·주택 유형에서 가장 관련성 높은 태그 1~2개를 산출합니다. 단정 표현은 피하고, 사실 확인이 필요한 항목을 강조합니다.`;

export async function runPlannerAgent({
  payload,
  trace
}: {
  payload: AnalyzeRequest;
  trace: TraceRecorder;
}): Promise<PlannerOutput | null> {
  const client = getOpenAIClient();
  if (!client) {
    trace.record(
      PLANNER_AGENT,
      PLANNER_TOOL,
      `address=${payload.address}`,
      "OPENAI_API_KEY 미설정 · Planner 건너뜀",
      "missing"
    );
    return null;
  }

  const propertyLabel = getPropertyTypeLabel(payload.property_type);
  const userPayload = [
    `계약 유형: ${payload.contract_type}`,
    `주택 유형: ${propertyLabel}`,
    `주소: ${payload.address}`,
    `보증금: ${payload.deposit ? payload.deposit.toLocaleString("ko-KR") + "원" : "-"}`,
    `월세: ${payload.monthly_rent ? payload.monthly_rent.toLocaleString("ko-KR") + "원" : "-"}`,
    `매매가: ${payload.sale_price ? payload.sale_price.toLocaleString("ko-KR") + "원" : "(입력 없음)"}`,
    `사용자 질문: ${payload.user_question?.trim() || "(질문 없음 - 일반 검토)"}`
  ].join("\n");

  const inputSummary = `address=${payload.address} · question_len=${(payload.user_question ?? "").length}`;

  try {
    return await trace.run(
      PLANNER_AGENT,
      PLANNER_TOOL,
      inputSummary,
      async () => {
        const completion = await client.chat.completions.create({
          model: PLANNER_MODEL,
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPayload }
          ],
          tools: [
            {
              type: "function",
              function: {
                name: PLANNER_TOOL,
                description: "사용자 의도를 intent_tags / emphasis / user_question_summary로 산출합니다.",
                parameters: {
                  type: "object",
                  additionalProperties: false,
                  properties: {
                    intent_tags: {
                      type: "array",
                      items: { type: "string" },
                      description: "위에 나열된 후보 중 1~5개"
                    },
                    emphasis: {
                      type: "array",
                      items: { type: "string" },
                      description: "후속 분석이 강조할 항목 1~3개 (짧은 한국어 문구)"
                    },
                    user_question_summary: {
                      type: "string",
                      description: "사용자가 알고 싶어 하는 것을 1문장으로 요약"
                    }
                  },
                  required: ["intent_tags", "emphasis", "user_question_summary"]
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: PLANNER_TOOL } }
        });

        const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
        if (!toolCall || toolCall.type !== "function") return null;
        const parsed = JSON.parse(toolCall.function.arguments) as PlannerOutput;
        if (!Array.isArray(parsed.intent_tags) || !Array.isArray(parsed.emphasis) || typeof parsed.user_question_summary !== "string") {
          return null;
        }
        return parsed;
      },
      (result) => ({
        status: result ? "success" : "failed",
        outputSummary: result
          ? `tags=${result.intent_tags.slice(0, 3).join(",") || "(none)"} · emphasis=${result.emphasis.length}개`
          : "function_call 응답 없음"
      })
    );
  } catch (error) {
    return null;
  }
}
