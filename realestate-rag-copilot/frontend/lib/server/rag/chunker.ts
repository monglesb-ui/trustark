/**
 * Recursive character text splitter — LangChain-style 청킹.
 *
 * 한국어 법령·계약서·사례문에 맞춰 분할자 우선순위:
 *   ["\n\n", "\n", "다.", ".", " ", ""]
 *
 * 청크는 chunkSize 글자(한글 기준 ≈ 1.5토큰) 이하, overlap만큼 앞 청크와 겹침.
 */

export type Chunk = {
  text: string;
  index: number;        // 원문 내 순번
  charStart: number;
  charEnd: number;
};

const DEFAULT_SEPARATORS = ["\n\n", "\n", "다.", ".", " ", ""];

function splitWithSeparator(text: string, separator: string): string[] {
  if (!separator) return Array.from(text);
  return text.split(separator).flatMap((seg, idx, arr) => {
    if (idx === arr.length - 1) return [seg];
    return [seg + separator];
  });
}

function recursiveSplit(
  text: string,
  chunkSize: number,
  separators: string[]
): string[] {
  if (text.length <= chunkSize) return [text];
  const [sep, ...rest] = separators;
  const segments = splitWithSeparator(text, sep);
  const result: string[] = [];
  for (const seg of segments) {
    if (seg.length <= chunkSize) {
      result.push(seg);
    } else if (rest.length > 0) {
      result.push(...recursiveSplit(seg, chunkSize, rest));
    } else {
      // 더 이상 쪼갤 수 없으면 강제 분할
      for (let i = 0; i < seg.length; i += chunkSize) {
        result.push(seg.slice(i, i + chunkSize));
      }
    }
  }
  return result;
}

export function chunkText(
  text: string,
  { chunkSize = 512, overlap = 80 }: { chunkSize?: number; overlap?: number } = {}
): Chunk[] {
  const trimmed = text.trim();
  if (!trimmed) return [];

  const segments = recursiveSplit(trimmed, chunkSize, DEFAULT_SEPARATORS);

  const merged: string[] = [];
  let buffer = "";
  for (const seg of segments) {
    if (!seg.trim()) continue;
    if ((buffer + seg).length <= chunkSize) {
      buffer = buffer + seg;
    } else {
      if (buffer.trim()) merged.push(buffer);
      buffer = seg;
    }
  }
  if (buffer.trim()) merged.push(buffer);

  // overlap 적용 — 각 청크 앞에 이전 청크 마지막 overlap 글자 prepend
  const withOverlap: Chunk[] = [];
  let cursor = 0;
  for (let i = 0; i < merged.length; i += 1) {
    const prev = i > 0 ? merged[i - 1].slice(-overlap) : "";
    const text = (prev + merged[i]).trim();
    withOverlap.push({
      text,
      index: i,
      charStart: cursor,
      charEnd: cursor + merged[i].length
    });
    cursor += merged[i].length;
  }
  return withOverlap;
}
