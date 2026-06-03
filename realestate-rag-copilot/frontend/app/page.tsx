"use client";

import { useEffect, useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Database,
  FileBadge,
  FileKey2,
  FileSearch,
  LoaderCircle,
  MapPinned,
  Moon,
  Search,
  ShieldCheck,
  Sparkles,
  Sun,
  FileCheck2
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnalysisForm } from "@/components/AnalysisForm";
import { RiskReport } from "@/components/RiskReport";
import { analyzeContract } from "@/lib/api";
import type { AnalyzeRequest, AnalyzeResponse, DataSourceStatus } from "@/lib/types";

type AgentStep = {
  name: string;
  shortName: string;
  role: string;
  preview: string;
  Icon: LucideIcon;
  logs: string[];
};

const agentSteps: AgentStep[] = [
  {
    name: "Market Data Agent",
    shortName: "시세 표본",
    role: "실거래가 API에서 입력 단지의 전월세·매매 표본을 우선 조회합니다.",
    preview: "단지명 매칭 · 전월세 표본 · 매매 표본 · 전세가율 계산",
    Icon: Database,
    logs: [
      "입력 주소에서 단지명 후보와 주택 유형을 확인합니다.",
      "법정동코드와 계약월 기준으로 실거래가 API 호출을 준비합니다.",
      "전월세·매매 표본에서 입력 단지명과 매칭되는 거래를 우선 선별합니다.",
      "입력 보증금, 평균 매매가, 전세가율을 계산해 Market Context로 전달합니다."
    ]
  },
  {
    name: "RAG Evidence Agent",
    shortName: "RAG 근거",
    role: "전세 위험 체크리스트에서 관련 근거를 검색합니다.",
    preview: "전세가율, 등기부등본, 보증보험 체크리스트 매칭",
    Icon: FileSearch,
    logs: [
      "사용자 질문에서 계약 전 확인 의도와 리스크 키워드를 추출합니다.",
      "RAG 체크리스트에서 등기부등본, 선순위 권리, 보증보험 근거를 검색합니다.",
      "실제 데이터로 확정된 항목과 아직 확인되지 않은 항목을 분리합니다."
    ]
  },
  {
    name: "Search Context Agent",
    shortName: "외부 검색",
    role: "네이버 검색 API로 대상 주소와 단지 주변의 공개 웹·뉴스 맥락을 수집합니다.",
    preview: "웹 검색 tool · 뉴스 검색 tool · 외부 참고 근거 후보",
    Icon: Search,
    logs: [
      "입력 주소, 주택 유형, 계약 유형으로 네이버 검색 쿼리를 구성합니다.",
      "웹 검색 tool로 단지·주소 관련 공개 문서 후보를 수집합니다.",
      "뉴스 검색 tool로 최신 이슈와 지역 부동산 맥락 후보를 확인합니다.",
      "검색 결과는 공식 실거래가가 아닌 보조 근거로 분리해 전달합니다."
    ]
  },
  {
    name: "Location Context Agent",
    shortName: "위치 맥락",
    role: "대상 주소와 주변 표본 marker를 지도 맥락으로 구성합니다.",
    preview: "네이버 지오코딩 · 대상 marker · 주변 marker",
    Icon: MapPinned,
    logs: [
      "네이버 지도 지오코딩으로 입력 주소의 좌표를 확인합니다.",
      "대상 좌표와 실거래 표본 marker를 같은 지도 맥락에 배치합니다.",
      "좌표 또는 표본 부족이 있으면 리포트의 데이터 상태에 fallback 근거를 남깁니다."
    ]
  },
  {
    name: "Building Register Agent",
    shortName: "건축물대장",
    role: "건축HUB 표제부에서 건물 용도, 사용승인일, 위반건축물 여부를 확인합니다.",
    preview: "표제부 조회 · 주용도 · 사용승인일 · 위반건축물 여부",
    Icon: FileBadge,
    logs: [
      "법정동코드와 지번을 건축HUB 조회 파라미터로 변환합니다.",
      "건축물대장 표제부 API를 호출해 건물 기본 정보를 확인합니다.",
      "주용도, 사용승인일, 위반건축물 여부를 리포트 근거로 분리합니다.",
      "호실별 전유부나 등기부등본이 필요한 항목은 미확인으로 남깁니다."
    ]
  },
  {
    name: "Registry Agent",
    shortName: "등기 권리",
    role: "CODEF 등기부등본 API로 권리관계 조회 준비 상태와 근저당·압류·신탁 후보를 확인합니다.",
    preview: "유료 열람 분리 · 직접인증 입력값 점검 · 민감정보 마스킹",
    Icon: FileKey2,
    logs: [
      "자동 분석에서는 수수료 가능성이 있는 등기 열람 호출을 실행하지 않습니다.",
      "등기부등본 endpoint와 직접인증 입력값 준비 여부를 확인합니다.",
      "응답 원문에서 소유자명, 등기번호, 인증값 등 민감정보를 마스킹합니다.",
      "근저당권, 압류/가압류, 신탁등기, 전세권 후보를 권리 리스크로 분리합니다."
    ]
  },
  {
    name: "Risk Scoring Agent",
    shortName: "위험 산정",
    role: "전세가율, 표본 신뢰도, 권리관계 미확인을 분리해 점수를 산정합니다.",
    preview: "전세가율 기준 점수 · 권리관계 보수 보정",
    Icon: ShieldCheck,
    logs: [
      "실거래 매매가 기준 전세가율을 위험 점수의 주 기준으로 적용합니다.",
      "가격 기준 위험과 등기부등본·선순위 권리 미확인을 별도 신호로 분리합니다.",
      "mock 또는 fallback에서 남은 오래된 위험 문구를 최신 API 결과와 동기화합니다."
    ]
  },
  {
    name: "Report Agent",
    shortName: "리포트 생성",
    role: "대시보드와 문서형 리포트 문장을 조립합니다.",
    preview: "핵심 위험 신호, 다음 액션, 주의 문구 생성",
    Icon: Sparkles,
    logs: [
      "확인된 사실, 가정, 미확인 항목을 리포트 섹션으로 조립합니다.",
      "대시보드형, 문서형, Agent 검토 탭에 전달할 결과를 정리합니다.",
      "다운로드 가능한 문서형 리포트 구조를 생성합니다."
    ]
  },
  {
    name: "Validation Agent",
    shortName: "최종 검증",
    role: "단정 표현과 데이터 불일치를 점검해 안전한 최종 리포트로 정리합니다.",
    preview: "단정 표현 차단 · 미확인 항목 유지 · 최종 리포트 검수",
    Icon: FileCheck2,
    logs: [
      "계약 가능/안전 같은 단정 표현이 남아 있는지 점검합니다.",
      "데이터 조회 상태와 위험 문구가 서로 충돌하지 않는지 확인합니다.",
      "최종 리포트에 전문가 검토와 보증보험 확인 문구를 유지합니다."
    ]
  }
];

