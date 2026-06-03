import "server-only";
import OpenAI from "openai";

let cached: { key: string; client: OpenAI } | null = null;

export function getOpenAIClient(): OpenAI | null {
  const key = process.env.OPENAI_API_KEY;
  if (!key) return null;
  if (cached && cached.key === key) return cached.client;
  const client = new OpenAI({ apiKey: key });
  cached = { key, client };
  return client;
}
