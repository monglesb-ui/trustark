import type { AnalyzeRequest, PlannerOutput } from "@/lib/types";
import { getOpenAIClient } from "@/lib/server/openai-client";
import { getPropertyTypeLabel } from "@/lib/property-types";
import type { TraceRecorder } from "../trace";

const PLANNER_AGENT = "Planner Agent" as const;
const PLANNER_TOOL = "interpretGoals" as const;
const PLANNER_MODEL = "gpt-4o-mini";

const SYSTEM_PROMPT = `당신은 한국 부동산 계약 위험 분석 코파일럿의 Planner 에이전트입니다.
사용자의 계약 조건과 자유 질문을 읽고 두 가지를 산출합니다:

(1) 의도 분류 — intent_tags / emphasis / user_question_summary
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

(2) 실행 계획 — execution_plan
사용자 의도와 입력값을 보고 4개 외부 데이터 단계에 대해 우선순위를 매깁니다.
각 단계는 항상 결과 배열에 한 번씩 등장해야 합니다 (4개 정확히).

- market_data: data.go.kr 실거래가(전월세·매매). 시세 적정성·전세가율 산출에 사용.
- building_register: 건축HUB 건축물대장. 용도·위반건축물·사용승인일 확인.
- registry: CODEF 등기부등본 가능 여부. 자동 분석에서는 권리관계 원문 호출은 생략하지만 안내 prominence는 priority로 조정.
- search_context: 네이버 웹/뉴스 검색. 단지/지역 외부 맥락 수집(공식 데이터 보완).

priority 정의:
- critical: 사용자 질문 의도상 가장 중요. 미확보 시 사용자에게 명시적 경고 표시.
- normal: 일반적으로 실행. 실패해도 큰 경고 없이 진행.
- optional: 사용자 의도에 직접 관련 없음. 시간·비용 절약을 위해 실행 생략 가능.

판단 기준 예시:
- 사용자가 권리관계/근저당/임대인 변경 우려를 표현 → registry critical
- 사용자가 시세·전세가율을 직접 물음 → market_data critical
- 사용자가 위반건축물·용도를 우려 → building_register critical
- 첫 계약자 일반 안내 (general_first_time만) → market_data normal, registry normal, 나머지 optional 또는 normal
- 막연한 "확인 사항" 질문 → registry critical (가장 임팩트 큰 항목 default)

notes 필드는 왜 그 priority인지 한국어 1문장으로 기재.

단정 표현을 피하고, 사용자가 추가 확인해야 할 항목을 강조하는 톤을 유지하세요.`;

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
                description: "사용자 의도(intent_tags/emphasis/user_question_summary)와 실행 계획(execution_plan)을 산출합니다.",
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
                    },
                    execution_plan: {
                      type: "array",
                      description: "정확히 4개. market_data/building_register/registry/search_context 각각 1회씩 등장.",
                      items: {
                        type: "object",
                        additionalProperties: false,
                        properties: {
                          agent: {
                            type: "string",
                            enum: ["market_data", "building_register", "registry", "search_context"]
                          },
                          priority: {
                            type: "string",
                            enum: ["critical", "normal", "optional"]
                          },
                          notes: {
                            type: "string",
                            description: "왜 이 priority인지 한국어 1문장"
                          }
                        },
                        required: ["agent", "priority", "notes"]
                      }
                    }
                  },
                  required: ["intent_tags", "emphasis", "user_question_summary", "execution_plan"]
                }
              }
            }
          ],
          tool_choice: { type: "function", function: { name: PLANNER_TOOL } }
        });

        const toolCall = completion.choices[0]?.message?.tool_calls?.[0];
        if (!toolCall || toolCall.type !== "function") return null;
        const parsed = JSON.parse(toolCall.function.arguments) as Partial<PlannerOutput>;
        if (
          !Array.isArray(parsed.intent_tags) ||
          !Array.isArray(parsed.emphasis) ||
          typeof parsed.user_question_summary !== "string"
        ) {
          return null;
        }
        // execution_plan 누락 시 기본값(전부 normal)으로 채워 넣음
        const plan = Array.isArray(parsed.execution_plan) ? parsed.execution_plan : [];
        const seen = new Set(plan.map((e) => e.agent));
        const all: PlannerOutput["execution_plan"][number]["agent"][] = [
          "market_data",
          "building_register",
          "registry",
          "search_context"
        ];
        for (const agent of all) {
          if (!seen.has(agent)) {
            plan.push({ agent, priority: "normal", notes: "Planner 누락 - 기본값 적용" });
          }
        }
        return {
          intent_tags: parsed.intent_tags,
          emphasis: parsed.emphasis,
          user_question_summary: parsed.user_question_summary,
          execution_plan: plan
        };
      },
      (result) => ({
        status: result ? "success" : "failed",
        outputSummary: result
          ? `tags=${result.intent_tags.slice(0, 3).join(",") || "(none)"} · plan=${result.execution_plan
              .map((e) => `${e.agent}:${e.priority}`)
              .join(" ")}`
          : "function_call 응답 없음"
      })
    );
  } catch (error) {
    return null;
  }
}
