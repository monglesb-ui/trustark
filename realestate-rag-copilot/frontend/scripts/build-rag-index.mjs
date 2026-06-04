#!/usr/bin/env node
/**
 * RAG 인덱스 빌드 스크립트.
 *
 * 사용:
 *   OPENAI_API_KEY=sk-... node scripts/build-rag-index.mjs
 *
 * 1) data/rag-sources/*.md 읽음.
 * 2) Frontmatter (--- domain: ... title: ... ---) 파싱.
 * 3) 본문을 512자 청크 + 80자 overlap.
 * 4) OpenAI text-embedding-3-small로 임베딩.
 * 5) data/rag-index.json 저장.
 */
import { readFile, readdir, writeFile, mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import OpenAI from "openai";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SOURCES_DIR = path.join(__dirname, "..", "data", "rag-sources");
const INDEX_PATH = path.join(__dirname, "..", "data", "rag-index.json");
const EMBEDDING_MODEL = "text-embedding-3-small";
const CHUNK_SIZE = 512;
const OVERLAP = 80;
const BATCH_SIZE = 100;

const apiKey = process.env.OPENAI_API_KEY;
if (!apiKey) {
  console.error("OPENAI_API_KEY 환경변수가 필요합니다.");
  process.exit(1);
}
const client = new OpenAI({ apiKey });

function parseFrontmatter(raw) {
  const match = raw.match(/^---\s*\n([\s\S]*?)\n---\s*\n([\s\S]*)$/);
  if (!match) return { meta: {}, body: raw };
  const meta = {};
  for (const line of match[1].split("\n")) {
    const m = line.match(/^(\w+):\s*(.+)$/);
    if (m) meta[m[1].trim()] = m[2].trim();
  }
  return { meta, body: match[2] };
}

function chunkText(text, { chunkSize = CHUNK_SIZE, overlap = OVERLAP } = {}) {
  const trimmed = text.trim();
  if (!trimmed) return [];
  const separators = ["\n\n", "\n", "다.", ".", " ", ""];

  function recursiveSplit(s, seps) {
    if (s.length <= chunkSize) return [s];
    const [sep, ...rest] = seps;
    if (sep === "" || rest.length === 0) {
      const out = [];
      for (let i = 0; i < s.length; i += chunkSize) out.push(s.slice(i, i + chunkSize));
      return out;
    }
    const parts = s.split(sep).flatMap((seg, idx, arr) =>
      idx === arr.length - 1 ? [seg] : [seg + sep]
    );
    return parts.flatMap((p) => (p.length <= chunkSize ? [p] : recursiveSplit(p, rest)));
  }

  const segments = recursiveSplit(trimmed, separators);
  const merged = [];
  let buffer = "";
  for (const seg of segments) {
    if (!seg.trim()) continue;
    if ((buffer + seg).length <= chunkSize) buffer += seg;
    else {
      if (buffer.trim()) merged.push(buffer);
      buffer = seg;
    }
  }
  if (buffer.trim()) merged.push(buffer);

  return merged.map((m, i) => {
    const prev = i > 0 ? merged[i - 1].slice(-overlap) : "";
    return (prev + m).trim();
  });
}

async function embedBatch(texts) {
  const response = await client.embeddings.create({
    model: EMBEDDING_MODEL,
    input: texts
  });
  return response.data.map((d) => d.embedding);
}

async function main() {
  console.log(`[build-rag-index] sources: ${SOURCES_DIR}`);
  let files;
  try {
    files = (await readdir(SOURCES_DIR)).filter((f) => f.endsWith(".md"));
  } catch (e) {
    console.error(`소스 폴더를 못 찾았습니다: ${SOURCES_DIR}`);
    process.exit(1);
  }
  console.log(`[build-rag-index] files: ${files.join(", ")}`);

  const allChunks = [];
  for (const file of files) {
    const raw = await readFile(path.join(SOURCES_DIR, file), "utf-8");
    const { meta, body } = parseFrontmatter(raw);
    const domain = meta.domain ?? "case";
    const title = meta.title ?? file;
    const chunks = chunkText(body);
    console.log(`  · ${file} → ${chunks.length} chunks (domain=${domain})`);

    chunks.forEach((text, idx) => {
      allChunks.push({
        id: `${path.basename(file, ".md")}#${idx}`,
        domain,
        source: `rag-sources/${file}`,
        title,
        section: null,
        text
      });
    });
  }

  console.log(`\n[build-rag-index] total chunks: ${allChunks.length}`);
  console.log("[build-rag-index] embedding...");

  for (let i = 0; i < allChunks.length; i += BATCH_SIZE) {
    const batch = allChunks.slice(i, i + BATCH_SIZE);
    const embeddings = await embedBatch(batch.map((c) => c.text));
    batch.forEach((chunk, idx) => {
      chunk.embedding = embeddings[idx];
    });
    console.log(`  embedded ${i + batch.length} / ${allChunks.length}`);
  }

  await mkdir(path.dirname(INDEX_PATH), { recursive: true });
  await writeFile(
    INDEX_PATH,
    JSON.stringify(
      {
        model: EMBEDDING_MODEL,
        dim: allChunks[0]?.embedding?.length ?? 0,
        builtAt: new Date().toISOString(),
        entries: allChunks
      },
      null,
      2
    ),
    "utf-8"
  );
  console.log(`[build-rag-index] saved → ${INDEX_PATH}`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
