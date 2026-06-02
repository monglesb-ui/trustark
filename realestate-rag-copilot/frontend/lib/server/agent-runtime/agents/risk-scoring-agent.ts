import { getPropertyTypeGroup } from "@/lib/property-types";
import type { AnalyzeRequest, AnalyzeResponse } from "@/lib/types";
import type { TraceRecorder } from "../trace";

const RISK_SCORING_AGENT = "Risk Scoring Agent" as const;

export const riskScoringAgentAllowedTools = ["scoreRisk", "applyConservativeRiskFloor"] as const;

type RiskScoringTool = (typeof riskScoringAgentAllowedTools)[number];

function assertAllowedTool(tool: string): asserts tool is RiskScoringTool {
  if (!riskScoringAgentAllowedTools.includes(tool as RiskScoringTool)) {
    throw new Error(`${RISK_SCORING_AGENT} cannot call tool: ${tool}`);
  }
}

function levelFor(score: number) {
  if (score >= 75) return "위험 · HIGH";
  if (score >= 60) return "검토 필요";
  return "현재 표본 기준 낮음";
}

function unique(items: string[]) {
  return [...new Set(items)];
}

function applyConservativeRiskFloor(report: AnalyzeResponse, payload: AnalyzeRequest) {
  const group = getPropertyTypeGroup(payload.property_type);
  const sampleSize = report.market_comparison.sample_size;
  const hasSalePrice = Boolean(report.market_comparison.nearby_avg_sale_price || report.market_comparison.input_sale_price);
  const unverifiedText = report.sections.unverified_items.join(" ");
  const hasRightsGap = /등기|권리|선순위|보증보험/.test(unverifiedText);
  const sparseMarket = sampleSize < 5;
  const jeonseRatio = report.market_comparison.jeonse_ratio;
  const nonApartment = group !== "apartment";
  const reasons: string[] = [];
  let floor = 0;

  if (nonApartment && sparseMarket) {
    floor = Math.max(floor, 60);
    reasons.push("비아파트 유형은 표본이 적으면 시세 신뢰도가 낮아 최소 검토 필요로 봅니다.");
  }

  if (!hasSalePrice && payload.contract_type === "jeonse") {
    floor = Math.max(floor, 60);
    reasons.push("매매 실거래가 또는 입력 매매가가 없어 전세가율을 확정하지 못했습니다.");
  }

  if (hasRightsGap) {
    floor = Math.max(floor, 60);
    reasons.push("등기부등본, 선순위 권리, 보증보험 항목이 아직 확인되지 않았습니다.");
  }

  if (group === "multifamily" && payload.contract_type === "jeonse") {
    floor = Math.max(floor, 68);
    reasons.push("다가구주택 전세는 선순위 임차인과 총 보증금 확인 전까지 보수적으로 판단합니다.");
  }

  if (reasons.length === 0 || report.risk_score >= floor) {
    return { report, reasons, adjusted: false };
  }

  const adjustedScore = Math.max(report.risk_score, floor);

  return {
    adjusted: true,
    reasons,
    report: {
      ...report,
      risk_score: adjustedScore,
      risk_level: levelFor(adjustedScore),
      summary:
        adjustedScore >= 60
          ? jeonseRatio !== null && jeonseRatio !== undefined
            ? `실거래 매매 표본 기준 전세가율은 ${jeonseRatio}%입니다. 가격 기준 위험은 ${jeonseRatio >= 70 ? "추가 검토가 필요" : "높지 않"}지만, 등기부등본·선순위 권리·보증보험 가능 여부는 아직 확인 전입니다.`
            : "현재 표본만으로 안전하다고 단정하기 어렵습니다. 실제 매매가, 등기부등본, 선순위 권리, 보증보험 가능 여부를 추가 확인해 주세요."
          : report.summary,
      risk_signals: [
        {
          severity: "확인 필요",
          title: "데이터 불확실성에 따른 보수적 위험 보정",
          metric: `표본 ${sampleSize}건 · 매매가 ${hasSalePrice ? "확인" : "미확인"}`,
          description: reasons.join(" "),
          source: "risk_rule:conservative_data_quality_floor"
        },
        ...(report.risk_signals ?? [])
      ],
      sections: {
        ...report.sections,
        assumptions: unique(["표본 부족과 미확인 권리관계는 위험 점수 하한선에 반영했습니다.", ...report.sections.assumptions]),
        unverified_items: unique([...reasons, ...report.sections.unverified_items])
      }
    } satisfies AnalyzeResponse
  };
}

export function runRiskScoringAgent({
  report,
  payload,
  trace
}: {
  report: AnalyzeResponse;
  payload: AnalyzeRequest;
  trace: TraceRecorder;
}) {
  const scoreTool = "scoreRisk";
  assertAllowedTool(scoreTool);
  trace.record(
    RISK_SCORING_AGENT,
    scoreTool,
    `deposit=${payload.deposit.toLocaleString("ko-KR")} · property=${payload.property_type}`,
    `risk=${report.risk_score} · level=${report.risk_level} · jeonseRatio=${report.market_comparison.jeonse_ratio ?? "n/a"}`
  );

  const floorTool = "applyConservativeRiskFloor";
  assertAllowedTool(floorTool);
  const result = applyConservativeRiskFloor(report, payload);
  trace.record(
    RISK_SCORING_AGENT,
    floorTool,
    `sample=${report.market_comparison.sample_size} · rights=${report.sections.unverified_items.length}`,
    result.adjusted ? `보수 보정 적용 · ${result.reasons.join(" ")}` : "보수 보정 불필요"
  );

  return result.report;
}
