"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Download,
  FileBadge,
  FileKey2,
  FileText,
  Gauge,
  LayoutDashboard,
  ListChecks,
  NotebookTabs,
  Scale,
  ShieldAlert,
  XCircle,
  TrendingUp
} from "lucide-react";
import { useMemo, useState } from "react";
import { getPropertyTypeLabel } from "@/lib/property-types";
import { runRegistryLookup } from "@/lib/api";
import type { AgentTrace, AnalyzeRequest, AnalyzeResponse, DataSourceStatus, ScoreAdjustmentCategory } from "@/lib/types";
import { EvidenceList } from "./EvidenceList";
import { MapView } from "./MapView";

const formatter = new Intl.NumberFormat("ko-KR");

function money(value?: number | null) {
  if (!value) return "-";
  return `${formatter.format(value)}원`;
}

function dealMonth(value?: string | null) {
  if (!value || value.length !== 6) return "-";
  return `${value.slice(0, 4)}.${value.slice(4, 6)}`;
}

function yesNoUnknown(value?: boolean | null) {
  if (value === true) return "표시 있음";
  if (value === false) return "표시 없음";
  return "미확인";
}

function countLabel(value?: number | null, unit = "") {
  if (value === undefined || value === null) return "-";
  return `${formatter.format(value)}${unit}`;
}

const BREAKDOWN_BASE_COLOR = "bg-ink/75";

function adjustmentColor(category: ScoreAdjustmentCategory) {
  switch (category) {
    case "data_quality":
      return "bg-amber-400";
    case "rights":
      return "bg-rose-400";
    case "property_type":
      return "bg-sky-400";
    case "market":
      return "bg-ink/55";
    default:
      return "bg-stone-400";
  }
}

function adjustmentLabel(category: ScoreAdjustmentCategory) {
  switch (category) {
    case "data_quality":
      return "데이터 품질 보정";
    case "rights":
      return "권리관계 미확인 보정";
    case "property_type":
      return "주택유형 보정";
    case "market":
      return "시세 보정";
    default:
      return "기타 보정";
  }
}

function ScoreBreakdownPanel({ breakdown }: { breakdown: AnalyzeResponse["score_breakdown"] }) {
  if (!breakdown) return null;
  const total = Math.max(breakdown.final_score, 1);
  const baseWidth = (breakdown.base_score / 100) * 100;
  return (
    <div className="mt-5 rounded-md border border-ink/10 bg-white/70 p-4">
      <p className="text-[0.7rem] font-black uppercase tracking-[0.16em] text-ink/45">점수 분해</p>
      <div className="mt-3 flex h-3 w-full overflow-hidden rounded-full bg-ink/10">
        <div className={`h-full ${BREAKDOWN_BASE_COLOR}`} style={{ width: `${baseWidth}%` }} />
        {breakdown.adjustments.map((adj, index) => (
          <div
            key={`${adj.category}-${index}`}
            className={`h-full ${adjustmentColor(adj.category)}`}
            style={{ width: `${(adj.delta / 100) * 100}%` }}
          />
        ))}
      </div>
      <ul className="mt-3 space-y-1.5 text-xs text-ink/75">
        <li className="flex items-start gap-2">
          <span className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${BREAKDOWN_BASE_COLOR}`} />
          <span>
            <strong className="text-ink">{breakdown.base_score}점</strong> · {breakdown.base_reason}
          </span>
        </li>
        {breakdown.adjustments.map((adj, index) => (
          <li key={`${adj.category}-${index}-row`} className="flex items-start gap-2">
            <span className={`mt-1 inline-block h-2.5 w-2.5 shrink-0 rounded-sm ${adjustmentColor(adj.category)}`} />
            <span>
              <strong className="text-ink">+{adj.delta}점</strong> · {adjustmentLabel(adj.category)} · {adj.reason}
            </span>
          </li>
        ))}
        <li className="flex items-center justify-between border-t border-ink/10 pt-2 text-ink">
          <span className="font-black">최종</span>
          <span className="font-black tabular-nums">{breakdown.final_score}점 / 100</span>
        </li>
      </ul>
      <p className="mt-3 text-[0.7rem] text-ink/55">
        ※ 시세 위험과 데이터 품질 보정을 분리해 표시합니다. 데이터 품질 보정은 등기·권리·보증보험이 확인되지 않았을 때
        보수적으로 가산되는 점수이며, 추가 확인이 완료되면 낮아질 수 있습니다.
      </p>
    </div>
  );
}

function marketScopeLabel(report: AnalyzeResponse) {
  if (report.market_comparison.match_mode === "complex") {
    return report.market_comparison.complex_name ? `${report.market_comparison.complex_name} 단지 기준` : "입력 단지 기준";
  }
  if (report.market_comparison.match_mode === "regional") return "단지 매칭 없음 · 지역 참고";
  return "대체 표본";
}

function sourceLabel(source: string) {
  if (source.startsWith("rag_docs")) return "RAG 문서";
  if (source.startsWith("naver-search")) return "네이버 검색";
  if (source.startsWith("data.go.kr")) return "공공데이터 API";
  if (source.startsWith("codef")) return "CODEF API";
  if (source.startsWith("risk_rule")) return "규칙 엔진";
  if (source.includes("mock")) return "대체 표본";
  return source;
}

function dataMode(statuses: DataSourceStatus[] | undefined) {
  const items = statuses ?? [];
  if (items.length === 0) return "Fallback 분석";
  const successCount = items.filter((item) => item.status === "success").length;
  const fallbackCount = items.filter((item) => item.status !== "success").length;
  if (successCount > 0 && fallbackCount > 0) return "Hybrid 분석";
  if (successCount > 0) return "API 분석";
  return "Fallback 분석";
}

function todayLabel() {
  return new Intl.DateTimeFormat("ko-KR", { dateStyle: "medium" }).format(new Date());
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function makeReportHtml(report: AnalyzeResponse) {
  const riskSignals = report.risk_signals ?? [];
  const dataStatusItems = (report.data_statuses ?? [])
    .map((item) => `<li><strong>${escapeHtml(item.label)}</strong>: ${escapeHtml(item.status)} · ${escapeHtml(item.detail)}</li>`)
    .join("");
  const signalItems = riskSignals
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.description)}</p>
          <small>${escapeHtml(item.severity)} · ${escapeHtml(item.metric)} · ${escapeHtml(sourceLabel(item.source))}</small>
        </li>`
    )
    .join("");
  const evidenceItems = report.evidence
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.description)}</p>
          <small>출처: ${escapeHtml(sourceLabel(item.source))} · ${escapeHtml(item.source)}</small>
        </li>`
    )
    .join("");
  const actionItems = report.next_actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const warningItems = report.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const confirmedItems = report.sections.confirmed_facts.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const unverifiedItems = report.sections.unverified_items.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const registryItems = report.registry
    ? `
      <h2>등기부등본 요약</h2>
      <dl class="grid">
        <div><dt>상태</dt><dd>${escapeHtml(report.registry.status === "confirmed" ? "권리관계 요약 확인" : "권리관계 미확인")}</dd></div>
        <div><dt>소유자</dt><dd>${escapeHtml(report.registry.ownerMasked ?? "마스킹/미확인")}</dd></div>
        <div><dt>근저당</dt><dd>${escapeHtml(String(report.registry.mortgageCount ?? "-"))}건</dd></div>
        <div><dt>압류/가압류</dt><dd>${escapeHtml(String(report.registry.attachmentCount ?? "-"))}건</dd></div>
        <div><dt>신탁</dt><dd>${report.registry.trustRegistered ? "후보 있음" : "후보 없음/미확인"}</dd></div>
        <div><dt>민감정보</dt><dd>마스킹 적용</dd></div>
      </dl>
      <p class="notice">${escapeHtml(report.registry.note)}</p>`
    : "";

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>Trust Ark 계약 리스크 리포트</title>
  <style>
    body { margin: 0; padding: 48px; font-family: "Noto Sans KR", system-ui, sans-serif; color: #222019; background: #f5f2ea; }
    main { max-width: 900px; margin: 0 auto; background: white; border: 1px solid #e7e2d6; padding: 48px; }
    .kicker { color: #2f6b4d; font-size: 12px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
    h1 { font-family: Georgia, "Noto Serif KR", serif; font-size: 34px; margin: 12px 0 8px; }
    h2 { margin-top: 34px; border-top: 1px solid #e7e2d6; padding-top: 22px; font-size: 20px; }
    .summary { background: #f4e4e1; border: 1px solid #e7c8c2; padding: 22px; border-radius: 10px; }
    .score { font-size: 42px; font-weight: 900; color: #a8453a; }
    .meta { color: #817c6f; font-size: 13px; }
    .grid { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
    dt { color: #817c6f; font-size: 12px; }
    dd { margin: 4px 0 0; font-weight: 800; }
    li { margin: 12px 0; line-height: 1.65; }
    small { color: #817c6f; }
    .notice { color: #7d5e22; background: #f3eada; border: 1px solid #e4d6b3; padding: 14px; border-radius: 10px; }
  </style>
</head>
<body>
  <main>
    <div class="kicker">Trust Ark · 부동산 계약 리스크 코파일럿</div>
    <h1>전세 계약 사전 위험 검토 리포트</h1>
    <p class="meta">${escapeHtml(report.location.address)} · 생성일 ${todayLabel()} · ${escapeHtml(dataMode(report.data_statuses))}</p>
    <section class="summary">
      <strong>종합 위험도: ${escapeHtml(report.risk_level)}</strong>
      <div class="score">${report.risk_score}</div>
      <p>${escapeHtml(report.summary)}</p>
    </section>
    <h2>입력 단지 실거래가</h2>
    <dl class="grid">
      <div><dt>조회 기준</dt><dd>${escapeHtml(marketScopeLabel(report))}</dd></div>
      <div><dt>입력 보증금</dt><dd>${money(report.market_comparison.input_deposit)}</dd></div>
      <div><dt>최근 전월세 보증금</dt><dd>${money(report.market_comparison.latest_rent_deposit)}</dd></div>
      <div><dt>최근 매매 실거래가</dt><dd>${money(report.market_comparison.latest_sale_price)}</dd></div>
      <div><dt>전월세 평균 보증금</dt><dd>${money(report.market_comparison.nearby_avg_deposit)}</dd></div>
      <div><dt>매매 평균 실거래가</dt><dd>${money(report.market_comparison.nearby_avg_sale_price)}</dd></div>
      <div><dt>전세가율</dt><dd>${report.market_comparison.jeonse_ratio ?? "-"}%</dd></div>
      <div><dt>표본 수</dt><dd>전월세 ${report.market_comparison.rent_sample_size ?? report.market_comparison.sample_size}건 · 매매 ${report.market_comparison.sale_sample_size ?? 0}건</dd></div>
    </dl>
    <h2>데이터 조회 상태</h2>
    <ul>${dataStatusItems}</ul>
    ${registryItems}
    <h2>핵심 위험 신호</h2>
    <ul>${signalItems || evidenceItems}</ul>
    <h2>핵심 근거</h2>
    <ul>${evidenceItems}</ul>
    <h2>확인/미확인 항목</h2>
    <div class="grid">
      <div><strong>확인된 사실</strong><ul>${confirmedItems}</ul></div>
      <div><strong>미확인 항목</strong><ul>${unverifiedItems}</ul></div>
    </div>
    <h2>다음 확인 액션</h2>
    <ol>${actionItems}</ol>
    <h2>주의 문구</h2>
    <div class="notice"><ul>${warningItems}</ul></div>
  </main>
</body>
</html>`;
}

