"use client";

import { AlertTriangle, CheckCircle2, Download, FileText, Gauge, LayoutDashboard, ListChecks, Scale, TrendingUp } from "lucide-react";
import { useMemo, useState } from "react";
import type { AnalyzeResponse } from "@/lib/types";
import { EvidenceList } from "./EvidenceList";
import { MapView } from "./MapView";

const formatter = new Intl.NumberFormat("ko-KR");

function money(value?: number | null) {
  if (!value) return "-";
  return `${formatter.format(value)}원`;
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
  const evidenceItems = report.evidence
    .map(
      (item) => `
        <li>
          <strong>${escapeHtml(item.title)}</strong>
          <p>${escapeHtml(item.description)}</p>
          <small>출처: ${escapeHtml(item.source)}</small>
        </li>`
    )
    .join("");
  const actionItems = report.next_actions.map((item) => `<li>${escapeHtml(item)}</li>`).join("");
  const warningItems = report.warnings.map((item) => `<li>${escapeHtml(item)}</li>`).join("");

  return `<!doctype html>
<html lang="ko">
<head>
  <meta charset="utf-8" />
  <title>Trust Ark 계약 리스크 리포트</title>
  <style>
    body { margin: 0; padding: 48px; font-family: "Noto Sans KR", system-ui, sans-serif; color: #222019; background: #f5f2ea; }
    main { max-width: 860px; margin: 0 auto; background: white; border: 1px solid #e7e2d6; padding: 48px; }
    .kicker { color: #2f6b4d; font-size: 12px; font-weight: 800; letter-spacing: .18em; text-transform: uppercase; }
    h1 { font-family: Georgia, "Noto Serif KR", serif; font-size: 34px; margin: 12px 0 8px; }
    h2 { margin-top: 34px; border-top: 1px solid #e7e2d6; padding-top: 22px; font-size: 20px; }
    .summary { background: #f4e4e1; border: 1px solid #e7c8c2; padding: 18px; border-radius: 10px; }
    .score { font-size: 42px; font-weight: 900; color: #a8453a; }
    dl { display: grid; grid-template-columns: repeat(2, 1fr); gap: 12px; }
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
    <p>${escapeHtml(report.location.address)}</p>
    <section class="summary">
      <strong>종합 위험도: ${escapeHtml(report.risk_level)}</strong>
      <div class="score">${report.risk_score}</div>
      <p>${escapeHtml(report.summary)}</p>
    </section>
    <h2>시세 적정성</h2>
    <dl>
      <div><dt>입력 보증금</dt><dd>${money(report.market_comparison.input_deposit)}</dd></div>
      <div><dt>주변 평균 보증금</dt><dd>${money(report.market_comparison.nearby_avg_deposit)}</dd></div>
      <div><dt>차이율</dt><dd>${report.market_comparison.difference_rate}%</dd></div>
      <div><dt>표본 수</dt><dd>${report.market_comparison.sample_size}건</dd></div>
    </dl>
    <h2>핵심 근거</h2>
    <ul>${evidenceItems}</ul>
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

export function RiskReport({ report }: { report: AnalyzeResponse }) {
  const [layout, setLayout] = useState<"dashboard" | "document">("dashboard");
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
      ["주변 평균 보증금", money(report.market_comparison.nearby_avg_deposit)],
      ["차이율", `${report.market_comparison.difference_rate}%`]
    ],
    [report]
  );

  return (
    <div className="grid gap-5">
      <section className="dashboard-panel flex flex-wrap items-center gap-3 p-4">
        <div className="flex h-11 w-11 items-center justify-center rounded-md bg-moss text-white">
          <FileText aria-hidden="true" size={22} />
        </div>
        <div className="min-w-0">
          <h2 className="font-bold text-ink">{report.location.address}</h2>
          <p className="text-sm text-ink/60">전세 · 빌라 · 보증금 {money(report.market_comparison.input_deposit)} · 분석 완료</p>
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

      {layout === "document" ? (
        <article className="dashboard-panel mx-auto w-full max-w-4xl p-8 sm:p-10">
          <p className="text-xs font-black uppercase tracking-[0.18em] text-moss">Trust Ark Report</p>
          <h1 className="mt-3 font-serif text-4xl font-black text-ink">전세 계약 사전 위험 검토 리포트</h1>
          <p className="mt-3 text-sm leading-6 text-ink/65">
            본 문서는 현재 입력값과 mock 데이터, RAG 체크리스트 근거를 바탕으로 생성된 참고용 분석 리포트입니다.
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
                    <span className="rounded-md bg-clay/10 px-2 py-1 text-xs font-black text-clay">{item.severity}</span>
                    <span className="text-xs font-bold text-ink/45">{item.metric}</span>
                  </div>
                  <h3 className="font-bold">{item.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-ink/70">{item.description}</p>
                </div>
              ))}
            </div>
          </section>

          <section className="mt-8">
            <SectionTitle number="03" title="RAG 근거 문서" />
            <EvidenceList items={ragEvidence.length > 0 ? ragEvidence : report.evidence} />
          </section>

          <section className="mt-8">
            <SectionTitle number="04" title="다음 확인 액션" />
            <ol className="grid gap-2 text-sm leading-6 text-ink/75">
              {report.next_actions.map((item) => (
                <li key={item} className="rounded-md border border-ink/10 bg-white p-3">{item}</li>
              ))}
            </ol>
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
            <div className="mt-4 flex flex-wrap gap-2">
              <span className="rounded-md bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-sm">현재 데이터 기준</span>
              <span className="rounded-md bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-sm">추가 확인 필요</span>
              <span className="rounded-md bg-white px-3 py-1.5 text-xs font-bold text-ink shadow-sm">전문가 검토 권장</span>
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
            <article key={`${item.source}-${index}`} className="rounded-md border border-ink/10 bg-white p-4">
              <div className="mb-2 flex items-center justify-between gap-3">
                <span className="rounded-md bg-clay/10 px-2.5 py-1 text-xs font-black text-clay">
                  {item.severity}
                </span>
                <span className="text-xs font-bold text-ink/45">{item.metric}</span>
              </div>
              <h3 className="font-bold text-ink">{item.title}</h3>
              <p className="mt-2 text-sm leading-6 text-ink/70">{item.description}</p>
              <p className="mt-3 text-xs font-bold text-ink/45">출처: {item.source}</p>
            </article>
          ))}
        </div>
      </section>

      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="dashboard-panel p-5">
          <SectionTitle number="02" title="시세 적정성" description={`표본 ${report.market_comparison.sample_size}건`} />
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="flex items-center gap-2">
            <Scale aria-hidden="true" size={20} className="text-moss" />
            <h2 className="text-lg font-bold">주변 시세 비교</h2>
            </div>
            <span className="rounded-md bg-ink px-2.5 py-1 text-xs font-bold text-white">
              표본 {report.market_comparison.sample_size}건
            </span>
          </div>
          <dl className="grid grid-cols-2 gap-3 text-sm">
            <div className="metric-tile p-3">
              <dt className="text-ink/60">입력 보증금</dt>
              <dd className="mt-1 font-semibold">{money(report.market_comparison.input_deposit)}</dd>
            </div>
            <div className="metric-tile p-3">
              <dt className="text-ink/60">주변 평균 보증금</dt>
              <dd className="mt-1 font-semibold">{money(report.market_comparison.nearby_avg_deposit)}</dd>
            </div>
            <div className="metric-tile p-3">
              <dt className="text-ink/60">입력 매매가</dt>
              <dd className="mt-1 font-semibold">{money(report.market_comparison.input_sale_price)}</dd>
            </div>
            <div className="metric-tile p-3">
              <dt className="text-ink/60">차이율</dt>
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
