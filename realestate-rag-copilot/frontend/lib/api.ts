import type { AnalyzeRequest, AnalyzeResponse } from "./types";
import { buildMockAnalysis } from "./mock-analysis";
import { publicEnv } from "./public-env";

const API_BASE_URL = publicEnv.trustArkApiBaseUrl;
const LOCAL_API_BASE_URL = "http://127.0.0.1:8000";
const INTERNAL_API_PATH = "/api/analyze";
const REGISTRY_API_PATH = "/api/registry";

function shouldUseLocalApi() {
  if (API_BASE_URL) return false;
  if (typeof window === "undefined") return true;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

function shouldUseClientMockFallback() {
  if (API_BASE_URL) return false;
  if (typeof window === "undefined") return false;
  return ["localhost", "127.0.0.1"].includes(window.location.hostname);
}

export async function analyzeContract(payload: AnalyzeRequest): Promise<AnalyzeResponse> {
  const baseUrl = API_BASE_URL ?? (shouldUseLocalApi() ? LOCAL_API_BASE_URL : null);
  const endpoint = baseUrl ? `${baseUrl}/analyze` : INTERNAL_API_PATH;

  try {
    const response = await fetch(endpoint, {
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
  } catch (error) {
    if (!shouldUseClientMockFallback()) {
      throw error;
    }

    return buildMockAnalysis(payload);
  }
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
