import { getOpenAIClient } from "@/lib/server/openai-client";

export const EMBEDDING_MODEL = "text-embedding-3-small";
export const EMBEDDING_DIM = 1536;

/**
 * OpenAI text-embedding-3-small로 텍스트를 임베딩.
 * 비용: $0.02 / 1M tokens (한글 ~1.5 토큰/글자 기준 매우 저렴).
 * 배치 호출 권장 (단일 호출당 최대 ~2048개 input).
 */
export async function embedTexts(texts: string[]): Promise<number[][] | null> {
  if (texts.length === 0) return [];
  const client = getOpenAIClient();
  if (!client) {
    console.warn("[rag/embedder] OPENAI_API_KEY not set — skipping embedding");
    return null;
  }

  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts
  });

  return response.data.map((d) => d.embedding);
}

export async function embedQuery(text: string): Promise<number[] | null> {
  const result = await embedTexts([text]);
  return result?.[0] ?? null;
}

export function cosineSimilarity(a: number[], b: number[]): number {
  if (a.length !== b.length) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (let i = 0; i < a.length; i += 1) {
    dot += a[i] * b[i];
    na += a[i] * a[i];
    nb += b[i] * b[i];
  }
  const denom = Math.sqrt(na) * Math.sqrt(nb);
  return denom === 0 ? 0 : dot / denom;
}
