"use client";

import { useState } from "react";
import { Activity, CheckCircle2, Database, FileSearch, LoaderCircle, MapPinned, ShieldCheck } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { AnalysisForm } from "@/components/AnalysisForm";
import { RiskReport } from "@/components/RiskReport";
import { analyzeContract } from "@/lib/api";
import type { AnalyzeRequest, AnalyzeResponse } from "@/lib/types";

const pipelineItems: Array<[string, string, LucideIcon]> = [
  ["시세 표본", "mock 거래 평균 비교", Database],
  ["RAG 근거", "체크리스트 문서 검색", FileSearch],
  ["위치 맥락", "대상/주변 marker 구성", MapPinned],
  ["안전 검증", "단정 표현 차단", ShieldCheck]
];

type AnalysisStage = "idle" | "analyzing" | "report";

const stepDelayMs = 420;

function wait(ms: number) {
  return new Promise((resolve) => {
    window.setTimeout(resolve, ms);
  });
}

function AnalyzingPanel({ activeStep }: { activeStep: number }) {
  const progress = Math.min(100, Math.round(((activeStep + 1) / pipelineItems.length) * 100));

  return (
    <section className="dashboard-panel p-6">
      <div className="flex items-center gap-3">
        <span className="grid h-10 w-10 place-items-center rounded-md bg-moss/10 text-moss">
          <LoaderCircle aria-hidden="true" size={21} className="animate-spin" />
        </span>
        <div>
          <h2 className="text-xl font-bold text-ink">리스크 분석 진행 중</h2>
          <p className="mt-1 text-sm text-ink/62">Agent가 분석 파이프라인을 순차 실행하고 있습니다.</p>
        </div>
      </div>
      <div className="mt-5 h-2 overflow-hidden rounded-full bg-ink/10">
        <div className="h-full rounded-full bg-moss transition-all duration-500" style={{ width: `${progress}%` }} />
      </div>
      <div className="mt-5 grid gap-3 md:grid-cols-2">
        {pipelineItems.map(([title, desc, Icon], index) => {
          const done = index < activeStep;
          const active = index === activeStep;
          const StepIcon = done ? CheckCircle2 : active ? LoaderCircle : Icon;

          return (
            <div
              key={title}
              className={`metric-tile flex items-center gap-3 p-4 transition ${
                active ? "border-moss/50 bg-moss/10" : done ? "border-moss/30" : ""
              }`}
            >
              <span className={`grid h-10 w-10 place-items-center rounded-md ${done ? "bg-moss text-white" : "bg-moss/10 text-moss"}`}>
                <StepIcon aria-hidden="true" size={18} className={active ? "animate-spin" : ""} />
              </span>
              <span>
                <strong className="block text-sm">{title}</strong>
                <span className="text-xs text-ink/60">{desc}</span>
              </span>
              <span className="ml-auto text-xs font-bold text-ink/50">{done ? "완료" : active ? "분석 중" : "대기"}</span>
            </div>
          );
        })}
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
      for (let index = 0; index < pipelineItems.length; index += 1) {
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