function downloadDocumentReport(report: AnalyzeResponse) {
  const html = makeReportHtml(report);
  const blob = new Blob([html], { type: "text/html;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `trust-ark-report-${new Date().toISOString().slice(0, 10)}.html`;
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

function SectionTitle({ number, title, description }: { number: string; title: string; description?: string }) {
  return (
    <div className="mb-4 flex flex-wrap items-baseline gap-3">
      <span className="font-serif text-sm font-black text-moss">{number}</span>
      <h2 className="text-lg font-black text-ink">{title}</h2>
      {description ? <span className="ml-auto text-xs font-bold text-ink/50">{description}</span> : null}
    </div>
  );
}

function SeverityPill({ severity }: { severity: string }) {
  const className = severity.includes("높음")
    ? "bg-clay/10 text-clay"
    : severity.includes("낮음")
      ? "bg-moss/10 text-moss"
      : "bg-brass/10 text-brass";

  return <span className={`rounded-md px-2.5 py-1 text-xs font-black ${className}`}>{severity}</span>;
}

function statusById(report: AnalyzeResponse, id: string) {
  return report.data_statuses?.find((item) => item.id === id);
}

function statusText(status?: DataSourceStatus) {
  if (!status) return "상태 정보 없음";
  const label = {
    success: "성공",
    fallback: "대체 표본",
    missing: "표본 없음",
    failed: "실패"
  }[status.status];
  return `${label} · ${status.detail}`;
}

function DataStatusStrip({ report, framed = true }: { report: AnalyzeResponse; framed?: boolean }) {
  const statuses = report.data_statuses ?? [];
  if (statuses.length === 0) return null;

  const tone = {
    success: "border-moss/25 bg-moss/10 text-moss",
    fallback: "border-brass/30 bg-brass/10 text-brass",
    missing: "border-ink/10 bg-paper text-ink/60",
    failed: "border-clay/30 bg-clay/10 text-clay"
  } as const;
  const icons = {
    success: CheckCircle2,
    fallback: CircleDashed,
    missing: CircleDashed,
    failed: XCircle
  };

  const content = (
    <>
      <div className="mb-3 flex items-center justify-between gap-3">
        <h2 className="text-sm font-black text-ink">데이터 조회 상태</h2>
        <span className="text-xs font-bold text-ink/45">API/fallback trace</span>
      </div>
      <div className="grid gap-2 md:grid-cols-4">
        {statuses.map((item) => {
          const Icon = icons[item.status];
          return (
            <div key={item.id} className={`min-w-0 rounded-md border px-3 py-3 ${tone[item.status]}`}>
              <div className="mb-1 flex items-center gap-2">
                <Icon aria-hidden="true" size={15} className="shrink-0" />
                <strong className="min-w-0 text-xs">{item.label}</strong>
              </div>
              <p className="break-words text-xs leading-5 text-ink/65">{item.detail}</p>
            </div>
          );
        })}
      </div>
    </>
  );

  if (!framed) return <div>{content}</div>;

  return <section className="dashboard-panel p-4">{content}</section>;
}

type AgentReport = {
  name: string;
  status: string;
  purpose: string;
  judgment: string;
  evidence: string[];
  confidence: "높음" | "중간" | "낮음";
  whyItMatters: string;
  nextCheck: string[];
  traces: AgentTrace[];
};

function tracesForAgent(report: AnalyzeResponse, agentName: string) {
  return (report.agent_traces ?? []).filter((trace) => trace.agent === agentName);
}

function traceStatusLabel(status: AgentTrace["status"]) {
  return {
    success: "success",
    fallback: "fallback",
    missing: "missing",
    failed: "failed"
  }[status];
}

function buildAgentReports(report: AnalyzeResponse, ragEvidenceCount: number): AgentReport[] {
  const inputDeposit = money(report.market_comparison.input_deposit);
  const nearbyDeposit = money(report.market_comparison.nearby_avg_deposit);
  const geocodingStatus = statusById(report, "geocoding");
  const legalDongStatus = statusById(report, "legal-dong");
  const rentStatus = statusById(report, "rent-market");
  const saleStatus = statusById(report, "sale-market");
  const searchStatus = statusById(report, "search-context");
  const buildingStatus = statusById(report, "building-register");
  const registryStatus = statusById(report, "registry");
  const marketConfidence = rentStatus?.status === "success" && saleStatus?.status === "success" ? "높음" : "중간";
  const locationConfidence = geocodingStatus?.status === "success" ? "높음" : "낮음";
  const searchConfidence = searchStatus?.status === "success" ? "중간" : "낮음";
  const buildingConfidence = buildingStatus?.status === "success" ? "중간" : "낮음";
  const registryConfidence = registryStatus?.status === "success" ? "중간" : "낮음";

  return [
    {
      name: "Market Data Agent",
      status: "완료",
      purpose: "입력된 단지의 전월세·매매 실거래가를 우선 조회하고, 없을 때만 지역 참고 표본으로 시세 근거를 만들었습니다.",
      judgment:
        report.market_comparison.jeonse_ratio && report.market_comparison.jeonse_ratio >= 80
          ? "입력 보증금이 매매 실거래가 대비 높은 전세가율 구간에 있어 가격 리스크를 우선 확인해야 합니다."
          : "입력 보증금은 현재 실거래 표본과 비교해 추가 검토가 필요한 가격 구간입니다.",
      evidence: [
        `전월세 실거래가: ${statusText(rentStatus)}`,
        `매매 실거래가: ${statusText(saleStatus)}`,
        `입력 보증금은 ${inputDeposit}입니다.`,
        `실거래 기준은 ${marketScopeLabel(report)}입니다.`,
        `전월세 평균 보증금은 ${nearbyDeposit}입니다.`,
        `차이율은 ${report.market_comparison.difference_rate}%이고 표본 수는 ${report.market_comparison.sample_size}건입니다.`
      ],
      confidence: marketConfidence,
      whyItMatters: "전세 계약에서는 보증금이 매매가에 가까워질수록 보증금 회수 여력이 낮아질 수 있어 가격 검토가 가장 먼저 필요합니다.",
      nextCheck: ["동일 단지·동일 면적·최근 거래인지 확인", "등기부등본상 근저당권과 입력 보증금을 함께 비교", "전세보증금 반환보증 가능 여부 확인"],
      traces: tracesForAgent(report, "Market Data Agent")
    },
    {
      name: "RAG Evidence Agent",
      status: "완료",
      purpose: "전세 계약 전 확인해야 할 체크리스트 근거를 검색해 리포트 문장의 출처를 보강했습니다.",
      judgment: "가격만으로 계약 안전성을 단정할 수 없으므로 등기부등본, 선순위 권리, 보증보험 가능 여부를 별도 확인해야 합니다.",
      evidence: [
        `RAG 근거 ${ragEvidenceCount || report.evidence.length}건을 리포트에 연결했습니다.`,
        "실제 등기부등본 원문은 제공되지 않아 미확인 항목으로 유지했습니다.",
        "보증보험 가입 가능 여부도 현재 데이터에서는 확정하지 않았습니다."
      ],
      confidence: "중간",
      whyItMatters: "전세 사고는 가격보다 권리관계에서 발생하는 경우가 많아, 체크리스트 기반 미확인 항목을 남겨두는 것이 중요합니다.",
      nextCheck: ["계약 전 등기부등본 갑구·을구 확인", "선순위 임차인과 확정일자 현황 확인", "보증보험 가입 가능 조건 확인"],
      traces: tracesForAgent(report, "RAG Evidence Agent")
    },
    {
      name: "Search Context Agent",
      status: "완료",
      purpose: "네이버 검색 API로 대상 주소와 단지 주변의 공개 웹·뉴스 맥락을 수집해 공식 실거래가와 분리된 참고 근거로 붙였습니다.",
      judgment: searchStatus?.status === "success" ? "외부 검색 후보를 확보했지만 공식 가격 근거가 아니므로 참고 맥락으로만 사용해야 합니다." : "외부 검색 맥락이 충분히 확보되지 않아 공식 API와 RAG 체크리스트 중심으로 판단해야 합니다.",
      evidence: [
        `외부 검색 맥락: ${statusText(searchStatus)}`,
        `검색 tool trace는 ${tracesForAgent(report, "Search Context Agent").length}건입니다.`,
        "네이버 검색 결과는 실거래가를 대체하지 않고 최신 이슈·외부 문서 후보를 찾는 데 사용됩니다."
      ],
      confidence: searchConfidence,
      whyItMatters: "공식 API에 없는 단지 이슈, 지역 이슈, 최근 뉴스 후보를 빠르게 발견할 수 있지만 원문 확인 전에는 사실로 확정하면 안 됩니다.",
      nextCheck: ["검색 결과 원문 열람", "단지명·주소가 정확히 일치하는 문서만 채택", "가격 정보는 실거래가 API와 별도 비교"],
      traces: tracesForAgent(report, "Search Context Agent")
    },
    {
      name: "Location Context Agent",
      status: "완료",
      purpose: "대상 주소와 주변 거래 표본의 위치 맥락을 구성해 비교 표본이 어디에 놓이는지 보여줬습니다.",
      judgment: geocodingStatus?.status === "success" ? "대상 주소 좌표를 확보해 주변 표본과 위치 비교가 가능합니다." : "주소 좌표 신뢰도가 낮아 지도와 주변 표본 해석에 주의가 필요합니다.",
      evidence: [
        `지도 지오코딩: ${statusText(geocodingStatus)}`,
        `법정동코드: ${statusText(legalDongStatus)}`,
        `대상 좌표는 ${report.location.lat.toFixed(4)}, ${report.location.lng.toFixed(4)}입니다.`,
        `지도 marker는 총 ${report.markers.length}개입니다.`,
        geocodingStatus?.status === "success"
          ? "대상 좌표는 지도 지오코딩 결과를 사용했습니다."
          : "대상 좌표는 대체 좌표를 사용했으므로 정확한 위치로 단정하지 않습니다."
      ],
      confidence: locationConfidence,
      whyItMatters: "같은 법정동 안에서도 역세권, 학교, 도로, 단지 위치에 따라 가격 표본의 의미가 달라질 수 있습니다.",
      nextCheck: ["지도상 대상 위치와 실제 주소 일치 확인", "주변 표본이 동일 생활권인지 확인", "필요하면 반경·면적 기준으로 표본 재조회"],
      traces: tracesForAgent(report, "Location Context Agent")
    },
    {
      name: "Building Register Agent",
      status: "완료",
      purpose: "건축HUB 건축물대장 표제부를 조회해 주용도, 사용승인일, 위반건축물 여부를 계약 리스크 맥락에 반영했습니다.",
      judgment:
        buildingStatus?.status === "success"
          ? "건축물대장 기반 용도와 건물 기본 정보를 확보했습니다. 다만 전유부·호실별 상세 정보는 추가 확인이 필요합니다."
          : "건축물대장 표제부가 확보되지 않아 용도, 위반건축물, 사용승인일을 원문으로 확인해야 합니다.",
      evidence: [
        `건축물대장: ${statusText(buildingStatus)}`,
        "표제부 조회는 건물 기본 현황 확인용이며, 호실별 전유부·권리관계 확인을 대체하지 않습니다.",
        "오피스텔·상가주택·다가구는 용도와 전입 가능 여부를 별도로 확인해야 합니다."
      ],
      confidence: buildingConfidence,
      whyItMatters: "건축물대장의 용도와 위반건축물 여부는 보증보험, 전입신고, 대항력 판단에서 중요한 사전 확인 항목입니다.",
      nextCheck: ["건축물대장 원문에서 위반건축물 여부 확인", "전유부/호실 정보와 계약 대상 일치 여부 확인", "용도가 주거 사용과 충돌하지 않는지 확인"],
      traces: tracesForAgent(report, "Building Register Agent")
    },
    {
      name: "Registry Agent",
      status: "완료",
      purpose: "CODEF 등기부등본 API 연결 상태를 확인하고, 응답이 확보되면 권리관계 리스크 후보를 민감정보 마스킹 후 요약합니다.",
      judgment:
        report.registry?.status === "confirmed"
          ? "등기부등본 요약이 확보되었습니다. 소유자명과 등기번호 등 민감정보는 마스킹했고, 근저당·압류·신탁 후보만 위험 신호로 분리했습니다."
          : report.registry?.status === "requires_user_action"
            ? "등기부등본 열람은 수수료와 추가인증이 발생할 수 있어 자동 분석에서는 실행하지 않았습니다. 사용자가 별도로 실행해야 합니다."
            : "등기부등본 원문 권리관계가 아직 확정되지 않았습니다. CODEF 직접인증 입력값 또는 원문 등본 확인이 필요합니다.",
      evidence: [
        `등기부등본: ${statusText(registryStatus)}`,
        `근저당 후보: ${report.registry?.mortgageCount ?? "-"}건`,
        `압류/가압류 후보: ${report.registry?.attachmentCount ?? "-"}건`,
        `신탁 후보: ${report.registry?.trustRegistered === true ? "있음" : "없음/미확인"}`,
        "등본과 다른 서류의 소유자명, 등기번호, 인증값, 원문 식별자는 화면과 문서에서 마스킹합니다."
      ],
      confidence: registryConfidence,
      whyItMatters: "전세 사고의 핵심은 근저당, 선순위 권리, 압류, 신탁 등 권리관계에서 발생하므로 등기부등본 확인이 가격 분석보다 더 결정적인 경우가 많습니다.",
      nextCheck: ["수수료 발생 가능성 확인 후 별도 등기부등본 열람 실행", "갑구·을구 원문에서 말소되지 않은 권리 확인", "선순위 채권과 보증금 합산 후 회수 가능성 계산"],
      traces: tracesForAgent(report, "Registry Agent")
    },
    {
      name: "Risk Scoring Agent",
      status: "완료",
      purpose: "시세 차이, 표본 수, RAG 근거, 미확인 권리관계를 종합해 위험 점수와 위험 신호를 만들었습니다.",
      judgment: `${report.risk_level} 판정입니다. 이 점수는 계약 가능 여부가 아니라 추가 확인 필요도를 나타냅니다.`,
      evidence: [
        `위험 점수는 ${report.risk_score}점입니다.`,
        `위험도는 ${report.risk_level}입니다.`,
        `구조화된 위험 신호는 ${(report.risk_signals ?? []).length || 1}건입니다.`
      ],
      confidence: report.market_comparison.sample_size >= 10 ? "중간" : "낮음",
      whyItMatters: "위험 점수는 사용자가 어떤 항목부터 확인해야 하는지 우선순위를 잡기 위한 신호입니다.",
      nextCheck: report.next_actions.slice(0, 3),
      traces: tracesForAgent(report, "Risk Scoring Agent")
    },
    {
      name: "Report Agent",
      status: "완료",
      purpose: "각 Agent의 결과를 사용자에게 읽기 쉬운 종합 리포트와 문서형 리포트 구조로 조립했습니다.",
      judgment: "사용자에게 필요한 판단, 근거, 다음 행동을 대시보드형과 문서형 리포트로 정리했습니다.",
      evidence: ["대시보드형 리포트가 생성되었습니다.", "문서형 리포트 전환이 가능합니다.", "문서 다운로드용 HTML을 생성할 수 있습니다."],
      confidence: "중간",
      whyItMatters: "분석 결과는 한 번에 읽히는 요약과 저장 가능한 문서가 함께 있어야 실제 의사결정에 쓰일 수 있습니다.",
      nextCheck: ["문서형 리포트 다운로드", "미확인 항목을 계약 전 체크리스트로 사용", "전문가 검토 시 리포트 공유"],
      traces: tracesForAgent(report, "Report Agent")
    },
    {
      name: "Validation Agent",
      status: "완료",
      purpose: "최종 리포트가 계약 가능 여부를 단정하지 않도록 안전 문구와 미확인 항목을 검토했습니다.",
      judgment: "현재 결과는 참고 분석이며, 계약 안전 여부를 확정하지 않습니다.",
      evidence: [
        "계약 가능/안전 같은 단정 표현을 사용하지 않았습니다.",
        `주의 문구 ${report.warnings.length}건을 유지했습니다.`,
        `미확인 항목 ${report.sections.unverified_items.length}건을 별도 표시했습니다.`
      ],
      confidence: "높음",
      whyItMatters: "부동산 계약 리스크 분석은 법률·권리관계 확인을 대체할 수 없기 때문에 단정 표현을 막는 안전장치가 필요합니다.",
      nextCheck: ["등기부등본 원문 확인", "공인중개사·법률 전문가 검토", "보증보험 가입 가능 여부 최종 확인"],
      traces: tracesForAgent(report, "Validation Agent")
    }
  ];
}

function AgentReportPanel({ reports }: { reports: AgentReport[] }) {
  const [openAgent, setOpenAgent] = useState(reports[0]?.name ?? "");
  const [showTrace, setShowTrace] = useState(false);
  const selected = reports.find((item) => item.name === openAgent) ?? reports[0];
  const confidenceTone = {
    높음: "border-moss/25 bg-moss/10 text-moss",
    중간: "border-brass/35 bg-brass/10 text-brass",
    낮음: "border-clay/30 bg-clay/10 text-clay"
  } as const;

  return (
    <section className="dashboard-panel p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-moss">Trust Ark Agent Review Notes</p>
          <h2 className="mt-2 text-2xl font-black text-ink">Agent 검토 노트</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">
            각 Agent가 어떤 판단을 했고, 그 판단이 사용자에게 왜 중요한지와 다음 확인 항목을 정리했습니다.
          </p>
        </div>
        <span className="rounded-md border border-moss/20 bg-moss/10 px-3 py-2 text-xs font-black text-moss">
          {reports.reduce((sum, report) => sum + report.traces.length, 0)} real tool traces
        </span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[20rem_1fr]">
        <div className="grid content-start gap-2">
          {reports.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => {
                setOpenAgent(item.name);
                setShowTrace(false);
              }}
              className={`flex min-h-[4.25rem] items-center justify-between gap-3 rounded-md border px-4 py-3 text-left transition ${
                item.name === selected.name ? "border-moss/45 bg-moss/10 shadow-sm" : "border-ink/10 bg-white hover:bg-mint/30"
              }`}
            >
              <span>
                <strong className="block text-sm text-ink">{item.name}</strong>
                <span className="mt-1 block text-xs text-ink/55">{item.judgment}</span>
              </span>
              <span className="shrink-0 rounded-md bg-moss px-2 py-1 text-[0.68rem] font-black text-white">
                {item.traces.length > 0 ? `${item.traces.length} calls` : item.status}
              </span>
            </button>
          ))}
        </div>

        <article className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 pb-4">
            <div>
              <h3 className="text-xl font-black text-ink">{selected.name} 검토 노트</h3>
              <p className="mt-1 text-sm leading-6 text-ink/65">{selected.purpose}</p>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-md border px-2.5 py-1 text-xs font-black ${confidenceTone[selected.confidence]}`}>
                신뢰도 {selected.confidence}
              </span>
              <span className="rounded-md bg-ink px-2.5 py-1 text-xs font-bold text-white">{selected.status}</span>
            </div>
          </div>

          <div className="rounded-md border border-moss/25 bg-moss/10 p-4">
            <p className="text-xs font-black uppercase tracking-[0.12em] text-moss">Agent 판단</p>
            <p className="mt-2 text-lg font-black leading-7 text-ink">{selected.judgment}</p>
            <p className="mt-3 text-sm leading-6 text-ink/68">{selected.whyItMatters}</p>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
            <div className="rounded-md border border-ink/10 bg-paper/60 p-4">
              <h4 className="font-bold text-ink">확인한 근거</h4>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-ink/72">
                {selected.evidence.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className="rounded-md border border-brass/20 bg-brass/10 p-4">
              <h4 className="font-bold text-ink">다음 확인</h4>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-ink/72">
                {selected.nextCheck.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>

          <div className="mt-5 rounded-md border border-ink/10 bg-paper/55 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
              <div>
                <h4 className="font-bold text-ink">기술 로그</h4>
                <p className="mt-1 text-xs leading-5 text-ink/55">개발자 검증용 실제 Tool Call Trace입니다.</p>
              </div>
              <button
                type="button"
                onClick={() => setShowTrace((value) => !value)}
                className="rounded-md bg-ink px-3 py-2 text-xs font-black text-white transition hover:bg-ink/85"
              >
                {showTrace ? "기술 로그 닫기" : `기술 로그 보기 · ${selected.traces.length} calls`}
              </button>
            </div>
            {showTrace && selected.traces.length > 0 ? (
              <div className="grid gap-2">
                {selected.traces.map((trace) => (
                  <article key={trace.id} className="rounded-md border border-ink/10 bg-white p-3">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className="rounded-md bg-moss/10 px-2 py-1 text-[0.68rem] font-black text-moss">{trace.tool}</span>
                      <span className="rounded-md bg-ink/5 px-2 py-1 text-[0.68rem] font-black text-ink/55">
                        {traceStatusLabel(trace.status)}
                      </span>
                      <span className="text-[0.68rem] font-bold text-ink/40">{trace.durationMs}ms</span>
                    </div>
                    <p className="text-xs leading-5 text-ink/55">input: {trace.inputSummary}</p>
                    <p className="mt-1 text-sm leading-6 text-ink/75">output: {trace.outputSummary}</p>
                  </article>
                ))}
              </div>
            ) : showTrace ? (
              <p className="text-sm leading-6 text-ink/60">
                이 Agent는 아직 실제 tool trace 대신 리포트 결과를 기반으로 설명됩니다. 다음 고도화 단계에서 독립 tool 호출로 분리할 수 있습니다.
              </p>
            ) : (
              <p className="text-sm leading-6 text-ink/60">사용자 판단에는 위 검토 노트가 우선이며, 상세 호출 기록은 필요할 때만 열어 확인합니다.</p>
            )}
          </div>
        </article>
      </div>
    </section>
  );
}

export function RiskReport({
  report,
  payload,
  onReportUpdate
}: {
  report: AnalyzeResponse;
  payload?: AnalyzeRequest | null;
  onReportUpdate?: (report: AnalyzeResponse) => void;
}) {
  const [layout, setLayout] = useState<"dashboard" | "document" | "agents">("dashboard");
  const [registryConfirmOpen, setRegistryConfirmOpen] = useState(false);
  const [registryLoading, setRegistryLoading] = useState(false);
  const [registryError, setRegistryError] = useState<string | null>(null);
  const tone =
    report.risk_score >= 81
      ? "border-clay/45 bg-clay/10 text-clay"
      : report.risk_score >= 61
        ? "border-brass/45 bg-brass/10 text-brass"
        : "border-moss/45 bg-moss/10 text-moss";
  const ruleEvidence = report.evidence.filter((item) => !item.source.startsWith("rag_docs"));
  const ragEvidence = report.evidence.filter((item) => item.source.startsWith("rag_docs"));
  const keySignals = ruleEvidence.length > 0 ? ruleEvidence : report.evidence.slice(0, 3);
  const structuredSignals = report.risk_signals ?? [];
  const displaySignals =
    structuredSignals.length > 0
      ? structuredSignals
      : keySignals.map((item, index) => ({
          severity: index === 0 ? "높음" : "확인 필요",
          title: item.title,
          metric: item.source,
          description: item.description,
          source: item.source
        }));
  const documentFacts = useMemo(
    () => [
      ["대상 주소", report.location.address],
      ["위험도", report.risk_level],
      ["위험 점수", `${report.risk_score}/100`],
      ["입력 보증금", money(report.market_comparison.input_deposit)],
      ["전월세 평균 보증금", money(report.market_comparison.nearby_avg_deposit)],
      ["매매 평균 실거래가", money(report.market_comparison.nearby_avg_sale_price)],
      ["차이율", `${report.market_comparison.difference_rate}%`]
    ],
    [report]
  );
  const generatedAt = todayLabel();
  const modeLabel = dataMode(report.data_statuses);
  const buildingRegister = report.building_register;
  const registry = report.registry;
  const registryVerified = registry?.status === "confirmed";
  const canRunRegistryLookup = Boolean(payload && onReportUpdate);
  const confidenceItems = [
    ["실거래 표본", `${report.market_comparison.sample_size}건`, report.market_comparison.match_mode === "complex" ? "단지 매칭" : "지역 참고"],
    ["RAG 근거", `${ragEvidence.length || report.evidence.length}개`, "보통"],
    ["권리관계", registryVerified ? "등기 요약" : "미확인", registryVerified ? "마스킹 반영" : "추가 필요"]
  ];
  const agentReports = useMemo(() => buildAgentReports(report, ragEvidence.length), [report, ragEvidence.length]);

  async function handleRegistryLookup() {
    if (!payload || !onReportUpdate) return;
    setRegistryLoading(true);
    setRegistryError(null);
    try {
      const updated = await runRegistryLookup(payload, report);
      onReportUpdate(updated);
      setRegistryConfirmOpen(false);
    } catch (error) {
      setRegistryError(error instanceof Error ? error.message : "등기부등본 열람 실행 중 오류가 발생했습니다.");
    } finally {
      setRegistryLoading(false);
    }
  }

  return (
    <div className="grid gap-5">
      {registryConfirmOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 px-4">
          <div className="w-full max-w-lg rounded-lg border border-ink/10 bg-white p-6 shadow-2xl">
            <div className="flex items-start gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-brass/15 text-brass">
                <FileKey2 aria-hidden="true" size={20} />
              </div>
              <div>
                <h2 className="text-lg font-black text-ink">등기부등본 열람을 실행할까요?</h2>
                <p className="mt-2 text-sm font-bold leading-6 text-ink/65">
                  이 단계는 자동 분석과 분리된 별도 실행입니다. CODEF와 대법원 등기 열람 과정에서 수수료, 주소 선택,
                  추가인증이 발생할 수 있고, 화면과 문서에는 민감정보를 마스킹해 반영합니다.
                </p>
              </div>
            </div>
            {registryError ? (
              <p role="alert" className="mt-4 rounded-md border border-clay/30 bg-clay/10 p-3 text-sm font-bold text-clay">
                {registryError}
              </p>
            ) : null}
            <div className="mt-6 flex flex-wrap justify-end gap-2">
              <button
                type="button"
                onClick={() => setRegistryConfirmOpen(false)}
                disabled={registryLoading}
                className="inline-flex min-h-10 items-center rounded-md border border-ink/10 bg-white px-4 text-sm font-black text-ink/70"
              >
                취소
              </button>
              <button
                type="button"
                onClick={handleRegistryLookup}
                disabled={registryLoading}
                className="inline-flex min-h-10 items-center gap-2 rounded-md bg-ink px-4 text-sm font-black text-white disabled:opacity-55"
              >
                {registryLoading ? <CircleDashed aria-hidden="true" size={16} className="animate-spin" /> : <FileKey2 aria-hidden="true" size={16} />}
                동의 후 실행
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <section className="dashboard-panel flex flex-wrap items-center gap-3 p-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-moss text-white">
          <FileText aria-hidden="true" size={22} />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-ink">{report.location.address}</h2>
          <p className="text-sm text-ink/60">
            전세 · {getPropertyTypeLabel(report.request_property_type ?? "multi_household")} · 보증금 {money(report.market_comparison.input_deposit)} · 분석 완료
          </p>
        </div>
        <div className="flex items-center gap-2 rounded-md border border-ink/10 bg-paper px-3 py-2 text-xs font-bold text-ink/60">
          <CalendarDays aria-hidden="true" size={15} className="text-moss" />
          {generatedAt}
        </div>
        <div className="rounded-md border border-moss/20 bg-moss/10 px-3 py-2 text-xs font-black text-moss">
          {modeLabel}
        </div>
        <div className="ml-auto flex flex-wrap items-center gap-2">
          <span className="mr-1 text-xs font-bold text-ink/45">레이아웃</span>
          <div className="flex rounded-lg border border-ink/10 bg-paper p-1">
            <button
              type="button"
              onClick={() => setLayout("dashboard")}
              className={`inline-flex min-h-9 items-center gap-1 rounded-md px-3 text-sm font-bold ${
                layout === "dashboard" ? "bg-white text-ink shadow-sm" : "text-ink/55"
              }`}
            >
              <LayoutDashboard aria-hidden="true" size={15} />
              대시보드형
            </button>
            <button
              type="button"
              onClick={() => setLayout("document")}
              className={`inline-flex min-h-9 items-center gap-1 rounded-md px-3 text-sm font-bold ${
                layout === "document" ? "bg-white text-ink shadow-sm" : "text-ink/55"
              }`}
            >
              <FileText aria-hidden="true" size={15} />
              문서형
            </button>
            <button
              type="button"
              onClick={() => setLayout("agents")}
              className={`inline-flex min-h-9 items-center gap-1 rounded-md px-3 text-sm font-bold ${
                layout === "agents" ? "bg-white text-ink shadow-sm" : "text-ink/55"
              }`}
            >
              <NotebookTabs aria-hidden="true" size={15} />
              Agent 검토
            </button>
          </div>
          <button
            type="button"
            onClick={() => downloadDocumentReport(report)}
            className="inline-flex min-h-10 items-center gap-2 rounded-md border border-ink/15 bg-white px-4 text-sm font-bold text-ink shadow-sm transition hover:bg-mint/40"
          >
            <Download aria-hidden="true" size={16} />
            문서 다운로드
          </button>
        </div>
      </section>

      <DataStatusStrip report={report} />

      {layout === "agents" ? (
        <AgentReportPanel reports={agentReports} />
      ) : layout === "document" ? (
        <article className="dashboard-panel mx-auto w-full max-w-4xl p-8 sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-moss">Trust Ark Report</p>
          <h1 className="mt-3 font-serif text-4xl font-black text-ink">전세 계약 사전 위험 검토 리포트</h1>
          <p className="mt-3 text-sm leading-6 text-ink/65">
            본 문서는 현재 입력값, 데이터 조회 상태, RAG 체크리스트 근거를 바탕으로 생성된 참고용 분석 리포트입니다.
          </p>

          <section className={`mt-8 rounded-lg border p-5 ${tone}`}>
            <p className="text-sm font-bold text-ink/65">종합 판단</p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-serif text-3xl font-black text-ink">{report.risk_level}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-ink/72">{report.summary}</p>
              </div>
              <div className="metric-tile px-6 py-4 text-center">
                <p className="text-xs font-bold text-ink/55">위험 점수</p>
                <p className="text-4xl font-black text-ink">{report.risk_score}</p>
              </div>
            </div>
          </section>

          <section className="mt-8">
            <SectionTitle number="01" title="분석 대상" />
            <dl className="grid gap-3 sm:grid-cols-2">
              {documentFacts.map(([label, value]) => (
                <div key={label} className="metric-tile p-4">
                  <dt className="text-xs font-bold text-ink/50">{label}</dt>
                  <dd className="mt-1 font-bold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
          </section>

          <section className="mt-8">
            <SectionTitle number="02" title="핵심 위험 신호" description={`${displaySignals.length}개`} />
            <div className="grid gap-3">
              {displaySignals.map((item, index) => (
                <div key={`${item.source}-doc-${index}`} className="rounded-md border border-ink/10 bg-white p-4">
                  <div className="mb-2 flex items-center gap-2">
                    <SeverityPill severity={item.severity} />
                    <span className="text-xs font-bold text-ink/45">{item.metric}</span>
                  </div>
                  <h3 className="font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink/70">{item.description}</p>
                  <p className="mt-3 text-xs font-bold text-ink/45">출처: {sourceLabel(item.source)} · {item.source}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <SectionTitle number="03" title="데이터 조회 상태" description={modeLabel} />
            <DataStatusStrip report={report} framed={false} />
          </section>

          {buildingRegister ? (
            <section className="mt-8">
              <SectionTitle number="04" title="건축물대장 요약" />
              <dl className="grid gap-3 sm:grid-cols-2">
                {[
                  ["주용도", buildingRegister.mainPurpose ?? buildingRegister.etcPurpose ?? "-"],
                  ["사용승인일", buildingRegister.useApprovalDate ?? "-"],
                  ["위반건축물", yesNoUnknown(buildingRegister.violationBuilding)],
                  ["지상/지하층", `${countLabel(buildingRegister.groundFloors, "층")} / ${countLabel(buildingRegister.undergroundFloors, "층")}`]
                ].map(([label, value]) => (
                  <div key={label} className="metric-tile p-4">
                    <dt className="text-xs font-bold text-ink/50">{label}</dt>
                    <dd className="mt-1 font-bold text-ink">{value}</dd>
                  </div>
                ))}
              </dl>
            </section>
          ) : null}

          <section className="mt-8">
            <SectionTitle number={buildingRegister ? "05" : "04"} title="등기부등본 요약" />
            <dl className="grid gap-3 sm:grid-cols-2">
              {[
                ["상태", registryVerified ? "권리관계 요약 확인" : "권리관계 미확인"],
                ["소유자", registry?.ownerMasked ?? "마스킹/미확인"],
                ["근저당", registry?.mortgageCount !== undefined && registry?.mortgageCount !== null ? `${registry.mortgageCount}건` : "-"],
                ["압류/가압류", registry?.attachmentCount !== undefined && registry?.attachmentCount !== null ? `${registry.attachmentCount}건` : "-"],
                ["신탁", registry?.trustRegistered === true ? "후보 있음" : "후보 없음/미확인"],
                ["민감정보", "마스킹 적용"]
              ].map(([label, value]) => (
                <div key={label} className="metric-tile p-4">
                  <dt className="text-xs font-bold text-ink/50">{label}</dt>
                  <dd className="mt-1 font-bold text-ink">{value}</dd>
                </div>
              ))}
            </dl>
            <p className="mt-3 rounded-md border border-brass/20 bg-brass/10 p-3 text-xs font-bold leading-5 text-ink/65">
              {registry?.note ?? "등기부등본 원문 권리관계가 아직 확보되지 않았습니다. 원문 확인 전에는 안전 여부를 단정하지 않습니다."}
            </p>
          </section>

          <section className="mt-8">
            <SectionTitle number={buildingRegister ? "06" : "05"} title="RAG 근거 문서" />
            <EvidenceList items={ragEvidence.length > 0 ? ragEvidence : report.evidence} />
          </section>

          <section className="mt-8">
            <SectionTitle number={buildingRegister ? "07" : "06"} title="다음 확인 액션" />
            <ol className="grid gap-2 text-sm leading-6 text-ink/75">
              {report.next_actions.map((item) => (
                <li key={item} className="rounded-md border border-ink/10 bg-white p-3">{item}</li>
              ))}
            </ol>
          </section>

          <section className="mt-8">
            <SectionTitle number={buildingRegister ? "08" : "07"} title="검토 상태" />
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="rounded-md border border-moss/20 bg-moss/10 p-4">
                <h3 className="font-bold text-ink">확인된 사실</h3>
                <ul className="mt-3 grid gap-2 text-sm leading-6 text-ink/70">
                  {report.sections.confirmed_facts.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
              <div className="rounded-md border border-clay/20 bg-clay/10 p-4">
                <h3 className="font-bold text-ink">미확인 항목</h3>
                <ul className="mt-3 grid gap-2 text-sm leading-6 text-ink/70">
                  {report.sections.unverified_items.map((item) => <li key={item}>{item}</li>)}
                </ul>
              </div>
            </div>
          </section>
        </article>
      ) : (
      <>
      <section className={`dashboard-panel overflow-hidden border-l-4 p-0 ${tone}`}>
        <div className="grid gap-5 p-5 sm:grid-cols-[1fr_12rem] sm:p-6">
          <div>
            <div className="flex items-center gap-2 text-sm font-bold text-ink/65">
              <Gauge aria-hidden="true" size={18} />
              종합 위험도
            </div>
            <h2 className="mt-3 font-serif text-5xl font-black text-ink">{report.risk_level}</h2>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-ink/72">{report.summary}</p>
            <ScoreBreakdownPanel breakdown={report.score_breakdown} />
            <div className="mt-5 grid gap-2 sm:grid-cols-3">
              {confidenceItems.map(([label, value, status]) => (
                <div key={label} className="rounded-md border border-white/70 bg-white/80 p-3 shadow-sm">
                  <p className="text-[0.7rem] font-black uppercase text-ink/45">{label}</p>
                  <p className="mt-1 text-sm font-black text-ink">{value}</p>
                  <p className="mt-1 text-xs font-bold text-ink/55">{status}</p>
                </div>
              ))}
            </div>
          </div>
          <div className="metric-tile grid place-items-center p-5 text-center">
            <p className="text-sm font-bold text-ink/60">위험 점수</p>
            <p className="mt-1 text-5xl font-black tabular-nums text-ink">{report.risk_score}</p>
            <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink/10">
              <div className="h-full rounded-full bg-current" style={{ width: `${report.risk_score}%` }} />
            </div>
          </div>
        </div>
      </section>

      <section className="dashboard-panel p-5">
        <SectionTitle number="01" title="핵심 위험 신호" description={`${keySignals.length}개 감지`} />
        <div className="grid gap-3 md:grid-cols-2">
          {displaySignals.map((item, index) => (
            <article key={`${item.source}-${index}`} className="rounded-md border border-ink/10 bg-white p-4 shadow-sm">
              <div className="mb-2 flex items-center justify-between gap-3">
                <SeverityPill severity={item.severity} />
                <span className="text-xs font-bold text-ink/45">{item.metric}</span>
              </div>
              <h3 className="font-bold text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink/70">{item.description}</p>
              <div className="mt-4 flex items-center gap-2 border-t border-ink/10 pt-3 text-xs font-bold text-ink/45">
                <ShieldAlert aria-hidden="true" size={14} className="text-moss" />
                {sourceLabel(item.source)} · {item.source}
              </div>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="dashboard-panel p-5">
          <SectionTitle number="02" title="입력 단지 실거래가" description={marketScopeLabel(report)} />
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
            <Scale aria-hidden="true" size={20} className="text-moss" />
            <h2 className="text-lg font-bold">전세·매매 실거래 확인</h2>
            </div>
            <span className="rounded-md bg-ink px-2.5 py-1 text-xs font-bold text-white">
              표본 {report.market_comparison.sample_size}건
            </span>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2">
            <div className="metric-tile border-moss/25 bg-moss/10 p-4">
              <dt className="text-ink/60">최근 전월세 보증금</dt>
              <dd className="mt-1 text-lg font-black text-ink">{money(report.market_comparison.latest_rent_deposit)}</dd>
              <dd className="mt-1 text-xs font-bold text-ink/45">{dealMonth(report.market_comparison.latest_rent_deal_month)} · 월세 {money(report.market_comparison.latest_rent_monthly_rent)}</dd>
            </div>
            <div className="metric-tile border-brass/25 bg-brass/10 p-4">
              <dt className="text-ink/60">최근 매매 실거래가</dt>
              <dd className="mt-1 text-lg font-black text-ink">{money(report.market_comparison.latest_sale_price)}</dd>
              <dd className="mt-1 text-xs font-bold text-ink/45">{dealMonth(report.market_comparison.latest_sale_deal_month)} · 전세가율 {report.market_comparison.jeonse_ratio ?? "-"}%</dd>
            </div>
            <div className="metric-tile p-3">
              <dt className="text-ink/60">전월세 평균 보증금</dt>
              <dd className="mt-1 font-semibold">{money(report.market_comparison.nearby_avg_deposit)}</dd>
              <dd className="mt-1 text-xs text-ink/45">전월세 {report.market_comparison.rent_sample_size ?? report.market_comparison.sample_size}건</dd>
            </div>
            <div className="metric-tile p-3">
              <dt className="text-ink/60">매매 평균 실거래가</dt>
              <dd className="mt-1 font-semibold">{money(report.market_comparison.nearby_avg_sale_price)}</dd>
              <dd className="mt-1 text-xs text-ink/45">매매 {report.market_comparison.sale_sample_size ?? 0}건</dd>
            </div>
            <div className="metric-tile p-3 sm:col-span-2">
              <dt className="text-ink/60">입력 보증금 대비 평균 보증금 차이율</dt>
              <dd className="mt-1 flex items-center gap-1 font-semibold tabular-nums">
                <TrendingUp aria-hidden="true" size={15} className="text-brass" />
                {report.market_comparison.difference_rate}%
              </dd>
            </div>
          </dl>
        </section>
        <section>
          <SectionTitle number="03" title="위치 맥락" description="대상/주변 marker" />
          <MapView location={report.location} markers={report.markers} />
        </section>
      </div>

      <section>
        <SectionTitle number="04" title="건축물대장 요약" description={buildingRegister ? "표제부 확인" : "미확보"} />
        {buildingRegister ? (
          <div className="dashboard-panel p-5">
            <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
              <div className="flex items-center gap-2">
                <FileBadge aria-hidden="true" size={20} className="text-moss" />
                <div>
                  <h2 className="text-lg font-bold text-ink">건축물 기본 정보</h2>
                  <p className="mt-1 text-xs font-bold text-ink/45">{buildingRegister.address}</p>
                </div>
              </div>
              <span className={`rounded-md px-2.5 py-1 text-xs font-black ${
                buildingRegister.violationBuilding === true ? "bg-clay/10 text-clay" : "bg-moss/10 text-moss"
              }`}>
                위반건축물 {yesNoUnknown(buildingRegister.violationBuilding)}
              </span>
            </div>
            <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
              <div className="metric-tile p-4">
                <dt className="text-ink/60">주용도</dt>
                <dd className="mt-1 font-black text-ink">{buildingRegister.mainPurpose ?? buildingRegister.etcPurpose ?? "-"}</dd>
              </div>
              <div className="metric-tile p-4">
                <dt className="text-ink/60">사용승인일</dt>
                <dd className="mt-1 font-black text-ink">{buildingRegister.useApprovalDate ?? "-"}</dd>
              </div>
              <div className="metric-tile p-4">
                <dt className="text-ink/60">세대/가구</dt>
                <dd className="mt-1 font-black text-ink">{countLabel(buildingRegister.householdCount)} / {countLabel(buildingRegister.familyCount)}</dd>
              </div>
              <div className="metric-tile p-4">
                <dt className="text-ink/60">지상/지하층</dt>
                <dd className="mt-1 font-black text-ink">{countLabel(buildingRegister.groundFloors, "층")} / {countLabel(buildingRegister.undergroundFloors, "층")}</dd>
              </div>
            </dl>
            <p className="mt-4 rounded-md border border-brass/20 bg-brass/10 p-3 text-xs font-bold leading-5 text-ink/65">
              건축물대장은 용도와 위반건축물 여부를 확인하는 자료입니다. 등기부등본의 소유자, 근저당, 압류, 신탁 여부는 별도 확인이 필요합니다.
            </p>
          </div>
        ) : (
          <div className="dashboard-panel p-5 text-sm leading-6 text-ink/65">
            건축물대장 표제부가 아직 확보되지 않았습니다. 주소 지번과 동 단위 법정동코드가 확보되면 주용도, 사용승인일, 위반건축물 여부를 표시합니다.
          </div>
        )}
      </section>

      <section>
        <SectionTitle number="05" title="등기부등본 요약" description={registryVerified ? "권리관계 요약" : "미확인"} />
        <div className="dashboard-panel p-5">
          <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
            <div className="flex items-center gap-2">
              <FileKey2 aria-hidden="true" size={20} className="text-moss" />
              <div>
                <h2 className="text-lg font-bold text-ink">권리관계 기본 정보</h2>
                <p className="mt-1 text-xs font-bold text-ink/45">{registry?.address ?? report.location.address}</p>
              </div>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <span className={`rounded-md px-2.5 py-1 text-xs font-black ${
                registryVerified ? "bg-moss/10 text-moss" : "bg-brass/10 text-brass"
              }`}>
                {registryVerified ? "민감정보 마스킹 완료" : registry?.status === "requires_user_action" ? "별도 실행 필요" : "원문 확인 필요"}
              </span>
              {!registryVerified ? (
                <button
                  type="button"
                  onClick={() => {
                    setRegistryError(null);
                    setRegistryConfirmOpen(true);
                  }}
                  disabled={!canRunRegistryLookup || registryLoading}
                  className="inline-flex min-h-8 items-center gap-1 rounded-md border border-moss/20 bg-moss/10 px-3 text-xs font-black text-moss disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {registryLoading ? <CircleDashed aria-hidden="true" size={14} className="animate-spin" /> : <FileKey2 aria-hidden="true" size={14} />}
                  등기 열람 실행
                </button>
              ) : null}
            </div>
          </div>
          <dl className="grid gap-3 text-sm sm:grid-cols-2 xl:grid-cols-4">
            <div className="metric-tile p-4">
              <dt className="text-ink/60">소유자</dt>
              <dd className="mt-1 font-black text-ink">{registry?.ownerMasked ?? "마스킹/미확인"}</dd>
            </div>
            <div className="metric-tile p-4">
              <dt className="text-ink/60">근저당</dt>
              <dd className="mt-1 font-black text-ink">{registry?.mortgageCount !== undefined && registry?.mortgageCount !== null ? `${registry.mortgageCount}건` : "-"}</dd>
            </div>
            <div className="metric-tile p-4">
              <dt className="text-ink/60">압류/가압류</dt>
              <dd className="mt-1 font-black text-ink">{registry?.attachmentCount !== undefined && registry?.attachmentCount !== null ? `${registry.attachmentCount}건` : "-"}</dd>
            </div>
            <div className="metric-tile p-4">
              <dt className="text-ink/60">신탁/전세권</dt>
              <dd className="mt-1 font-black text-ink">{registry?.trustRegistered === true ? "신탁 후보" : registry?.leaseRightRegistered === true ? "전세권 후보" : "없음/미확인"}</dd>
            </div>
          </dl>
          <p className="mt-4 rounded-md border border-brass/20 bg-brass/10 p-3 text-xs font-bold leading-5 text-ink/65">
            {registry?.note ?? "등기부등본 원문 권리관계가 아직 확보되지 않았습니다. CODEF 직접인증 입력값 또는 원문 등본 확인이 필요합니다."}
          </p>
          {registryError ? (
            <p role="alert" className="mt-3 rounded-md border border-clay/30 bg-clay/10 p-3 text-xs font-bold leading-5 text-clay">
              {registryError}
            </p>
          ) : null}
        </div>
      </section>

      <section>
        <SectionTitle number="06" title="RAG 근거 문서" description={`${ragEvidence.length || report.evidence.length}개 근거`} />
        <EvidenceList items={ragEvidence.length > 0 ? ragEvidence : report.evidence} />
      </section>

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="dashboard-panel p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 aria-hidden="true" size={20} className="text-moss" />
            확인된 사실
          </h2>
          <ul className="grid gap-2 text-sm leading-6 text-ink/75">
            {report.sections.confirmed_facts.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section className="dashboard-panel p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <ListChecks aria-hidden="true" size={20} className="text-brass" />
            다음 확인 액션
          </h2>
          <ul className="grid gap-2 text-sm leading-6 text-ink/75">
            {report.next_actions.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section className="dashboard-panel p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle aria-hidden="true" size={20} className="text-clay" />
            주의 문구
          </h2>
          <ul className="grid gap-2 text-sm leading-6 text-ink/75">
            {report.warnings.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
      </div>
      </>
      )}
    </div>
  );
}
