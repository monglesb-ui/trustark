import type { AnalyzeRequest, AnalyzeResponse } from "./types";
import { buildMockAnalysis } from "./mock-analysis";
import { publicEnv } from "./public-env";

const API_BASE_URL = publicEnv.trustArkApiBaseUrl;
const LOCAL_API_BASE_URL = "http://127.0.0.1:8000";
const INTERNAL_API_PATH = "/api/analyze";

function shouldUseLocalApi() {
  if (API_BASE_URL) return false;
  if (typeof window === "undefined") return true;
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
    if (API_BASE_URL) {
      throw error;
    }

    return buildMockAnalysis(payload);
  }
}
