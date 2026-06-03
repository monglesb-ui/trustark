import type { AnalyzeRequest, AnalyzeResponse } from "./types";

const ANALYZE_API_PATH = "/api/analyze";
const REGISTRY_API_PATH = "/api/registry";

export async function analyzeContract(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  const response = await fetch(ANALYZE_API_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify(payload)
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "분석 요청에 실패했습니다.");
  }

  return response.json();
}

export async function runRegistryLookup(payload: AnalyzeRequest, report: AnalyzeResponse): Promise<AnalyzeResponse> {
  const response = await fetch(REGISTRY_API_PATH, {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ payload, report })
  });

  if (!response.ok) {
    const message = await response.text();
    throw new Error(message || "등기부등본 열람 실행에 실패했습니다.");
  }

  return response.json();
}
