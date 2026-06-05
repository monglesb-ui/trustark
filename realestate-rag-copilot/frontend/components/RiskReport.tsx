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

const INTENT_TAG_LABELS: Record<string, string> = {
  concern_jeonse_fraud: "깡통전세/전세사기",
  concern_rights_transfer: "권리관계 변동",
  concern_owner_change: "임대인 변경",
  concern_guarantee_insurance: "전세보증금 반환보증",
  concern_market_price: "시세 적정성",
  concern_building_violation: "위반건축물·용도",
  concern_senior_lien: "선순위 임차인·체납",
  concern_multi_household: "다가구 호실별 부담",
  general_first_time: "첫 계약 일반 안내"
};

function intentTagLabel(tag: string) {
  return INTENT_TAG_LABELS[tag] ?? tag;
}

const PLAN_AGENT_LABEL: Record<string, string> = {
  market_data: "실거래가",
  building_register: "건축물대장",
  registry: "등기부등본",
  search_context: "외부 검색 맥락"
};

const PLAN_PRIORITY_LABEL: Record<string, string> = {
  critical: "최우선",
  normal: "기본",
  optional: "건너뜀"
};

const PLAN_PRIORITY_CLASS: Record<string, string> = {
  critical: "bg-clay/15 text-clay border border-clay/30",
  normal: "bg-ink/10 text-ink/70 border border-ink/15",
  optional: "bg-stone-200 text-stone-600 border border-stone-300"
};

