"use client";

import {
  AlertTriangle,
  CalendarDays,
  CheckCircle2,
  CircleDashed,
  Download,
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
import type { AnalyzeResponse, DataSourceStatus } from "@/lib/types";
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

function marketScopeLabel(report: AnalyzeResponse) {
  if (report.market_comparison.match_mode === "complex") {
    return report.market_comparison.complex_name ? `${report.market_comparison.complex_name} 단지 기준` : "입력 단지 기준";
  }
  if (report.market_comparison.match_mode === "regional") return "단지 매칭 없음 · 지역 참고";
  return "대체 표본";
}

function sourceLabel(source: string) {
  if (source.startsWith("rag_docs")) return "RAG 문서";
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
  tasks: string[];
  observations: string[];
  delivered: string[];
};

function buildAgentReports(report: AnalyzeResponse, ragEvidenceCount: number): AgentReport[] {
  const inputDeposit = money(report.market_comparison.input_deposit);
  const nearbyDeposit = money(report.market_comparison.nearby_avg_deposit);
  const geocodingStatus = statusById(report, "geocoding");
  const legalDongStatus = statusById(report, "legal-dong");
  const rentStatus = statusById(report, "rent-market");
  const saleStatus = statusById(report, "sale-market");

  return [
    {
      name: "Market Data Agent",
      status: "완료",
      purpose: "입력된 단지의 전월세·매매 실거래가를 우선 조회하고, 없을 때만 지역 참고 표본으로 시세 근거를 만들었습니다.",
      tasks: ["입력 보증금 확인", "주소에서 단지명 후보 추출", "단지명 매칭 실거래가 우선 조회", "최근 전세·매매 가격과 전세가율 산출"],
      observations: [
        `전월세 실거래가: ${statusText(rentStatus)}`,
        `매매 실거래가: ${statusText(saleStatus)}`,
        `입력 보증금은 ${inputDeposit}입니다.`,
        `실거래 기준은 ${marketScopeLabel(report)}입니다.`,
        `전월세 평균 보증금은 ${nearbyDeposit}입니다.`,
        `차이율은 ${report.market_comparison.difference_rate}%이고 표본 수는 ${report.market_comparison.sample_size}건입니다.`
      ],
      delivered: ["latest_rent_deposit", "latest_sale_price", "jeonse_ratio", "market_comparison"]
    },
    {
      name: "RAG Evidence Agent",
      status: "완료",
      purpose: "전세 계약 전 확인해야 할 체크리스트 근거를 검색해 리포트 문장의 출처를 보강했습니다.",
      tasks: ["사용자 질문에서 전세 계약 전 확인 의도 추출", "전세 리스크 체크리스트 문서 검색", "등기부등본·보증보험·선순위 권리 관련 근거 선별"],
      observations: [
        `RAG 근거 ${ragEvidenceCount || report.evidence.length}건을 리포트에 연결했습니다.`,
        "실제 등기부등본 원문은 제공되지 않아 미확인 항목으로 유지했습니다.",
        "보증보험 가입 가능 여부도 현재 데이터에서는 확정하지 않았습니다."
      ],
      delivered: ["RAG 근거 문서", "미확인 항목 후보", "다음 확인 액션 후보"]
    },
    {
      name: "Location Context Agent",
      status: "완료",
      purpose: "대상 주소와 주변 거래 표본의 위치 맥락을 구성해 비교 표본이 어디에 놓이는지 보여줬습니다.",
      tasks: ["주소 정규화", "네이버/VWorld 지오코딩 상태 확인", "법정동코드 조회 상태 확인", "대상 marker와 주변 marker 구성"],
      observations: [
        `지도 지오코딩: ${statusText(geocodingStatus)}`,
        `법정동코드: ${statusText(legalDongStatus)}`,
        `대상 좌표는 ${report.location.lat.toFixed(4)}, ${report.location.lng.toFixed(4)}입니다.`,
        `지도 marker는 총 ${report.markers.length}개입니다.`,
        geocodingStatus?.status === "success"
          ? "대상 좌표는 지도 지오코딩 결과를 사용했습니다."
          : "대상 좌표는 대체 좌표를 사용했으므로 정확한 위치로 단정하지 않습니다."
      ],
      delivered: ["target marker", "nearby markers", "location caveat"]
    },
    {
      name: "Risk Scoring Agent",
      status: "완료",
      purpose: "시세 차이, 표본 수, RAG 근거, 미확인 권리관계를 종합해 위험 점수와 위험 신호를 만들었습니다.",
      tasks: ["보증금 차이율 규칙 적용", "표본 부족에 따른 불확실성 반영", "권리관계·보증보험 미확인 상태를 리스크 신호와 분리"],
      observations: [
        `위험 점수는 ${report.risk_score}점입니다.`,
        `위험도는 ${report.risk_level}입니다.`,
        `구조화된 위험 신호는 ${(report.risk_signals ?? []).length || 1}건입니다.`
      ],
      delivered: ["risk_score", "risk_level", "risk_signals"]
    },
    {
      name: "Report Agent",
      status: "완료",
      purpose: "각 Agent의 결과를 사용자에게 읽기 쉬운 종합 리포트와 문서형 리포트 구조로 조립했습니다.",
      tasks: ["종합 위험도 요약 생성", "시세 비교·RAG 근거·다음 액션 섹션 구성", "문서형 다운로드용 HTML 리포트 구성"],
      observations: ["대시보드형 리포트가 생성되었습니다.", "문서형 리포트 전환이 가능합니다.", "문서 다운로드용 HTML을 생성할 수 있습니다."],
      delivered: ["summary", "sections", "next_actions", "downloadable document"]
    },
    {
      name: "Validation Agent",
      status: "완료",
      purpose: "최종 리포트가 계약 가능 여부를 단정하지 않도록 안전 문구와 미확인 항목을 검토했습니다.",
      tasks: ["단정 표현 차단", "전문가 검토 필요 문구 확인", "확인된 사실·가정·미확인 항목 분리 확인"],
      observations: [
        "계약 가능/안전 같은 단정 표현을 사용하지 않았습니다.",
        `주의 문구 ${report.warnings.length}건을 유지했습니다.`,
        `미확인 항목 ${report.sections.unverified_items.length}건을 별도 표시했습니다.`
      ],
      delivered: ["warnings", "validated report", "safety caveats"]
    }
  ];
}

function AgentReportPanel({ reports }: { reports: AgentReport[] }) {
  const [openAgent, setOpenAgent] = useState(reports[0]?.name ?? "");
  const selected = reports.find((item) => item.name === openAgent) ?? reports[0];

  return (
    <section className="dashboard-panel p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-black uppercase tracking-[0.16em] text-moss">Trust Ark Agent Workpapers</p>
          <h2 className="mt-2 text-2xl font-black text-ink">Agent 분석 기록</h2>
          <p className="mt-2 max-w-2xl text-sm leading-6 text-ink/65">
            종합 리포트 뒤에서 각 Agent가 어떤 입력을 보고 어떤 결과물을 넘겼는지 확인할 수 있습니다.
          </p>
        </div>
        <span className="rounded-md border border-moss/20 bg-moss/10 px-3 py-2 text-xs font-black text-moss">
          {reports.length} agents completed
        </span>
      </div>

      <div className="grid gap-5 xl:grid-cols-[20rem_1fr]">
        <div className="grid content-start gap-2">
          {reports.map((item) => (
            <button
              key={item.name}
              type="button"
              onClick={() => setOpenAgent(item.name)}
              className={`flex min-h-[4.25rem] items-center justify-between gap-3 rounded-md border px-4 py-3 text-left transition ${
                item.name === selected.name ? "border-moss/45 bg-moss/10 shadow-sm" : "border-ink/10 bg-white hover:bg-mint/30"
              }`}
            >
              <span>
                <strong className="block text-sm text-ink">{item.name}</strong>
                <span className="mt-1 block text-xs text-ink/55">{item.purpose}</span>
              </span>
              <span className="shrink-0 rounded-md bg-moss px-2 py-1 text-[0.68rem] font-black text-white">{item.status}</span>
            </button>
          ))}
        </div>

        <article className="rounded-lg border border-ink/10 bg-white p-5 shadow-sm">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 pb-4">
            <div>
              <h3 className="text-xl font-black text-ink">{selected.name} 보고서</h3>
              <p className="mt-1 text-sm leading-6 text-ink/65">{selected.purpose}</p>
            </div>
            <span className="rounded-md bg-ink px-2.5 py-1 text-xs font-bold text-white">{selected.status}</span>
          </div>

          <div className="grid gap-4 lg:grid-cols-3">
            <div className="rounded-md border border-ink/10 bg-paper/60 p-4">
              <h4 className="font-bold text-ink">수행 작업</h4>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-ink/72">
                {selected.tasks.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className="rounded-md border border-ink/10 bg-paper/60 p-4">
              <h4 className="font-bold text-ink">관찰 결과</h4>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-ink/72">
                {selected.observations.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
            <div className="rounded-md border border-moss/20 bg-moss/10 p-4">
              <h4 className="font-bold text-ink">종합 보고서에 전달한 내용</h4>
              <ul className="mt-3 grid gap-2 text-sm leading-6 text-ink/72">
                {selected.delivered.map((item) => <li key={item}>{item}</li>)}
              </ul>
            </div>
          </div>
        </article>
      </div>
    </section>
  );
}

export function RiskReport({ report }: { report: AnalyzeResponse }) {
  const [layout, setLayout] = useState<"dashboard" | "document" | "agents">("dashboard");
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
  const confidenceItems = [
    ["실거래 표본", `${report.market_comparison.sample_size}건`, report.market_comparison.match_mode === "complex" ? "단지 매칭" : "지역 참고"],
    ["RAG 근거", `${ragEvidence.length || report.evidence.length}개`, "보통"],
    ["권리관계", "미확인", "추가 필요"]
  ];
  const agentReports = useMemo(() => buildAgentReports(report, ragEvidence.length), [report, ragEvidence.length]);

  return (
    <div className="grid gap-5">
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
              Agent 기록
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

          <section className="mt-8">
            <SectionTitle number="04" title="RAG 근거 문서" />
            <EvidenceList items={ragEvidence.length > 0 ? ragEvidence : report.evidence} />
          </section>

          <section className="mt-8">
            <SectionTitle number="05" title="다음 확인 액션" />
            <ol className="grid gap-2 text-sm leading-6 text-ink/75">
              {report.next_actions.map((item) => (
                <li key={item} className="rounded-md border border-ink/10 bg-white p-3">{item}</li>
              ))}
            </ol>
          </section>

          <section className="mt-8">
            <SectionTitle number="06" title="검토 상태" />
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
        <SectionTitle number="04" title="RAG 근거 문서" description={`${ragEvidence.length || report.evidence.length}개 근거`} />
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