const pipelineItems: Array<[string, string, LucideIcon]> = agentSteps.slice(0, 4).map((step) => [
  step.shortName,
  step.role,
  step.Icon
]);

type AnalysisStage = "idle" | "analyzing" | "report";

const logDelayMs = 380;

function dataMode(statuses: DataSourceStatus[] | undefined) {
  const items = statuses ?? [];
  if (items.length === 0) return "Fallback 분석";
  const successCount = items.filter((item) => item.status === "success").length;
  const fallbackCount = items.filter((item) => item.status !== "success").length;
  if (successCount > 0 && fallbackCount > 0) return "Hybrid 분석";
  if (successCount > 0) return "API 분석";
  return "Fallback 분석";
}

function statusSummary(report: AnalyzeResponse | null) {
  if (!report) {
    return {
      label: "API/fallback ready",
      detail: "주소, 법정동코드, 실거래가 API를 우선 조회하고 부족한 구간은 대체 표본으로 표시합니다.",
      tone: "border-moss/25 bg-moss/10"
    };
  }

  const mode = dataMode(report.data_statuses);
  const fallbackCount = (report.data_statuses ?? []).filter((item) => item.status !== "success").length;

  return {
    label: mode,
    detail:
      fallbackCount > 0
        ? `${fallbackCount}개 데이터 소스는 표본 없음/대체 표본 상태입니다. 리포트의 데이터 조회 상태에서 근거를 확인하세요.`
        : "핵심 데이터 소스가 API 조회 결과로 반영되었습니다.",
    tone: mode === "API 분석" ? "border-moss/25 bg-moss/10" : "border-brass/30 bg-brass/10"
  };
}

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function getInitialDarkMode() {
  if (typeof window === "undefined") return false;
  const savedTheme = window.localStorage.getItem("trust-ark-theme");
  if (savedTheme) return savedTheme === "dark";
  return window.matchMedia("(prefers-color-scheme: dark)").matches;
}

function logsBeforeStep(stepIndex: number) {
  return agentSteps.slice(0, stepIndex).reduce((sum, step) => sum + step.logs.length, 0);
}

