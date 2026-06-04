import type {
  AnalyzeRequest,
  LegalRagDomain,
  LegalRagFinding,
  LegalRagHit
} from "@/lib/types";
import { describeIndex, searchRag, type RagDomain } from "@/lib/server/rag/search";
import { getOpenAIClient } from "@/lib/server/openai-client";
import type { TraceRecorder } from "../trace";

const AGENT = "RAG Evidence Agent" as const;

const BUSINESS_TYPE_KOREAN: Record<string, string> = {
  restaurant: "음식점",
  cafe: "카페·휴게음식점",
  beauty: "미용실",
  academy: "학원",
  pc_room: "PC방·게임시설",
  karaoke: "노래방",
  other: ""
};

/**
 * 모드 + 입력값을 보고 도메인을 라우팅 (Agentic RAG의 도구 선택 로직).
 */
function selectDomains(payload: AnalyzeRequest): LegalRagDomain[] {
  if (payload.mode === "business_permit") {
    // 창업: 법령(인허가) + 자치구 조례 + 표준계약(임대 조건)
    return ["law", "ordinance", "contract"];
  }
  if (payload.mode === "commercial_use") {
    // 상가 활용: 자치구 조례 + 표준계약 + 일부 법령
    return ["ordinance", "contract", "law"];
  }
  // 부동산 임차·매수: 표준계약 + 전세사기 사례
  return ["contract", "case"];
}

/**
 * LLM Query Rewriter (Pre-retrieval Advanced RAG).
 * 사용자 입력을 도메인·업종 키워드로 정규화해서 검색 매칭률 향상.
 */
async function rewriteQuery(payload: AnalyzeRequest, baseQuery: string): Promise<string> {
  const client = getOpenAIClient();
  if (!client) return baseQuery;

  const sysprompt = `당신은 한국 부동산·창업 검색 쿼리 리라이터입니다.
사용자 자연어 질문을 법령·조례·계약서 RAG 검색에 적합한 짧은 한국어 키워드 쿼리로 변환합니다.
규칙:
- 최대 30자 이내.
- 핵심 키워드(업종, 자치구, 법령 영역, 검토 항목)만 추출.
- 불필요한 조사·접속사 제거.
- 동의어·법령 명칭 추가 (예: '카페' → '휴게음식점').
- 사용자 질문이 없으면 입력 정보로 적합한 쿼리 합성.
- JSON 출력: {"q": "..."}`;

  const businessLabel = payload.business_type
    ? BUSINESS_TYPE_KOREAN[payload.business_type] ?? payload.business_type
    : "";
  const userContext = [
    payload.mode ? `mode=${payload.mode}` : "",
    payload.address ? `주소: ${payload.address}` : "",
    businessLabel ? `업종: ${businessLabel}` : "",
    payload.user_question ? `질문: ${payload.user_question}` : "",
    `초기 쿼리: ${baseQuery}`
  ]
    .filter(Boolean)
    .join("\n");

  try {
    const completion = await client.chat.completions.create({
      model: "gpt-4o-mini",
      response_format: { type: "json_object" },
      messages: [
        { role: "system", content: sysprompt },
        { role: "user", content: userContext }
      ],
      max_tokens: 80,
      temperature: 0.2
    });
    const text = completion.choices[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(text) as { q?: string };
    return parsed.q?.trim() || baseQuery;
  } catch {
    return baseQuery;
  }
}

function buildBaseQuery(payload: AnalyzeRequest): string {
  if (payload.user_question?.trim()) return payload.user_question.trim();
  const businessLabel = payload.business_type
    ? BUSINESS_TYPE_KOREAN[payload.business_type] ?? ""
    : "";
  const sigunguMatch = (payload.address ?? "").match(/([가-힣]+구)/);
  const sigungu = sigunguMatch?.[1] ?? "";
  if (payload.mode === "business_permit") {
    return `${sigungu} ${businessLabel} 인허가 영업 규제`.trim();
  }
  if (payload.mode === "commercial_use") {
    return `${sigungu} 상가 임대 영업 가능 업종`.trim();
  }
  return `${sigungu} 임대차계약 전세사기 등기 검증`.trim();
}

export async function runLegalRagAgent({
  payload,
  trace
}: {
  payload: AnalyzeRequest;
  trace: TraceRecorder;
}): Promise<LegalRagFinding | null> {
  const baseQuery = buildBaseQuery(payload);
  const domains = selectDomains(payload);
  const inputSummary = `query="${baseQuery}" domains=[${domains.join(",")}]`;

  try {
    return await trace.run(
      AGENT,
      "ragSearch",
      inputSummary,
      async () => {
        const rewritten = await rewriteQuery(payload, baseQuery);
        const hits = await searchRag({
          query: rewritten,
          domains: domains as RagDomain[],
          topK: 5,
          minScore: 0.25
        });
        const indexInfo = describeIndex();

        if (hits.length === 0) {
          return null;
        }

        const finding: LegalRagFinding = {
          query: baseQuery,
          rewritten_query: rewritten,
          selected_domains: domains,
          hits: hits.map<LegalRagHit>((h) => ({
            id: h.id,
            domain: h.domain as LegalRagDomain,
            title: h.title,
            section: h.section,
            text: h.text,
            score: h.score,
            source: h.source
          })),
          source: "내부 RAG (식품위생법·풍속법·표준임대차·전세사기 사례·자치구 조례)",
          note: `Agentic RAG: Planner 의도 기반 도메인 라우팅 + LLM 쿼리 리라이팅. 인덱스 ${indexInfo.size}건 중 top-${hits.length} 매칭.`,
          index_size: indexInfo.size
        };
        return finding;
      },
      (finding) => ({
        status: finding && finding.hits.length > 0 ? "success" : "missing",
        outputSummary: finding
          ? `top-${finding.hits.length} 매칭 · query="${finding.rewritten_query.slice(0, 40)}" domains=[${finding.selected_domains.join(",")}]`
          : "검색 결과 0건"
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "rag search failed";
    trace.record(AGENT, "ragSearch", inputSummary, message.slice(0, 120), "failed");
    return null;
  }
}
