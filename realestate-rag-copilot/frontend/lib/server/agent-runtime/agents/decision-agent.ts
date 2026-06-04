import type {
  AnalyzeRequest,
  AnalyzeResponse,
  BuildingRegisterView,
  BusinessPermitFindings,
  CommercialUseFindings,
  DecisionFinding,
  DecisionVerdict,
  LegalRagFinding,
  NaverContextFinding
} from "@/lib/types";
import { getOpenAIClient } from "@/lib/server/openai-client";
import type { TraceRecorder } from "../trace";

const AGENT = "Summarizer Agent" as const;

const MODE_KOREAN: Record<string, string> = {
  business_permit: "창업·영업 적합성",
  commercial_use: "상가 활용성",
  real_estate: "부동산 임차·매수"
};

const BUSINESS_TYPE_KOREAN: Record<string, string> = {
  restaurant: "음식점",
  cafe: "카페·휴게음식점",
  beauty: "미용실",
  academy: "학원",
  pc_room: "PC방",
  karaoke: "노래방",
  other: "기타"
};

type DecisionContext = {
  payload: AnalyzeRequest;
  buildingRegister?: BuildingRegisterView | null;
  businessFindings?: BusinessPermitFindings;
  commercialFindings?: CommercialUseFindings;
  localContext?: NaverContextFinding;
  legalRag?: LegalRagFinding;
};

function buildPrompt(ctx: DecisionContext): string {
  const { payload, buildingRegister, businessFindings, commercialFindings, localContext, legalRag } = ctx;

  const lines: string[] = [];
  lines.push(`# 사용자 입력`);
  lines.push(`- 검토 모드: ${MODE_KOREAN[payload.mode ?? "real_estate"] ?? payload.mode}`);
  lines.push(`- 주소: ${payload.address ?? "(미입력)"}`);
  if (payload.business_type)
    lines.push(`- 업종: ${BUSINESS_TYPE_KOREAN[payload.business_type] ?? payload.business_type}`);
  if (payload.commercial_purpose) lines.push(`- 상가 목적: ${payload.commercial_purpose}`);
  if (payload.user_question?.trim()) lines.push(`- 질문: ${payload.user_question}`);

  if (buildingRegister) {
    lines.push(`\n# 건축물대장 (가장 정확한 1차 데이터)`);
    lines.push(`- 주용도: ${buildingRegister.mainPurpose ?? "미확인"}`);
    lines.push(`- 지상 ${buildingRegister.groundFloors ?? "?"}층 / 지하 ${buildingRegister.undergroundFloors ?? "?"}층`);
    if (buildingRegister.useApprovalDate) lines.push(`- 사용승인일: ${buildingRegister.useApprovalDate}`);
    if (buildingRegister.violationBuilding !== undefined && buildingRegister.violationBuilding !== null)
      lines.push(`- 위반건축물: ${buildingRegister.violationBuilding ? "예 (주의)" : "아니오"}`);
    if (buildingRegister.roadAddress) lines.push(`- 도로명: ${buildingRegister.roadAddress}`);
  }

  if (businessFindings?.competition) {
    const c = businessFindings.competition;
    lines.push(`\n# 동종업종 밀집도`);
    lines.push(
      `- ${c.business_type_label} ${c.total_stores}건 / ${c.radius_meters > 0 ? `반경 ${c.radius_meters}m` : "자치구 전체"} 매장 ${c.all_stores_in_radius}건 · ${c.density_label}`
    );
    if (c.total_stores === 0)
      lines.push(`- (주의: 0건은 입력 좌표 외곽 데이터 누락 가능성. 실제 주변 매장 다수일 수 있음)`);
  }

  if (businessFindings?.school_zone) {
    const s = businessFindings.school_zone;
    lines.push(`\n# 학교 정화구역 영향`);
    lines.push(`- ${s.district} 학교 ${s.total_schools_in_district}건 · ${s.business_type_label} 영향=${s.impact_level}`);
    lines.push(`- ${s.impact_message}`);
    if (s.total_schools_in_district === 0)
      lines.push(`- (주의: NEIS API 일시 오류 가능. 실제 정화구역은 별도 확인)`);
  }

  if (commercialFindings?.property_value) {
    const p = commercialFindings.property_value;
    lines.push(`\n# 인근 시세 (참고)`);
    if (p.average_sale_price) lines.push(`- 평균 매매가: ${(p.average_sale_price / 100_000_000).toFixed(2)}억`);
    if (p.average_deposit) lines.push(`- 평균 보증금: ${(p.average_deposit / 10_000).toFixed(0)}만원`);
    if (p.average_monthly_rent) lines.push(`- 평균 월세: ${(p.average_monthly_rent / 10_000).toFixed(0)}만원`);
    lines.push(`- 거래 표본: ${p.sale_sample_size + p.rent_sample_size}건`);
  }

  if (legalRag && legalRag.hits.length > 0) {
    lines.push(`\n# 관련 법령·조례·사례 RAG (top-${legalRag.hits.length})`);
    for (const hit of legalRag.hits.slice(0, 3)) {
      lines.push(`- [${hit.domain}] ${hit.title}: ${hit.text.replace(/\n/g, " ").slice(0, 150)}...`);
    }
  }

  if (localContext && localContext.items.length > 0) {
    lines.push(`\n# 동네 분위기·이슈 (Naver/X 검색)`);
    for (const item of localContext.items.slice(0, 3)) {
      lines.push(`- [${item.kind}] ${item.title}`);
    }
  }

  return lines.join("\n");
}

