import "server-only";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { cosineSimilarity, embedQuery } from "./embedder";

export type RagDomain = "law" | "ordinance" | "case" | "contract";

export type RagIndexEntry = {
  id: string;
  domain: RagDomain;
  source: string;          // 원문 경로 (예: "rag-sources/food-sanitation-law.md")
  title: string;            // 문서 표시명
  section?: string;         // 챕터·조항
  text: string;
  embedding: number[];
};

export type RagSearchHit = {
  id: string;
  domain: RagDomain;
  source: string;
  title: string;
  section?: string;
  text: string;
  score: number;
};

export type RagIndex = {
  model: string;
  dim: number;
  builtAt: string;
  entries: RagIndexEntry[];
};

let cached: RagIndex | null = null;
let cacheError: string | null = null;

export async function loadRagIndex(): Promise<RagIndex | null> {
  if (cached) return cached;
  if (cacheError) return null;
  try {
    const indexPath = path.join(process.cwd(), "data", "rag-index.json");
    const raw = await readFile(indexPath, "utf-8");
    cached = JSON.parse(raw) as RagIndex;
    return cached;
  } catch (error) {
    cacheError = error instanceof Error ? error.message : "load failed";
    console.warn(`[rag/search] index 로드 실패: ${cacheError}`);
    return null;
  }
}

/**
 * 텍스트 쿼리로 RAG 인덱스에서 top-k 청크 검색.
 *
 * @param query     검색어 (자연어)
 * @param topK      반환 개수
 * @param domains   특정 도메인만 필터링 (옵션)
 * @param minScore  최소 cosine 유사도 (기본 0.3)
 */
export async function searchRag(args: {
  query: string;
  topK?: number;
  domains?: RagDomain[];
  minScore?: number;
}): Promise<RagSearchHit[]> {
  const topK = args.topK ?? 5;
  const minScore = args.minScore ?? 0.3;

  const index = await loadRagIndex();
  if (!index) return [];

  const queryEmbedding = await embedQuery(args.query);
  if (!queryEmbedding) return [];

  const filtered = args.domains
    ? index.entries.filter((e) => args.domains!.includes(e.domain))
    : index.entries;

  const scored = filtered.map((entry) => ({
    ...entry,
    score: cosineSimilarity(queryEmbedding, entry.embedding)
  }));

  return scored
    .filter((s) => s.score >= minScore)
    .sort((a, b) => b.score - a.score)
    .slice(0, topK)
    .map<RagSearchHit>((s) => ({
      id: s.id,
      domain: s.domain,
      source: s.source,
      title: s.title,
      section: s.section,
      text: s.text,
      score: s.score
    }));
}

export function describeIndex(): { ok: boolean; size: number; builtAt?: string } {
  if (!cached) return { ok: false, size: 0 };
  return { ok: true, size: cached.entries.length, builtAt: cached.builtAt };
}
