"use client";

import { useState } from "react";
import {
  Activity,
  Bot,
  CheckCircle2,
  Database,
  FileSearch,
  LoaderCircle,
  MapPinned,
  ShieldCheck,
  Sparkles
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnalysisForm } from "@/components/AnalysisForm";
import { RiskReport } from "@/components/RiskReport";
import { analyzeContract } from "@/lib/api";
import type { AnalyzeRequest, AnalyzeResponse } from "@/lib/types";

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
    role: "mock 거래 표본과 입력 보증금 차이를 비교합니다.",
    preview: "주변 전세 표본 4건 · 평균 보증금 2억 5,600만원",
    Icon: Database,
    logs: ["주소 기준 mock 좌표를 확인", "최근 주변 전세 표본 4건 로드", "입력 보증금과 평균 보증금 차이율 계산"]
  },
  {
    name: "RAG Evidence Agent",
    shortName: "RAG 근거",
    role: "전세 위험 체크리스트에서 관련 근거를 검색합니다.",
    preview: "전세가율, 등기부등본, 보증보험 체크리스트 매칭",
    Icon: FileSearch,
    logs: ["질문에서 전세 계약 전 확인 의도 추출", "rag_docs/jeonse_risk_checklist.md 검색", "계약 전 필수 확인 근거 2건 선택"]
  },
  {
    name: "Location Context Agent",
    shortName: "위치 맥락",
    role: "대상지와 주변 표본 marker를 구성합니다.",
    preview: "대상 marker 1개 · 주변 marker 4개 구성",
    Icon: MapPinned,
    logs: ["대상 주소를 샘플 좌표에 매핑", "주변 거래 표본을 지도 marker로 변환", "지도 API 미연결 시 데모 좌표 fallback 준비"]
  },
  {
    name: "Risk Scoring Agent",
    shortName: "안전 검증",
    role: "위험 점수와 미확인 항목을 분리합니다.",
    preview: "위험 점수 78 · 권리관계 미확인 · 전문가 검토 권장",
    Icon: ShieldCheck,
    logs: ["전세가율 위험 규칙 적용", "표본 부족 리스크를 별도 신호로 분리", "단정 표현을 참고 분석 문구로 완화"]
  },
  {
    name: "Report Agent",
    shortName: "리포트 생성",
    role: "대시보드와 문서형 리포트 문장을 조립합니다.",
    preview: "핵심 위험 신호, 다음 액션, 주의 문구 생성",
    Icon: Sparkles,
    logs: ["확인된 사실과 미확인 항목 정리", "다음 확인 액션 4개 작성", "다운로드 가능한 문서형 리포트 구성"]
  }
];

const pipelineItems: Array<[string, string, LucideIcon]> = agentSteps.slice(0, 4).map((step) => [
  step.shortName,
  step.role,
  step.Icon
]);

type AnalysisStage = "idle" | "analyzing" | "report";

const stepDelayMs = 820;

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function AnalyzingPanel({ activeStep }: { activeStep: number }) {
  const progress = Math.min(100, Math.round(((activeStep + 1) / agentSteps.length) * 100));
  const currentAgent = agentSteps[activeStep] ?? agentSteps[agentSteps.length - 1];
  const CurrentIcon = currentAgent.Icon;
  const visibleLogs = agentSteps.flatMap((step, stepIndex) =>
    step.logs
      .filter((_, logIndex) => stepIndex < activeStep || (stepIndex === activeStep && logIndex <= Math.min(1, activeStep)))
      .map((message) => ({ agent: step.name, message }))
  );
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
      </div>

      <div className="grid gap-0 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <Bot aria-hidden="true" size={19} className="text-moss" />
            <h3 className="font-black text-ink">Agent 실행 타임라인</h3>
          </div>
          <div className="grid gap-3">
            {agentSteps.map((step, index) => {
          const done = index < activeStep;
          const active = index === activeStep;
              const waiting = index > activeStep;
              const StepIcon = done ? CheckCircle2 : active ? LoaderCircle : step.Icon;

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
            <span className="rounded-md bg-ink px-2.5 py-1 text-xs font-bold text-white">mock runtime</span>
          </div>
          <div className="grid max-h-[31rem] gap-2 overflow-hidden">
            {visibleLogs.map((item, index) => (
              <div key={`${item.agent}-${item.message}`} className="rounded-md border border-ink/10 bg-white p-3 text-sm shadow-sm">
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
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [stage, setStage] = useState<AnalysisStage>("idle");
  const [activeStep, setActiveStep] = useState(0);

  async function handleAnalyze(payload: AnalyzeRequest) {
    setLoading(true);
    setError(null);
    setReport(null);
    setStage("analyzing");
    setActiveStep(0);

    try {
      const analysisPromise = analyzeContract(payload);
      for (let index = 0; index < agentSteps.length; index += 1) {
        setActiveStep(index);
        await wait(stepDelayMs);
      }
      const result = await analysisPromise;
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
      <main id="main" className="mx-auto grid min-h-screen w-full max-w-[1440px] gap-6 px-4 py-5 sm:px-6 lg:grid-cols-[21rem_1fr] lg:px-8">
        <header className="lg:sticky lg:top-5 lg:h-[calc(100vh-2.5rem)]">
          <div className="dashboard-panel flex h-full flex-col p-5">
            <div className="border-b border-ink/10 pb-5">
              <p className="text-xs font-black uppercase text-moss">Trust Ark</p>
              <h1 className="mt-3 whitespace-nowrap font-serif text-[2.35rem] font-black leading-tight text-ink">
                트러스트 아크
              </h1>
              <p className="mt-2 text-sm font-bold text-moss">부동산 계약 리스크 코파일럿</p>
              <p className="mt-4 text-sm leading-6 text-ink/68">
                계약 조건을 입력하면 mock 거래 데이터, RAG 체크리스트, Agent 흐름으로 리스크 신호를 분리합니다.
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
              <div className="rounded-lg border border-brass/30 bg-brass/10 p-4">
                <div className="flex items-center gap-2 text-sm font-bold text-ink">
                  <Activity aria-hidden="true" size={17} className="text-brass" />
                  Mock mode active
                </div>
                <p className="mt-2 text-xs leading-5 text-ink/65">
                  실제 계약 판단이 아니라 현재 데이터 기준의 참고 분석입니다. 등기부등본, 보증보험, 전문가 검토가 필요합니다.
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
              <AnalyzingPanel activeStep={activeStep} />
            ) : report ? (
              <RiskReport report={report} />
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
    </>
  );
}