const SYSTEM_PROMPT = `당신은 한국 부동산·창업 컨설턴트입니다.
사용자가 입력한 주소·업종 정보와 Agent들이 수집한 데이터(건축물대장·동종업종 밀집도·학교 정화구역·법령 RAG·외부 검색)를 종합해
사용자가 **즉시 행동할 수 있는** 결론을 작성하세요.

엄격한 JSON으로 답변:
{
  "verdict": "go" | "conditional" | "stop",
  "headline": "한 줄 결론 (40자 이내, 명확)",
  "reasons": ["근거 1", "근거 2", "근거 3"],
  "next_actions": ["즉시 할 일 1", "2", "3"],
  "red_flags": ["빨간 신호 1", "2"],
  "data_quality": "데이터 신뢰도 1줄 평가 (어느 데이터가 부족한지)"
}

규칙:
- verdict "go": 데이터상 명확히 가능. "conditional": 추가 확인 필요. "stop": 명백한 제약 (정화구역·용도지역 불일치 등).
- reasons는 **구체적**으로. "건축물대장상 제1종근생 3층 → 휴게음식점 신고 가능" 형식.
- next_actions는 **즉시 행동 단위**. "○○구청 위생과 방문 (인허가 사전 컨설팅)" 같은 구체적 액션.
- 데이터가 부족하면 next_actions에 "확인 필요" 항목 포함.
- red_flags는 0~2개. 정말 위험할 때만.
- 헛소문·일반론 X. 입력 데이터에서 도출 가능한 결론만.
- 한국어로.`;

export async function runDecisionAgent({
  payload,
  report,
  trace
}: {
  payload: AnalyzeRequest;
  report: Pick<
    AnalyzeResponse,
    "building_register" | "business_findings" | "commercial_findings" | "local_context" | "legal_rag"
  >;
  trace: TraceRecorder;
}): Promise<DecisionFinding | null> {
  const client = getOpenAIClient();
  if (!client) {
    trace.record(AGENT, "synthesizeDecision", "no payload", "OPENAI_API_KEY 미설정", "missing");
    return null;
  }

  const ctx: DecisionContext = {
    payload,
    buildingRegister: report.building_register,
    businessFindings: report.business_findings,
    commercialFindings: report.commercial_findings,
    localContext: report.local_context,
    legalRag: report.legal_rag
  };

  const userPrompt = buildPrompt(ctx);
  const inputSummary = `mode=${payload.mode ?? "?"} bldg=${ctx.buildingRegister ? "✓" : "✗"} rag=${ctx.legalRag?.hits.length ?? 0}`;

  try {
    return await trace.run(
      AGENT,
      "synthesizeDecision",
      inputSummary,
      async () => {
        const completion = await client.chat.completions.create({
          model: "gpt-4o-mini",
          response_format: { type: "json_object" },
          messages: [
            { role: "system", content: SYSTEM_PROMPT },
            { role: "user", content: userPrompt }
          ],
          max_tokens: 600,
          temperature: 0.3
        });
        const text = completion.choices[0]?.message?.content ?? "{}";
        const parsed = JSON.parse(text) as Partial<DecisionFinding>;

        const verdict: DecisionVerdict =
          parsed.verdict === "go" || parsed.verdict === "stop" ? parsed.verdict : "conditional";

        const finding: DecisionFinding = {
          verdict,
          headline: parsed.headline?.trim() || "검토 데이터 종합 결과를 확인하세요.",
          reasons: Array.isArray(parsed.reasons) ? parsed.reasons.filter(Boolean).slice(0, 3) : [],
          next_actions: Array.isArray(parsed.next_actions)
            ? parsed.next_actions.filter(Boolean).slice(0, 4)
            : [],
          red_flags: Array.isArray(parsed.red_flags) ? parsed.red_flags.filter(Boolean).slice(0, 2) : [],
          data_quality: parsed.data_quality?.trim() || "데이터 신뢰도 평가 미생성",
          source: "터무니 의사결정 합성 (gpt-4o-mini, RAG + 공공 API + 외부 검색 종합)"
        };
        return finding;
      },
      (finding) => ({
        status: finding ? "success" : "missing",
        outputSummary: finding
          ? `${finding.verdict.toUpperCase()} · "${finding.headline.slice(0, 50)}" · 액션 ${finding.next_actions.length}개`
          : "decision 생성 실패"
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "decision synthesis failed";
    trace.record(AGENT, "synthesizeDecision", inputSummary, message.slice(0, 120), "failed");
    return null;
  }
}