function activeStepFromLogCount(logCount: number) {
  let cursor = 0;
  for (let index = 0; index < agentSteps.length; index += 1) {
    cursor += agentSteps[index].logs.length;
    if (logCount <= cursor) return index;
  }
  return agentSteps.length - 1;
}

function AnalyzingPanel({ activeStep, visibleLogCount }: { activeStep: number; visibleLogCount: number }) {
  const totalLogCount = agentSteps.reduce((sum, step) => sum + step.logs.length, 0);
  const progress = Math.min(100, Math.round((visibleLogCount / totalLogCount) * 100));
  const currentAgent = agentSteps[activeStep] ?? agentSteps[agentSteps.length - 1];
  const CurrentIcon = currentAgent.Icon;
  const visibleLogs = agentSteps.flatMap((step) => step.logs.map((message) => ({ agent: step.name, message }))).slice(0, visibleLogCount);
  const latestLog = visibleLogs[visibleLogs.length - 1];

  return (
    <section className="dashboard-panel overflow-hidden p-0">
      <div className="border-b border-ink/10 bg-ink px-6 py-5 text-white">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-md bg-white/10 text-white">
            <LoaderCircle aria-hidden="true" size={21} className="animate-spin" />
          </span>
          <div>
            <p className="text-xs font-black uppercase tracking-[0.18em] text-white/55">Trust Ark Agent Runtime</p>
            <h2 className="mt-1 text-xl font-bold">리스크 분석 진행 중</h2>
            <p className="mt-1 text-sm text-white/68">RAG와 전문 Agent가 계약 리스크 근거를 단계별로 조립하고 있습니다.</p>
          </div>
          <div className="ml-auto hidden rounded-md border border-white/15 bg-white/10 px-3 py-2 text-sm font-black md:block">
            {progress}% 완료
          </div>
        </div>
        <div className="mt-5 grid gap-3 lg:grid-cols-[1fr_1fr]">
          <div className="rounded-md border border-white/15 bg-white/10 p-4">
            <div className="flex items-center gap-3">
              <span className="grid h-10 w-10 place-items-center rounded-md bg-moss text-white">
                <CurrentIcon aria-hidden="true" size={18} />
              </span>
              <div>
                <p className="text-xs font-black text-white/45">현재 실행 Agent</p>
                <p className="font-black">{currentAgent.name}</p>
              </div>
            </div>
            <p className="mt-3 text-sm leading-6 text-white/70">{currentAgent.role}</p>
            <p className="mt-3 rounded-md bg-white/10 px-3 py-2 text-xs font-bold text-white/75">{currentAgent.preview}</p>
          </div>
          <div className="rounded-md border border-white/15 bg-white/10 p-4">
            <div className="mb-2 flex items-center justify-between gap-3">
              <p className="text-xs font-black text-white/45">Live Trace</p>
              <span className="rounded-md bg-white/10 px-2 py-1 text-[0.68rem] font-black text-white/60">latest</span>
            </div>
            <p className="text-sm font-black text-mint">{latestLog?.agent ?? currentAgent.name}</p>
            <p className="mt-2 text-sm leading-6 text-white/75">{latestLog?.message ?? "Agent runtime을 준비하고 있습니다."}</p>
          </div>
        </div>
        <div className="mt-5 h-2 overflow-hidden rounded-full bg-white/10">
          <div className="h-full rounded-full bg-moss transition-all duration-700" style={{ width: `${progress}%` }} />
        </div>
        <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-3 xl:grid-cols-6">
          {agentSteps.map((step, index) => {
            const done = visibleLogCount >= logsBeforeStep(index + 1);
            const active = index === activeStep && !done;
            const NodeIcon = done ? CheckCircle2 : step.Icon;

            return (
              <div key={`node-${step.name}`} className={`rounded-md border px-3 py-2 ${active ? "border-moss bg-moss/20" : "border-white/15 bg-white/10"}`}>
                <div className="flex items-center gap-2">
                  <NodeIcon aria-hidden="true" size={14} className={active ? "text-mint" : "text-white/70"} />
                  <span className="truncate text-[0.68rem] font-black text-white/75">{step.shortName}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <div className="grid gap-0 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Bot aria-hidden="true" size={19} className="text-moss" />
            <h3 className="font-black text-ink">Agent 실행 타임라인</h3>
          </div>
          <div className="grid gap-3">
            {agentSteps.map((step, index) => {
          const stepStart = logsBeforeStep(index);
          const stepEnd = logsBeforeStep(index + 1);
          const done = visibleLogCount >= stepEnd;
          const active = index === activeStep && !done;
              const waiting = index > activeStep;
              const StepIcon = done ? CheckCircle2 : active ? LoaderCircle : step.Icon;
              const stepProgress = Math.max(0, Math.min(step.logs.length, visibleLogCount - stepStart));

          return (
            <div
                  key={step.name}
                  className={`rounded-md border p-4 transition ${
                    active
                      ? "border-moss/50 bg-moss/10 shadow-sm"
                      : done
                        ? "border-moss/25 bg-white"
                        : "border-ink/10 bg-paper/55 opacity-70"
              }`}
            >
                  <div className="flex items-start gap-3">
              <span className={`grid h-10 w-10 place-items-center rounded-md ${done ? "bg-moss text-white" : "bg-moss/10 text-moss"}`}>
                <StepIcon aria-hidden="true" size={18} className={active ? "animate-spin" : ""} />
              </span>
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <strong className="text-sm text-ink">{step.name}</strong>
                        <span className="rounded-md bg-white px-2 py-0.5 text-[0.68rem] font-black text-ink/50 shadow-sm">
                          {done ? "완료" : active ? "실행 중" : "대기"}
                        </span>
                      </div>
                      <p className="mt-1 text-xs leading-5 text-ink/62">{step.role}</p>
                      {!waiting ? <p className="mt-3 rounded-md bg-white/80 px-3 py-2 text-xs font-bold text-ink/68">{step.preview}</p> : null}
                      {!waiting ? (
                        <div className="mt-3 flex gap-1">
                          {step.logs.map((log) => (
                            <span
                              key={log}
                              className={`h-1.5 flex-1 rounded-full ${step.logs.indexOf(log) < stepProgress ? "bg-moss" : "bg-ink/10"}`}
                            />
                          ))}
                        </div>
                      ) : null}
                    </div>
                  </div>
            </div>
          );
        })}
          </div>
        </div>

        <div className="border-t border-ink/10 bg-paper/70 p-5 sm:p-6 xl:border-l xl:border-t-0">
          <div className="mb-4 flex items-center justify-between gap-3">
            <h3 className="font-black text-ink">Live Trace</h3>
            <span className="rounded-md bg-ink px-2.5 py-1 text-xs font-bold text-white">agent runtime</span>
          </div>
          <div className="grid max-h-[31rem] gap-2 overflow-y-auto pr-2 pb-1">
            {visibleLogs.map((item, index) => (
              <div key={`${item.agent}-${item.message}`} className="rounded-md border border-ink/10 bg-white p-3 text-sm shadow-sm animate-in fade-in slide-in-from-bottom-1 duration-300">
                <div className="mb-1 flex items-center gap-2 text-[0.68rem] font-black uppercase text-moss">
                  <span>{String(index + 1).padStart(2, "0")}</span>
                  <span>{item.agent}</span>
                </div>
                <p className="text-ink/75">{item.message}</p>
              </div>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}

export default function Home() {
  const [report, setReport] = useState<AnalyzeResponse | null>(null);
  const [lastPayload, setLastPayload] = useState<AnalyzeRequest | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<AnalysisStage>("idle");
  const [activeStep, setActiveStep] = useState(0);
  const [visibleLogCount, setVisibleLogCount] = useState(0);
  const [darkMode, setDarkMode] = useState(getInitialDarkMode);
  const sidebarStatus = statusSummary(report);

  useEffect(() => {
    window.localStorage.setItem("trust-ark-theme", darkMode ? "dark" : "light");
  }, [darkMode]);

  async function handleAnalyze(payload: AnalyzeRequest) {
    setLoading(true);
    setError(null);
    setReport(null);
    setLastPayload(payload);
    setStage("analyzing");
    setActiveStep(0);
    setVisibleLogCount(0);

    try {
      const analysisPromise = analyzeContract(payload);
      const totalLogCount = agentSteps.reduce((sum, step) => sum + step.logs.length, 0);
      for (let count = 1; count <= totalLogCount; count += 1) {
        setVisibleLogCount(count);
        setActiveStep(activeStepFromLogCount(count));
        await wait(logDelayMs);
      }
      const result = await analysisPromise;
      setVisibleLogCount(totalLogCount);
      setActiveStep(agentSteps.length - 1);
      setReport(result);
      setStage("report");
    } catch (err) {
      setError(err instanceof Error ? err.message : "알 수 없는 오류가 발생했습니다.");
      setStage("idle");
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <a href="#main" className="skip-link">본문으로 이동</a>
      <div className={`theme-shell ${darkMode ? "dark" : ""}`}>
      <main id="main" className="mx-auto grid min-h-screen w-full max-w-[1440px] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[21rem_1fr] lg:px-8">
        <header className="lg:sticky lg:top-5 lg:h-[calc(100vh-2.5rem)]">
          <div className="dashboard-panel flex h-full flex-col p-5">
            <div className="border-b border-ink/10 pb-5">
              <div className="flex items-center justify-between gap-3">
                <p className="text-xs font-black uppercase text-moss">Trust Ark</p>
                <button
                  type="button"
                  onClick={() => setDarkMode((value) => !value)}
                  aria-pressed={darkMode}
                  aria-label={darkMode ? "라이트 모드로 전환" : "다크 모드로 전환"}
                  title={darkMode ? "라이트 모드" : "다크 모드"}
                  className="inline-flex h-11 w-11 items-center justify-center rounded-md border border-ink/10 bg-paper text-ink shadow-sm transition hover:border-moss/35 hover:bg-mint/45"
                >
                  {darkMode ? <Sun aria-hidden="true" size={18} /> : <Moon aria-hidden="true" size={18} />}
                </button>
              </div>
              <h1 className="mt-3 whitespace-nowrap font-serif text-[2.35rem] font-black leading-tight text-ink">
                트러스트 아크
              </h1>
              <p className="mt-2 text-sm font-bold text-moss">부동산 계약 리스크 코파일럿</p>
              <p className="mt-4 text-sm leading-6 text-ink/68">
                계약 조건을 입력하면 실거래가 API, 대체 표본, RAG 체크리스트, Agent 흐름으로 리스크 신호를 분리합니다.
              </p>
            </div>

            <section className="mt-5" aria-labelledby="pipeline-title">
              <h2 id="pipeline-title" className="text-sm font-bold text-ink/80">분석 파이프라인</h2>
              <div className="mt-3 grid gap-2">
                {pipelineItems.map(([title, desc, Icon], index) => {
                  const done = stage === "report" || (stage === "analyzing" && index < activeStep);
                  const active = stage === "analyzing" && index === activeStep;
                  const StepIcon = done ? CheckCircle2 : active ? LoaderCircle : Icon;

                  return (
                  <div key={title} className={`metric-tile flex items-center gap-3 p-3 transition ${active ? "border-moss/50 bg-moss/10" : ""}`}>
                    <span className={`grid h-9 w-9 place-items-center rounded-md ${done ? "bg-moss text-white" : "bg-moss/10 text-moss"}`}>
                      <StepIcon aria-hidden="true" size={18} className={active ? "animate-spin" : ""} />
                    </span>
                    <span>
                      <strong className="block text-sm">{title}</strong>
                      <span className="text-xs text-ink/60">{desc}</span>
                    </span>
                  </div>
                  );
                })}
              </div>
            </section>

            <aside className="mt-auto pt-5">
              <div className={`rounded-lg border p-4 ${sidebarStatus.tone}`}>
                <div className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Activity aria-hidden="true" size={17} className="text-brass" />
                  {sidebarStatus.label}
                </div>
                <p className="mt-2 text-xs leading-5 text-ink/65">
                  {sidebarStatus.detail} 실제 계약 판단은 등기부등본, 보증보험, 전문가 검토가 함께 필요합니다.
                </p>
              </div>
            </aside>
          </div>
        </header>

        <div className="grid content-start gap-5">
          <AnalysisForm loading={loading} onSubmit={handleAnalyze} />
          {error ? (
            <p role="alert" className="rounded-lg border border-clay bg-clay/10 p-4 text-sm font-semibold text-clay">
              {error}
            </p>
          ) : null}
          <div aria-live="polite">
            {stage === "analyzing" ? (
              <AnalyzingPanel activeStep={activeStep} visibleLogCount={visibleLogCount} />
            ) : report ? (
              <RiskReport report={report} payload={lastPayload} onReportUpdate={setReport} />
            ) : (
              <section className="dashboard-panel grid min-h-72 place-items-center p-8 text-center text-ink/68">
                <div>
                  <ShieldCheck aria-hidden="true" size={34} className="mx-auto mb-3 text-moss" />
                  <h2 className="text-xl font-bold text-ink">분석 결과 대기 중</h2>
                  <p className="mt-2 max-w-xl text-sm leading-6">
                    샘플 조건으로 분석을 실행하면 위험도, 시세 차이, 지도 marker, RAG 근거와 다음 액션이 이 영역에 정리됩니다.
                  </p>
                </div>
              </section>
            )}
          </div>
        </div>
      </main>
      </div>
    </>
  );
}