function CompetitionDensityCard({
  finding
}: {
  finding: NonNullable<AnalyzeResponse["business_findings"]>["competition"];
}) {
  if (!finding) return null;
  const densityTone =
    finding.density_label === "매우 높음"
      ? "border-clay/45 bg-clay/10 text-clay"
      : finding.density_label === "높음"
        ? "border-brass/45 bg-brass/10 text-brass"
        : "border-moss/45 bg-moss/10 text-moss";
  return (
    <section className="dashboard-panel mt-5 overflow-hidden border-l-4 border-moss/40 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-black uppercase tracking-[0.16em] text-moss">
            실데이터 분석 활성
          </p>
          <h3 className="mt-2 font-serif text-2xl font-black text-ink">
            반경 {finding.radius_meters}m {finding.business_type_label} 밀집도
          </h3>
        </div>
        <span className={`shrink-0 rounded-md border px-3 py-1.5 text-sm font-black ${densityTone}`}>
          {finding.density_label}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-ink/10 bg-paper p-4">
          <p className="text-[0.7rem] font-black uppercase text-ink/45">동종업종 매장</p>
          <p className="mt-1 font-serif text-3xl font-black tabular-nums text-ink">{finding.total_stores}</p>
          <p className="mt-1 text-xs font-bold text-ink/55">건 (필터 적용)</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-paper p-4">
          <p className="text-[0.7rem] font-black uppercase text-ink/45">반경 내 전체 매장</p>
          <p className="mt-1 font-serif text-3xl font-black tabular-nums text-ink">{finding.all_stores_in_radius}</p>
          <p className="mt-1 text-xs font-bold text-ink/55">건 (전 업종)</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-paper p-4">
          <p className="text-[0.7rem] font-black uppercase text-ink/45">경쟁 점수</p>
          <p className="mt-1 font-serif text-3xl font-black tabular-nums text-ink">{finding.density_score}</p>
          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-ink/10">
            <div className="h-full rounded-full bg-current" style={{ width: `${finding.density_score}%` }} />
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-ink/75">{finding.note}</p>

      {finding.sample_stores.length > 0 ? (
        <div className="mt-4 rounded-md border border-ink/10 bg-white p-4">
          <p className="text-[0.7rem] font-black uppercase tracking-[0.12em] text-ink/45">인근 매장 표본</p>
          <ul className="mt-2 grid gap-1.5 text-xs text-ink/75">
            {finding.sample_stores.map((store, index) => (
              <li key={`${store.name}-${index}`} className="flex items-start gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-moss" />
                <span>
                  <strong className="text-ink">{store.name}</strong>
                  {store.category ? <span className="text-ink/55"> · {store.category}</span> : null}
                  {store.address ? <span className="text-ink/45"> · {store.address}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-3 text-[0.7rem] text-ink/55">
        ※ 출처: {finding.source}. 정확한 매출·신규/폐업 추세는 분기별 상권분석 API(VwsmTrdarSelngQq 등) 연동 후 활성화 예정.
      </p>
    </section>
  );
}

function SbizWidgetsCard({
  widgets
}: {
  widgets: AnalyzeResponse["sbiz_widgets"];
}) {
  const [active, setActive] = useState(0);
  const [erroredKeys, setErroredKeys] = useState<Set<string>>(new Set());

  if (!widgets || widgets.widgets.length === 0) return null;
  // 사용자 테스트로 확인된 정상 위젯을 앞에 정렬 (상권지도가 가장 안정)
  const SAFE_ORDER = ["map", "simple", "detail", "weather", "delivery", "sales", "store", "lifespan", "sns", "theme"];
  const ordered = [...widgets.widgets].sort(
    (a, b) => SAFE_ORDER.indexOf(a.key) - SAFE_ORDER.indexOf(b.key)
  );
  const visible = ordered.filter((w) => !erroredKeys.has(w.key));
  const safeActive = Math.min(active, visible.length - 1);
  const current = visible[safeActive] ?? ordered[0];
  if (!current) return null;

  return (
    <section className="dashboard-panel mt-5 overflow-hidden border-l-4 border-brass/55 bg-brass/5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-black uppercase tracking-[0.16em] text-brass">
            소상공인365 · 빅데이터 위젯
          </p>
          <h3 className="mt-2 font-serif text-2xl font-black text-ink">
            소상공인 빅데이터 시각화 ({widgets.widgets.length}개 위젯)
          </h3>
        </div>
        <span
          className={`shrink-0 rounded-md border px-3 py-1.5 text-sm font-black ${
            widgets.has_coordinates
              ? "border-moss/45 bg-moss/10 text-moss"
              : "border-ink/15 bg-ink/5 text-ink/55"
          }`}
        >
          {widgets.has_coordinates ? "좌표 적용됨" : "기본 위치"}
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-1.5">
        {visible.map((w, idx) => (
          <button
            key={w.key}
            type="button"
            onClick={() => setActive(idx)}
            className={`rounded-md border px-3 py-1.5 text-xs font-bold transition ${
              idx === safeActive
                ? "border-brass bg-brass text-cream"
                : "border-ink/15 bg-white text-ink/65 hover:border-brass/40"
            }`}
          >
            {w.label}
          </button>
        ))}
        {erroredKeys.size > 0 ? (
          <span className="rounded-md border border-clay/30 bg-clay/10 px-2 py-1 text-[0.65rem] font-bold text-clay">
            {erroredKeys.size}개 위젯 일시 오류 — 자동 숨김
          </span>
        ) : null}
      </div>

      <p className="mt-3 text-sm leading-6 text-ink/75">{current.description}</p>

      <div className="mt-4 overflow-hidden rounded-md border border-ink/15 bg-white">
        <iframe
          key={current.url}
          src={current.url}
          title={current.label}
          className="h-[640px] w-full"
          loading="lazy"
          referrerPolicy="no-referrer"
          onError={() =>
            setErroredKeys((prev) => {
              const next = new Set(prev);
              next.add(current.key);
              return next;
            })
          }
        />
      </div>

      <p className="mt-3 text-[0.7rem] text-ink/55">
        ※ 출처: {widgets.source}. 위젯은 소상공인365 공식 시각화를 우리 페이지에 임베드한 것입니다.
      </p>
    </section>
  );
}

function DecisionCard({
  finding
}: {
  finding: AnalyzeResponse["decision"];
}) {
  if (!finding) return null;
  const verdictConfig = {
    go: {
      label: "GO",
      title: "진행 권장",
      tone: "border-moss/55 bg-moss/15",
      pill: "bg-moss text-cream"
    },
    conditional: {
      label: "CONDITIONAL",
      title: "조건부 검토",
      tone: "border-brass/55 bg-brass/15",
      pill: "bg-brass text-cream"
    },
    stop: {
      label: "STOP",
      title: "재고 권장",
      tone: "border-clay/55 bg-clay/15",
      pill: "bg-clay text-cream"
    }
  }[finding.verdict];

  return (
    <section className={`dashboard-panel mt-2 overflow-hidden border-l-4 p-5 sm:p-6 ${verdictConfig.tone}`}>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-black uppercase tracking-[0.18em] text-ink/70">
            ⚡ 터무니 종합 판단 · LLM 의사결정
          </p>
          <h2 className="mt-2 font-serif text-3xl sm:text-4xl font-black text-ink">{finding.headline}</h2>
        </div>
        <span
          className={`shrink-0 rounded-md px-4 py-2 text-base font-black tracking-[0.1em] ${verdictConfig.pill}`}
        >
          {verdictConfig.label}
        </span>
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-2">
        {finding.reasons.length > 0 ? (
          <div className="rounded-md border border-ink/15 bg-white/85 p-4">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.12em] text-ink/55">
              📊 핵심 근거
            </p>
            <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-ink/80">
              {finding.reasons.map((r, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-black text-moss">{i + 1}.</span>
                  <span>{r}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        {finding.next_actions.length > 0 ? (
          <div className="rounded-md border border-ink/15 bg-white/85 p-4">
            <p className="text-[0.7rem] font-black uppercase tracking-[0.12em] text-ink/55">
              🎯 즉시 할 일
            </p>
            <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-ink/80">
              {finding.next_actions.map((a, i) => (
                <li key={i} className="flex gap-2">
                  <span className="font-black text-brass">→</span>
                  <span>{a}</span>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>

      {finding.red_flags.length > 0 ? (
        <div className="mt-4 rounded-md border border-clay/40 bg-clay/10 p-4">
          <p className="text-[0.7rem] font-black uppercase tracking-[0.12em] text-clay">
            🚩 빨간 신호
          </p>
          <ul className="mt-2 grid gap-1.5 text-sm leading-6 text-ink/85">
            {finding.red_flags.map((f, i) => (
              <li key={i} className="flex gap-2">
                <span className="font-black text-clay">⚠</span>
                <span>{f}</span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-4 text-[0.7rem] text-ink/55">
        ※ {finding.source}. 데이터 신뢰도: {finding.data_quality}
      </p>
    </section>
  );
}

function LegalRagCard({
  finding
}: {
  finding: AnalyzeResponse["legal_rag"];
}) {
  if (!finding) return null;
  const domainLabel: Record<string, string> = {
    law: "법령",
    ordinance: "자치법규",
    case: "사례",
    contract: "표준계약"
  };
  const domainTone: Record<string, string> = {
    law: "border-clay/40 bg-clay/10 text-clay",
    ordinance: "border-brass/40 bg-brass/10 text-brass",
    case: "border-ink/40 bg-ink/10 text-ink",
    contract: "border-moss/40 bg-moss/10 text-moss"
  };
  return (
    <section className="dashboard-panel mt-5 overflow-hidden border-l-4 border-moss/40 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-black uppercase tracking-[0.16em] text-moss">
            실데이터 분석 활성 · Agentic RAG
          </p>
          <h3 className="mt-2 font-serif text-2xl font-black text-ink">법령 · 조례 · 사례 RAG 근거</h3>
        </div>
        <span className="shrink-0 rounded-md border border-moss/45 bg-moss/10 px-3 py-1.5 text-sm font-black text-moss">
          {finding.hits.length}건 top-k
        </span>
      </div>

      <div className="mt-4 grid gap-2 sm:grid-cols-2 text-xs">
        <div className="rounded-md border border-ink/10 bg-paper p-3">
          <p className="text-[0.65rem] font-black uppercase text-ink/45">초기 쿼리</p>
          <p className="mt-1 text-ink/80">{finding.query}</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-paper p-3">
          <p className="text-[0.65rem] font-black uppercase text-ink/45">LLM 리라이트 쿼리</p>
          <p className="mt-1 text-ink/80">{finding.rewritten_query}</p>
        </div>
      </div>

      <div className="mt-2 flex flex-wrap gap-1.5 text-[0.65rem]">
        <span className="font-black uppercase tracking-[0.08em] text-ink/45">도메인 라우팅:</span>
        {finding.selected_domains.map((d) => (
          <span
            key={d}
            className={`rounded-md border px-2 py-0.5 font-bold ${domainTone[d] ?? "border-ink/15 bg-ink/5 text-ink"}`}
          >
            {domainLabel[d] ?? d}
          </span>
        ))}
      </div>

      <ul className="mt-4 grid gap-2">
        {finding.hits.map((hit) => (
          <li key={hit.id} className="rounded-md border border-ink/10 bg-white p-3">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-ink">{hit.title}</p>
              <div className="flex items-center gap-1.5">
                <span
                  className={`shrink-0 rounded-md border px-2 py-0.5 text-[0.6rem] font-black uppercase ${
                    domainTone[hit.domain] ?? "border-ink/15 bg-ink/5 text-ink"
                  }`}
                >
                  {domainLabel[hit.domain] ?? hit.domain}
                </span>
                <span className="shrink-0 rounded-md border border-ink/10 bg-paper px-2 py-0.5 text-[0.6rem] font-bold text-ink/65 tabular-nums">
                  {(hit.score * 100).toFixed(0)}점
                </span>
              </div>
            </div>
            <p className="mt-1.5 text-xs leading-5 text-ink/70 line-clamp-4 whitespace-pre-wrap">
              {hit.text}
            </p>
            <p className="mt-1 text-[0.6rem] font-bold text-ink/40">{hit.source}</p>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[0.7rem] text-ink/55">
        ※ {finding.source}. {finding.note}
      </p>
    </section>
  );
}

function LocalContextCard({
  finding
}: {
  finding: AnalyzeResponse["local_context"];
}) {
  if (!finding) return null;
  return (
    <section className="dashboard-panel mt-5 overflow-hidden border-l-4 border-moss/40 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-black uppercase tracking-[0.16em] text-moss">
            실데이터 분석 활성 · Naver 검색 재활용
          </p>
          <h3 className="mt-2 font-serif text-2xl font-black text-ink">동네 분위기 · 최근 이슈</h3>
        </div>
        <span className="shrink-0 rounded-md border border-moss/45 bg-moss/10 px-3 py-1.5 text-sm font-black text-moss">
          {finding.items.length}건
        </span>
      </div>

      <div className="mt-4 flex flex-wrap gap-2 text-xs">
        <span className="rounded-md border border-ink/10 bg-paper px-2 py-1 font-bold text-ink/75">
          웹 검색 {finding.total_web.toLocaleString()}건 · "{finding.query_web}"
        </span>
        <span className="rounded-md border border-ink/10 bg-paper px-2 py-1 font-bold text-ink/75">
          뉴스 {finding.total_news.toLocaleString()}건 · "{finding.query_news}"
        </span>
      </div>

      <ul className="mt-4 grid gap-2">
        {finding.items.map((item, index) => (
          <li
            key={`${item.link}-${index}`}
            className="rounded-md border border-ink/10 bg-white p-3"
          >
            <div className="flex items-center justify-between gap-2">
              <a
                href={item.link}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm font-bold text-ink hover:underline"
              >
                {item.title}
              </a>
              <span
                className={`shrink-0 rounded-md border px-2 py-0.5 text-[0.65rem] font-black uppercase ${
                  item.kind === "news"
                    ? "border-brass/40 bg-brass/10 text-brass"
                    : item.kind === "x"
                      ? "border-ink/40 bg-ink/10 text-ink"
                      : "border-moss/40 bg-moss/10 text-moss"
                }`}
              >
                {item.kind === "news" ? "뉴스" : item.kind === "x" ? "X" : "웹"}
              </span>
            </div>
            {item.description ? (
              <p className="mt-1 text-xs leading-5 text-ink/65 line-clamp-2">{item.description}</p>
            ) : null}
            {item.pubDate ? (
              <p className="mt-1 text-[0.65rem] font-bold text-ink/45">{item.pubDate}</p>
            ) : null}
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[0.7rem] text-ink/55">
        ※ 출처: {finding.source}. {finding.note}
      </p>
    </section>
  );
}

function BuildingRegisterLightCard({
  view
}: {
  view: AnalyzeResponse["building_register"];
}) {
  if (!view) return null;
  const fields: Array<[string, string]> = [
    ["주용도", view.mainPurpose ?? "미확인"],
    ["지상 층수", view.groundFloors != null ? `${view.groundFloors}층` : "미확인"],
    ["지하 층수", view.undergroundFloors != null ? `${view.undergroundFloors}층` : "미확인"],
    ["사용승인일", view.useApprovalDate ?? "미확인"]
  ];
  const violationTone =
    view.violationBuilding === true
      ? "border-clay/45 bg-clay/10 text-clay"
      : view.violationBuilding === false
        ? "border-moss/45 bg-moss/10 text-moss"
        : "border-ink/15 bg-ink/5 text-ink/55";
  const violationLabel =
    view.violationBuilding === true ? "위반건축물" : view.violationBuilding === false ? "위반 없음" : "여부 미확인";
  return (
    <section className="dashboard-panel mt-5 overflow-hidden border-l-4 border-moss/40 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-black uppercase tracking-[0.16em] text-moss">
            실데이터 분석 활성 · 부동산 Agent 재활용
          </p>
          <h3 className="mt-2 font-serif text-2xl font-black text-ink">
            건축물대장 · {view.buildingName ?? view.address ?? "건물 정보"}
          </h3>
        </div>
        <span className={`shrink-0 rounded-md border px-3 py-1.5 text-sm font-black ${violationTone}`}>
          {violationLabel}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-4">
        {fields.map(([label, value]) => (
          <div key={label} className="rounded-md border border-ink/10 bg-paper p-4">
            <p className="text-[0.7rem] font-black uppercase text-ink/45">{label}</p>
            <p className="mt-1 font-serif text-lg font-black text-ink">{value}</p>
          </div>
        ))}
      </div>

      {view.roadAddress ? (
        <p className="mt-4 text-sm leading-6 text-ink/75">
          <span className="font-bold">도로명: </span>
          {view.roadAddress}
        </p>
      ) : null}

      <p className="mt-3 text-[0.7rem] text-ink/55">
        ※ 출처: 국토교통부 건축HUB(BuildingHUB) 표제부 API. 부동산 모드의 BuildingRegister Agent를 동일하게 호출.
      </p>
    </section>
  );
}

function TradeAreaCard({
  finding
}: {
  finding: NonNullable<AnalyzeResponse["business_findings"]>["trade_area"];
}) {
  if (!finding) return null;
  const fmtNum = (n?: number) => (n == null ? "—" : Math.round(n).toLocaleString("ko-KR"));
  const fmtKRW = (n?: number) => {
    if (n == null || n === 0) return "—";
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(1)}억`;
    if (n >= 10_000) return `${(n / 10_000).toFixed(0)}만`;
    return n.toLocaleString("ko-KR");
  };
  const fmtPct = (n?: number) => (n == null ? "—" : `${n.toFixed(1)}%`);

  return (
    <section className="dashboard-panel mt-5 overflow-hidden border-l-4 border-brass/55 bg-brass/5 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-black uppercase tracking-[0.16em] text-brass">
            서울 상권분석 · 핵심 데이터
          </p>
          <h3 className="mt-2 font-serif text-2xl font-black text-ink">
            {finding.district} 상권 진단 ({finding.quarter} 분기)
          </h3>
        </div>
        <span className="shrink-0 rounded-md border border-brass/45 bg-brass/10 px-3 py-1.5 text-sm font-black text-brass">
          {finding.sample_size}개 상권
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-ink/10 bg-paper p-4">
          <p className="text-[0.7rem] font-black uppercase text-ink/45">평일 유동인구</p>
          <p className="mt-1 font-serif text-3xl font-black tabular-nums text-ink">
            {fmtNum(finding.metrics.avg_weekday_floating)}
          </p>
          <p className="mt-1 text-xs font-bold text-ink/55">명/일</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-paper p-4">
          <p className="text-[0.7rem] font-black uppercase text-ink/45">주말 유동인구</p>
          <p className="mt-1 font-serif text-3xl font-black tabular-nums text-ink">
            {fmtNum(finding.metrics.avg_weekend_floating)}
          </p>
          <p className="mt-1 text-xs font-bold text-ink/55">명/일</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-paper p-4">
          <p className="text-[0.7rem] font-black uppercase text-ink/45">월 추정매출</p>
          <p className="mt-1 font-serif text-3xl font-black tabular-nums text-ink">
            {fmtKRW(finding.metrics.avg_monthly_sales)}
          </p>
          <p className="mt-1 text-xs font-bold text-ink/55">원/월</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-paper p-4">
          <p className="text-[0.7rem] font-black uppercase text-ink/45">점포 수 (상권 평균)</p>
          <p className="mt-1 font-serif text-3xl font-black tabular-nums text-ink">
            {fmtNum(finding.metrics.total_stores)}
          </p>
          <p className="mt-1 text-xs font-bold text-ink/55">개</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-paper p-4">
          <p className="text-[0.7rem] font-black uppercase text-ink/45">신규 개업률</p>
          <p className="mt-1 font-serif text-3xl font-black tabular-nums text-moss">
            {fmtPct(finding.metrics.new_stores)}
          </p>
        </div>
        <div className="rounded-md border border-ink/10 bg-paper p-4">
          <p className="text-[0.7rem] font-black uppercase text-ink/45">폐업률</p>
          <p className="mt-1 font-serif text-3xl font-black tabular-nums text-clay">
            {fmtPct(finding.metrics.closed_stores)}
          </p>
        </div>
      </div>

      <ul className="mt-4 grid gap-1.5 rounded-md border border-ink/10 bg-white/85 p-4 text-sm leading-6 text-ink/80">
        {finding.insights.map((ins, i) => (
          <li key={i} className="flex gap-2">
            <span className="font-black text-brass">•</span>
            <span>{ins}</span>
          </li>
        ))}
      </ul>

      <p className="mt-3 text-[0.7rem] text-ink/55">
        ※ 출처: {finding.source} · {finding.diagnostic}
      </p>
    </section>
  );
}

function PropertyValueCard({
  finding
}: {
  finding: NonNullable<AnalyzeResponse["commercial_findings"]>["property_value"];
}) {
  if (!finding) return null;
  const formatKRW = (n: number | null | undefined) => {
    if (n == null || n === 0) return "—";
    if (n >= 100_000_000) return `${(n / 100_000_000).toFixed(2)}억`;
    if (n >= 10_000) return `${(n / 10_000).toFixed(0)}만`;
    return n.toLocaleString("ko-KR");
  };
  const hasData = finding.sale_sample_size > 0 || finding.rent_sample_size > 0;
  const tone = hasData ? "border-moss/45 bg-moss/10 text-moss" : "border-ink/15 bg-ink/5 text-ink/55";
  return (
    <section className="dashboard-panel mt-5 overflow-hidden border-l-4 border-moss/40 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-black uppercase tracking-[0.16em] text-moss">
            실데이터 분석 활성
          </p>
          <h3 className="mt-2 font-serif text-2xl font-black text-ink">
            {finding.region_label} 인근 시세 (참고)
          </h3>
        </div>
        <span className={`shrink-0 rounded-md border px-3 py-1.5 text-sm font-black ${tone}`}>
          {hasData ? `${finding.sale_sample_size + finding.rent_sample_size}건 매칭` : "데이터 부족"}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-ink/10 bg-paper p-4">
          <p className="text-[0.7rem] font-black uppercase text-ink/45">평균 매매가</p>
          <p className="mt-1 font-serif text-3xl font-black tabular-nums text-ink">
            {formatKRW(finding.average_sale_price)}
          </p>
          <p className="mt-1 text-xs font-bold text-ink/55">매매 {finding.sale_sample_size}건</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-paper p-4">
          <p className="text-[0.7rem] font-black uppercase text-ink/45">평균 보증금</p>
          <p className="mt-1 font-serif text-3xl font-black tabular-nums text-ink">
            {formatKRW(finding.average_deposit)}
          </p>
          <p className="mt-1 text-xs font-bold text-ink/55">전월세 {finding.rent_sample_size}건</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-paper p-4">
          <p className="text-[0.7rem] font-black uppercase text-ink/45">평균 월세</p>
          <p className="mt-1 font-serif text-3xl font-black tabular-nums text-ink">
            {formatKRW(finding.average_monthly_rent)}
          </p>
          <p className="mt-1 text-xs font-bold text-ink/55">월세 거래</p>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-ink/75">{finding.note}</p>
      <p className="mt-2 text-[0.7rem] text-ink/55">
        ※ 출처: {finding.source}. {finding.reference_property_type}
      </p>
    </section>
  );
}

function SchoolZoneCard({
  finding
}: {
  finding: NonNullable<AnalyzeResponse["business_findings"]>["school_zone"];
}) {
  if (!finding) return null;
  const impactTone =
    finding.impact_level === "high"
      ? "border-clay/45 bg-clay/10 text-clay"
      : finding.impact_level === "medium"
        ? "border-brass/45 bg-brass/10 text-brass"
        : "border-moss/45 bg-moss/10 text-moss";
  const impactLabel =
    finding.impact_level === "high" ? "영향 큼" : finding.impact_level === "medium" ? "조건부" : "영향 적음";
  const kindEntries = Object.entries(finding.school_kind_counts).sort((a, b) => b[1] - a[1]);
  return (
    <section className="dashboard-panel mt-5 overflow-hidden border-l-4 border-moss/40 p-5 sm:p-6">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-[0.7rem] font-black uppercase tracking-[0.16em] text-moss">
            실데이터 분석 활성
          </p>
          <h3 className="mt-2 font-serif text-2xl font-black text-ink">
            {finding.district} 학교환경위생정화구역 영향 검토
          </h3>
        </div>
        <span className={`shrink-0 rounded-md border px-3 py-1.5 text-sm font-black ${impactTone}`}>
          {impactLabel}
        </span>
      </div>

      <div className="mt-5 grid gap-3 sm:grid-cols-3">
        <div className="rounded-md border border-ink/10 bg-paper p-4">
          <p className="text-[0.7rem] font-black uppercase text-ink/45">자치구 학교 수</p>
          <p className="mt-1 font-serif text-3xl font-black tabular-nums text-ink">{finding.total_schools_in_district}</p>
          <p className="mt-1 text-xs font-bold text-ink/55">건</p>
        </div>
        <div className="rounded-md border border-ink/10 bg-paper p-4 sm:col-span-2">
          <p className="text-[0.7rem] font-black uppercase text-ink/45">학교 종류별</p>
          <div className="mt-2 flex flex-wrap gap-2 text-xs">
            {kindEntries.slice(0, 5).map(([kind, count]) => (
              <span key={kind} className="rounded-md border border-ink/10 bg-white px-2 py-1 font-bold text-ink/75">
                {kind} <strong className="text-ink">{count}</strong>
              </span>
            ))}
          </div>
        </div>
      </div>

      <p className="mt-4 text-sm leading-6 text-ink/75">{finding.impact_message}</p>

      {finding.nearby_schools.length > 0 ? (
        <div className="mt-4 rounded-md border border-ink/10 bg-white p-4">
          <p className="text-[0.7rem] font-black uppercase tracking-[0.12em] text-ink/45">
            {finding.nearby_schools[0]?.matchedBy === "same_road" ? "같은 도로 학교" : "자치구 내 학교(샘플)"}
          </p>
          <ul className="mt-2 grid gap-1.5 text-xs text-ink/75">
            {finding.nearby_schools.slice(0, 8).map((school, index) => (
              <li key={`${school.name}-${index}`} className="flex items-start gap-2">
                <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-moss" />
                <span>
                  <strong className="text-ink">{school.name}</strong>
                  <span className="text-ink/55"> · {school.kind}</span>
                  {school.address ? <span className="text-ink/45"> · {school.address}</span> : null}
                </span>
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      <p className="mt-3 text-[0.7rem] text-ink/55">
        ※ 출처: {finding.source}. {finding.note}
      </p>
    </section>
  );
}

function PlannerInsightPanel({ planner }: { planner: AnalyzeResponse["planner"] }) {
  if (!planner) return null;
  const hasTags = planner.intent_tags.length > 0;
  const hasEmphasis = planner.emphasis.length > 0;
  const hasSummary = planner.user_question_summary.trim().length > 0;
  if (!hasTags && !hasEmphasis && !hasSummary) return null;

  return (
    <div className="mt-5 rounded-md border border-moss/25 bg-moss/10 p-4">
      <div className="flex items-center gap-2 text-[0.7rem] font-black uppercase tracking-[0.16em] text-moss">
        <NotebookTabs aria-hidden="true" size={14} />
        터무니 플래너가 읽은 당신의 의도
      </div>
      {hasSummary ? (
        <p className="mt-2 border-l-2 border-moss/40 pl-3 text-sm italic leading-6 text-ink/80">
          “{planner.user_question_summary}”
        </p>
      ) : null}
      {hasTags ? (
        <div className="mt-3 flex flex-wrap gap-1.5">
          {planner.intent_tags.map((tag) => (
            <span
              key={tag}
              className="rounded-md bg-white/80 px-2 py-1 text-[0.7rem] font-black text-moss"
              title={tag}
            >
              #{intentTagLabel(tag)}
            </span>
          ))}
        </div>
      ) : null}
      {hasEmphasis ? (
        <ul className="mt-3 space-y-1 text-xs text-ink/75">
          {planner.emphasis.map((item, index) => (
            <li key={`${item}-${index}`} className="flex items-start gap-2">
              <span className="mt-1 inline-block h-1.5 w-1.5 shrink-0 rounded-full bg-moss" />
              <span>{item}</span>
            </li>
          ))}
        </ul>
      ) : null}
      {planner.execution_plan?.length ? (
        <div className="mt-4 rounded-md border border-white/70 bg-white/80 p-3">
          <p className="text-[0.7rem] font-black uppercase tracking-[0.12em] text-ink/55">
            터무니가 정한 검토 우선순위
          </p>
          <ul className="mt-2 space-y-1.5 text-xs text-ink/75">
            {planner.execution_plan.map((entry) => (
              <li key={entry.agent} className="flex items-start gap-2">
                <span
                  className={`shrink-0 rounded px-1.5 py-0.5 text-[0.65rem] font-black ${PLAN_PRIORITY_CLASS[entry.priority] ?? PLAN_PRIORITY_CLASS.normal}`}
                >
                  {PLAN_PRIORITY_LABEL[entry.priority] ?? entry.priority}
                </span>
                <span>
                  <strong className="text-ink">{PLAN_AGENT_LABEL[entry.agent] ?? entry.agent}</strong>
                  {entry.notes ? <span className="text-ink/60"> — {entry.notes}</span> : null}
                </span>
              </li>
            ))}
          </ul>
          <p className="mt-2 text-[0.7rem] text-ink/55">
            ※ AI가 사용자 의도에 맞춰 어떤 데이터 단계를 최우선으로 볼지·건너뛸지 결정한 결과입니다. &ldquo;건너뜀&rdquo;인 항목은 외부 API 호출을 생략해 시간·비용을 절약합니다.
          </p>
        </div>
      ) : null}
      <p className="mt-3 text-[0.7rem] text-ink/55">
        ※ 이 의도 분류는 AI가 사용자 질문과 입력값을 보고 추정한 것입니다. 후속 요약·액션 순서가 이 의도를 기준으로
        재구성됩니다. 잘못 짚었다면 질문을 더 구체적으로 적어주세요.
      </p>
    </div>
  );
}

function ScoreBreakdownPanel({ breakdown }: { breakdown: AnalyzeResponse["score_breakdown"] }) {
  if (!breakdown) return null;
  const total = Math.max(breakdown.final_score, 1);
  const baseWidth = (breakdown.base_score / 100) * 100;
  return (
    <div className="mt-5 rounded-md border border-ink/10 bg-white/70 p-4">
      <p className="text-[0.7rem] font-black uppercase tracking-[0.16em] text-ink/45">근거 분해</p>
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
  if (source.startsWith("rag_docs")) return "법령·체크리스트";
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
      <h2>권리 근거</h2>
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
  <title>Tumuni 계약 리스크 리포트</title>
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
    <div class="kicker">Tumuni · 부동산 계약 리스크 코파일럿</div>
    <h1>전세 계약 사전 위험 검토 리포트</h1>
    <p class="meta">${escapeHtml(report.location.address)} · 생성일 ${todayLabel()} · ${escapeHtml(dataMode(report.data_statuses))}</p>
    <section class="summary">
      <strong>터무니지수: ${escapeHtml(report.risk_level)}</strong>
      <div class="score">${report.risk_score}</div>
      <p>${escapeHtml(report.summary)}</p>
    </section>
    <h2>실거래 근거</h2>
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
    <h2>근거 데이터 현황</h2>
    <ul>${dataStatusItems}</ul>
    ${registryItems}
    <h2>핵심 근거 신호</h2>
    <ul>${signalItems || evidenceItems}</ul>
    <h2>핵심 근거</h2>
    <ul>${evidenceItems}</ul>
    <h2>확인/미확인 항목</h2>
    <div class="grid">
      <div><strong>확인된 터무니</strong><ul>${confirmedItems}</ul></div>
      <div><strong>미확인 항목</strong><ul>${unverifiedItems}</ul></div>
    </div>
    <h2>터무니를 채우는 다음 단계</h2>
    <ol>${actionItems}</ol>
    <h2>한계 안내</h2>
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
  if (!status) return "근거 데이터 없음";
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
        <h2 className="text-sm font-black text-ink">근거 데이터 현황</h2>
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

  const plannerTraces = tracesForAgent(report, "Planner Agent");
  const summarizerTraces = tracesForAgent(report, "Summarizer Agent");
  const plannerRan = Boolean(report.planner);
  const summarizerRan = summarizerTraces.some((t) => t.status === "success");

  return [
    {
      name: "Planner Agent",
      status: plannerRan ? "완료" : "건너뜀",
      purpose:
        "사용자 입력과 자유 질문을 LLM으로 읽고 어떤 신호를 우선시할지 의도 태그와 강조 포인트를 추출합니다. 후속 단계가 사용자 맥락에 맞게 동작하도록 가이드합니다.",
      judgment: plannerRan
        ? `사용자가 알고 싶어 하는 것: "${report.planner!.user_question_summary}"`
        : "OPENAI_API_KEY 미설정 또는 호출 실패로 의도 분류를 건너뛰었습니다. 후속 흐름은 결정론적 템플릿으로 진행됐습니다.",
      evidence: plannerRan
        ? [
            `의도 태그 ${report.planner!.intent_tags.length}개: ${
              report.planner!.intent_tags.map(intentTagLabel).join(", ") || "(없음)"
            }`,
            report.planner!.emphasis.length > 0
              ? `강조 포인트: ${report.planner!.emphasis.join(" | ")}`
              : "강조 포인트 없음",
            report.planner!.execution_plan?.length
              ? `실행 계획: ${report.planner!.execution_plan.map((e) => `${PLAN_AGENT_LABEL[e.agent] ?? e.agent}=${PLAN_PRIORITY_LABEL[e.priority] ?? e.priority}`).join(" / ")}`
              : "실행 계획: (없음)",
            "이 분류는 사용자 입력만 보고 추정한 결과로 단정이 아니며, 잘못 짚었다면 질문을 더 구체적으로 적어 재실행해야 합니다."
          ]
        : [
            "Planner Agent는 OPENAI_API_KEY가 필요합니다.",
            "키가 없을 때 모든 사용자 질문이 동일한 템플릿 흐름으로 처리됩니다."
          ],
      confidence: "중간",
      whyItMatters:
        "사용자 질문 의도를 명시적으로 분류하면 같은 입력값이어도 \"보증보험 가능성\"을 강조할지 \"임대인 변경 위험\"을 강조할지 후속 단계가 다르게 동작합니다.",
      nextCheck: plannerRan
        ? [
            "Planner가 분류한 의도가 실제 사용자 의도와 일치하는지 확인",
            "다르다면 질문을 더 구체적으로 다시 입력해 재실행",
            "잘못 분류된 경우 Summarizer 요약·액션 순서도 함께 점검"
          ]
        : [
            "OPENAI_API_KEY를 Vercel 환경변수에 설정",
            "키 없이는 사용자 의도 분류 없이 기본 흐름만 동작함을 인지"
          ],
      traces: plannerTraces
    },
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
          ? "권리 근거가 확보되었습니다. 소유자명과 등기번호 등 민감정보는 마스킹했고, 근저당·압류·신탁 후보만 근거 신호로 분리했습니다."
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
      purpose: "시세 차이, 표본 수, RAG 근거, 미확인 권리관계를 종합해 터무니 점수와 근거 신호를 만들었습니다.",
      judgment: `${report.risk_level} 판정입니다. 이 점수는 계약 가능 여부가 아니라 추가 확인 필요도를 나타냅니다.`,
      evidence: [
        `터무니 점수는 ${report.risk_score}점입니다.`,
        `터무니지수는 ${report.risk_level}입니다.`,
        `구조화된 근거 신호는 ${(report.risk_signals ?? []).length || 1}건입니다.`
      ],
      confidence: report.market_comparison.sample_size >= 10 ? "중간" : "낮음",
      whyItMatters: "터무니 점수는 사용자가 어떤 항목부터 확인해야 하는지 우선순위를 잡기 위한 신호입니다.",
      nextCheck: report.next_actions.slice(0, 3),
      traces: tracesForAgent(report, "Risk Scoring Agent")
    },
    {
      name: "Summarizer Agent",
      status: summarizerRan ? "완료" : summarizerTraces.length > 0 ? "실패" : "건너뜀",
      purpose:
        "누적된 분석 결과(시세·등기·건축물대장·터무니 점수·미확인 항목)와 Planner가 추정한 사용자 의도를 받아 종합 요약 문장과 우선순위가 매겨진 다음 액션 리스트를 LLM이 자연어로 재작성합니다.",
      judgment: summarizerRan
        ? `요약 ${report.summary.length}자와 다음 액션 ${report.next_actions.length}개를 사용자 의도 기준으로 재구성했습니다.`
        : "Summarizer를 건너뛰었거나 호출이 실패해 템플릿 요약과 원래 액션 순서가 그대로 사용됐습니다.",
      evidence: [
        `현재 요약: "${report.summary.slice(0, 120)}${report.summary.length > 120 ? "…" : ""}"`,
        `다음 액션 첫 3개: ${report.next_actions.slice(0, 3).join(" | ") || "(없음)"}`,
        report.planner
          ? `Planner 의도 입력: ${
              report.planner.intent_tags.map(intentTagLabel).join(", ") || "(없음)"
            }`
          : "Planner 의도 입력 없음 (기존 보고서만으로 요약)"
      ],
      confidence: "중간",
      whyItMatters:
        "결정론적 파이프라인이 만든 보고서는 모든 사용자에게 동일한 톤·순서로 전달됩니다. Summarizer는 사용자의 구체적 질문 맥락에 맞춰 어떤 항목을 먼저 언급할지·어떤 행동을 가장 우선시할지 다르게 표현합니다.",
      nextCheck: [
        "요약 문장이 단정 표현을 쓰지 않았는지 확인 (Validation Agent가 추가 검증)",
        "다음 액션 우선순위가 사용자 상황에 맞는지 검토",
        "필요시 사용자 질문을 다시 입력해 다른 강조점으로 재요약"
      ],
      traces: summarizerTraces
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
        `한계 안내 ${report.warnings.length}건을 유지했습니다.`,
        `미확인 항목 ${report.sections.unverified_items.length}건을 별도 표시했습니다.`
      ],
      confidence: "높음",
      whyItMatters: "터무니 검토는 법률·권리관계 확인을 대체할 수 없기 때문에 단정 표현을 막는 안전장치가 필요합니다.",
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
          <p className="text-xs font-black uppercase tracking-[0.16em] text-moss">Tumuni Agent Review Notes</p>
          <h2 className="mt-2 text-2xl font-black text-ink">터무니 에이전트 검토 노트</h2>
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
  const isPlaceholderMode =
    report.requested_mode === "business_permit" || report.requested_mode === "commercial_use";
  const placeholderModeLabel =
    report.requested_mode === "business_permit"
      ? "창업·영업 적합성"
      : report.requested_mode === "commercial_use"
        ? "상가 활용성"
        : "터무니 검토";
  const placeholderPreviewItems = report.requested_mode === "business_permit"
    ? [
        { title: "용도지역 적합 여부", source: "LURIS 토지이용계획" },
        { title: "정화구역 200m 검증", source: "학교알리미 · 청소년시설" },
        { title: "동종업종 밀집도", source: "LOCALDATA 인허가" },
        { title: "자치구 영업제한", source: "ELIS 조례 RAG" },
        { title: "인허가 절차·수수료", source: "식품위생법·학원법·공중위생법" },
        { title: "시설기준 적합성", source: "건축물대장 + 업종 룰" }
      ]
    : report.requested_mode === "commercial_use"
      ? [
          { title: "이 자리에서 가능한 업종 TOP 5", source: "LOCALDATA + 건축물대장" },
          { title: "업종별 임대수익률", source: "실거래 + 임대료 통계" },
          { title: "상가 가치 평가", source: "트러스트 아크 부동산 분석" },
          { title: "동종업종 밀집·매출 추이", source: "소상공인진흥공단 상권" },
          { title: "용도지역·인허가 가능성", source: "LURIS + 법령 RAG" },
          { title: "지원사업 매칭", source: "K-Startup · 정부24" }
        ]
      : [];
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
      ["터무니지수", report.risk_level],
      ["터무니 점수", `${report.risk_score}/100`],
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
          <p className="text-xs font-black uppercase tracking-[0.18em] text-moss">Tumuni Report</p>
          <h1 className="mt-3 font-serif text-4xl font-black text-ink">전세 계약 사전 위험 검토 리포트</h1>
          <p className="mt-3 text-sm leading-6 text-ink/65">
            본 문서는 현재 입력값, 근거 데이터 현황, RAG 체크리스트 근거를 바탕으로 생성된 참고용 분석 리포트입니다.
          </p>

          <section className={`mt-8 rounded-lg border p-5 ${tone}`}>
            <p className="text-sm font-bold text-ink/65">종합 판단</p>
            <div className="mt-3 flex flex-wrap items-end justify-between gap-4">
              <div>
                <h2 className="font-serif text-3xl font-black text-ink">{report.risk_level}</h2>
                <p className="mt-2 max-w-2xl text-sm leading-7 text-ink/72">{report.summary}</p>
              </div>
              <div className="metric-tile px-6 py-4 text-center">
                <p className="text-xs font-bold text-ink/55">터무니 점수</p>
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
            <SectionTitle number="02" title="핵심 근거 신호" description={`${displaySignals.length}개`} />
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
            <SectionTitle number="03" title="근거 데이터 현황" description={modeLabel} />
            <DataStatusStrip report={report} framed={false} />
          </section>

          {buildingRegister ? (
            <section className="mt-8">
              <SectionTitle number="04" title="건축 근거" />
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
            <SectionTitle number={buildingRegister ? "05" : "04"} title="권리 근거" />
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
            <SectionTitle number={buildingRegister ? "06" : "05"} title="법령·체크리스트 근거" />
            <EvidenceList items={ragEvidence.length > 0 ? ragEvidence : report.evidence} />
          </section>

          <section className="mt-8">
            <SectionTitle number={buildingRegister ? "07" : "06"} title="터무니를 채우는 다음 단계" />
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
                <h3 className="font-bold text-ink">확인된 터무니</h3>
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
      {isPlaceholderMode && report.decision ? (
        <DecisionCard finding={report.decision} />
      ) : null}

      {isPlaceholderMode ? (
        <section className="dashboard-panel overflow-hidden border-l-4 border-brass/45 bg-brass/10 p-5 sm:p-6">
          <div className="flex items-center gap-2 text-sm font-bold text-ink/65">
            <Gauge aria-hidden="true" size={18} />
            {placeholderModeLabel}
          </div>
          <h2 className="mt-3 font-serif text-4xl font-black text-ink">곧 출시 — 입력값 접수 완료</h2>
          <p className="mt-3 max-w-3xl text-sm leading-7 text-ink/75">{report.summary}</p>

          <PlannerInsightPanel planner={report.planner} />

          {report.agent_traces && report.agent_traces.length > 0 ? (
            <div className="mt-5 rounded-md border border-ink/15 bg-white/85 p-4">
              <p className="text-[0.7rem] font-black uppercase tracking-[0.12em] text-ink/55">
                실시간 Agent 호출 진단 ({report.agent_traces.length}개)
              </p>
              <ul className="mt-2 space-y-1.5 text-[0.72rem] text-ink/75">
                {report.agent_traces.map((t) => (
                  <li key={t.id} className="flex items-start gap-2">
                    <span
                      className={`mt-0.5 inline-block rounded px-1.5 py-0.5 text-[0.6rem] font-black uppercase ${
                        t.status === "success"
                          ? "bg-moss/15 text-moss"
                          : t.status === "failed"
                            ? "bg-clay/20 text-clay"
                            : "bg-ink/10 text-ink/60"
                      }`}
                    >
                      {t.status}
                    </span>
                    <span className="flex-1">
                      <span className="font-bold">{t.agent}</span>
                      <span className="text-ink/45"> · {t.tool}</span>
                      <span className="block text-ink/55">{t.outputSummary}</span>
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}

          {placeholderPreviewItems.length > 0 ? (
            <div className="mt-5 rounded-md border border-white/70 bg-white/85 p-4">
              <p className="text-[0.7rem] font-black uppercase tracking-[0.12em] text-ink/55">
                이 모드가 활성화되면 보일 검증 카드
              </p>
              <div className="mt-3 grid gap-2 sm:grid-cols-2">
                {placeholderPreviewItems.map((item) => (
                  <div key={item.title} className="rounded-md border border-ink/10 bg-paper px-3 py-2.5">
                    <p className="text-sm font-bold text-ink/80">{item.title}</p>
                    <p className="mt-1 text-[0.7rem] font-bold text-ink/50">{item.source}</p>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[0.7rem] text-ink/55">
                ※ 발표 직전 LOCALDATA · LURIS · 학교알리미 · ELIS · 법령 RAG 연동으로 활성화됩니다. 지금은 부동산 임차·매수 모드를 사용해 주세요.
              </p>
            </div>
          ) : null}
        </section>
      ) : null}

      {isPlaceholderMode &&
      report.business_findings?.competition &&
      (report.business_findings.competition.total_stores > 0 ||
        report.business_findings.competition.all_stores_in_radius > 0) ? (
        <CompetitionDensityCard finding={report.business_findings.competition} />
      ) : null}

      {isPlaceholderMode &&
      report.business_findings?.school_zone &&
      report.business_findings.school_zone.total_schools_in_district > 0 ? (
        <SchoolZoneCard finding={report.business_findings.school_zone} />
      ) : null}

      {isPlaceholderMode && report.business_findings?.trade_area ? (
        <TradeAreaCard finding={report.business_findings.trade_area} />
      ) : null}

      {isPlaceholderMode && report.location && (report.location.lat || report.location.lng) ? (
        <section className="dashboard-panel mt-5 overflow-hidden border-l-4 border-moss/40 p-5 sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-[0.7rem] font-black uppercase tracking-[0.16em] text-moss">
                실데이터 분석 활성 · 위치 매핑
              </p>
              <h3 className="mt-2 font-serif text-2xl font-black text-ink">검토 위치 지도</h3>
            </div>
            <span className="shrink-0 rounded-md border border-moss/45 bg-moss/10 px-3 py-1.5 text-sm font-black text-moss">
              {report.markers?.length ?? 1}개 마커
            </span>
          </div>
          <div className="mt-4 overflow-hidden rounded-md border border-ink/10">
            <MapView location={report.location} markers={report.markers ?? []} />
          </div>
          <p className="mt-3 text-[0.7rem] text-ink/55">
            ※ 입력 주소: {report.location.address}. 좌표: {report.location.lat.toFixed(5)}, {report.location.lng.toFixed(5)} (Naver Maps Geocoder)
          </p>
        </section>
      ) : null}

      {isPlaceholderMode && report.commercial_findings?.property_value ? (
        <PropertyValueCard finding={report.commercial_findings.property_value} />
      ) : null}

      {isPlaceholderMode && report.building_register ? (
        <BuildingRegisterLightCard view={report.building_register} />
      ) : null}

      {isPlaceholderMode && report.local_context ? (
        <LocalContextCard finding={report.local_context} />
      ) : null}

      {isPlaceholderMode && report.legal_rag ? (
        <LegalRagCard finding={report.legal_rag} />
      ) : null}

      {isPlaceholderMode && report.sbiz_widgets && report.sbiz_widgets.widgets.length > 0 ? (
        <SbizWidgetsCard widgets={report.sbiz_widgets} />
      ) : null}

      {!isPlaceholderMode ? (
        <section className={`dashboard-panel overflow-hidden border-l-4 p-0 ${tone}`}>
          <div className="grid gap-5 p-5 sm:grid-cols-[1fr_12rem] sm:p-6">
            <div>
              <div className="flex items-center gap-2 text-sm font-bold text-ink/65">
                <Gauge aria-hidden="true" size={18} />
                터무니지수
              </div>
              <h2 className="mt-3 font-serif text-5xl font-black text-ink">{report.risk_level}</h2>
              <p className="mt-3 max-w-3xl text-sm leading-7 text-ink/72">{report.summary}</p>
              <PlannerInsightPanel planner={report.planner} />
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
              <p className="text-sm font-bold text-ink/60">터무니 점수</p>
              <p className="mt-1 text-5xl font-black tabular-nums text-ink">{report.risk_score}</p>
              <div className="mt-3 h-2 w-full overflow-hidden rounded-full bg-ink/10">
                <div className="h-full rounded-full bg-current" style={{ width: `${report.risk_score}%` }} />
              </div>
            </div>
          </div>
        </section>
      ) : null}

      {!isPlaceholderMode && (
      <section className="dashboard-panel p-5">
        <SectionTitle number="01" title="핵심 근거 신호" description={`${keySignals.length}개 감지`} />
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
      )}

      {!isPlaceholderMode && (
      <div className="grid gap-5 xl:grid-cols-[0.92fr_1.08fr]">
        <section className="dashboard-panel p-5">
          <SectionTitle number="02" title="실거래 근거" description={marketScopeLabel(report)} />
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
      )}

      {!isPlaceholderMode && (
      <>
      <section>
        <SectionTitle number="04" title="건축 근거" description={buildingRegister ? "표제부 확인" : "근거 부족"} />
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
        <SectionTitle number="05" title="권리 근거" description={registryVerified ? "권리관계 요약" : "근거 부족"} />
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
        <SectionTitle number="06" title="법령·체크리스트 근거" description={`${ragEvidence.length || report.evidence.length}개 근거`} />
        <EvidenceList items={ragEvidence.length > 0 ? ragEvidence : report.evidence} />
      </section>
      </>
      )}

      <div className="grid gap-5 lg:grid-cols-3">
        <section className="dashboard-panel p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <CheckCircle2 aria-hidden="true" size={20} className="text-moss" />
            확인된 터무니
          </h2>
          <ul className="grid gap-2 text-sm leading-6 text-ink/75">
            {report.sections.confirmed_facts.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section className="dashboard-panel p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <ListChecks aria-hidden="true" size={20} className="text-brass" />
            터무니를 채우는 다음 단계
          </h2>
          <ul className="grid gap-2 text-sm leading-6 text-ink/75">
            {report.next_actions.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </section>
        <section className="dashboard-panel p-5">
          <h2 className="mb-3 flex items-center gap-2 text-lg font-semibold">
            <AlertTriangle aria-hidden="true" size={20} className="text-clay" />
            한계 안내
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
