import type { AnalyzeRequest, AnalyzeResponse, DataSourceStatus } from "@/lib/types";
import { applyRegistrySummary, lookupCodefRegistry, type CodefRegistryDiagnostics } from "@/lib/server/codef-registry";
import type { LegalDongCode } from "@/lib/server/legal-dong";
import type { TraceRecorder } from "../trace";

const REGISTRY_AGENT = "Registry Agent" as const;

export const registryAgentAllowedTools = ["requestCodefToken", "lookupRegistryDocument", "maskSensitiveDocumentFields"] as const;

type RegistryTool = (typeof registryAgentAllowedTools)[number];

function assertAllowedTool(tool: string): asserts tool is RegistryTool {
  if (!registryAgentAllowedTools.includes(tool as RegistryTool)) {
    throw new Error(`${REGISTRY_AGENT} cannot call tool: ${tool}`);
  }
}

function upsertStatus(statuses: DataSourceStatus[] | undefined, status: DataSourceStatus) {
  const current = statuses ?? [];
  const existingIndex = current.findIndex((item) => item.id === status.id);
  if (existingIndex < 0) return [...current, status];
  return current.map((item, index) => (index === existingIndex ? status : item));
}

function diagnosticSummary(diagnostics: CodefRegistryDiagnostics) {
  const configured = [
    diagnostics.hasApiHost ? "host" : null,
    diagnostics.hasClientId ? "client_id" : null,
    diagnostics.hasClientSecret ? "secret" : null,
    diagnostics.hasPublicKey ? "public_key" : null
  ].filter(Boolean).length;
  const token = diagnostics.tokenHttpStatus ? ` · token HTTP ${diagnostics.tokenHttpStatus}` : "";
  const api = diagnostics.apiHttpStatus ? ` · api HTTP ${diagnostics.apiHttpStatus}` : "";
  const result = diagnostics.resultCode ? ` · ${diagnostics.resultCode}` : "";
  if (diagnostics.isTwoWayRequired) {
    return `민감정보 마스킹 · CODEF 추가인증 필요${diagnostics.twoWayMethod ? `(${diagnostics.twoWayMethod})` : ""}${token}${api}${result}`;
  }

  if (!diagnostics.hasRegistryEndpoint) {
    return `민감정보 마스킹 · CODEF 기본키 ${configured}/4개 설정${token} · 등기부등본 endpoint 미설정`;
  }
  if (!diagnostics.hasRegistryPhoneNo || !diagnostics.hasRegistryPassword || !diagnostics.hasRegistryInquiryType) {
    const missing = [
      diagnostics.hasRegistryPhoneNo ? null : "phoneNo",
      diagnostics.hasRegistryPassword ? null : "password",
      diagnostics.hasRegistryInquiryType ? null : "inquiryType"
    ].filter(Boolean).join(", ");
    return `민감정보 마스킹 · CODEF 기본키 ${configured}/4개 설정${token} · 등기 직접인증 입력값 미설정(${missing})`;
  }
  if (diagnostics.error) return `민감정보 마스킹 · ${diagnostics.error}${token}${api}${result}`;
  return `민감정보 마스킹 · CODEF 기본키 ${configured}/4개 설정${token}${api}${result}`;
}

export async function runRegistryAgent({
  report,
  payload,
  legalDong,
  trace
}: {
  report: AnalyzeResponse;
  payload: AnalyzeRequest;
  legalDong: LegalDongCode | null;
  trace: TraceRecorder;
}) {
  const tokenTool = "requestCodefToken";
  assertAllowedTool(tokenTool);

  const lookupTool = "lookupRegistryDocument";
  assertAllowedTool(lookupTool);

  const maskTool = "maskSensitiveDocumentFields";
  assertAllowedTool(maskTool);

  let result: Awaited<ReturnType<typeof lookupCodefRegistry>>;

  try {
    result = await trace.run(
      REGISTRY_AGENT,
      lookupTool,
      `address=${payload.address} · credentials=masked · 법정동=${legalDong?.regionCode ?? "unknown"}`,
      () => lookupCodefRegistry({ payload, legalDong }),
      (lookup) => ({
        status: lookup.registry ? "success" : lookup.diagnostics.hasRegistryEndpoint ? "missing" : "missing",
        outputSummary: lookup.registry
          ? `근저당 ${lookup.registry.mortgageCount ?? 0}건 · 압류 ${lookup.registry.attachmentCount ?? 0}건 · 민감정보 마스킹`
          : diagnosticSummary(lookup.diagnostics)
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "CODEF 등기부등본 조회 중 오류";
    return {
      ...report,
      data_statuses: upsertStatus(report.data_statuses, {
        id: "registry",
        label: "등기부등본",
        status: "failed",
        detail: `민감정보 마스킹 · ${message.slice(0, 90)}`
      }),
      sections: {
        ...report.sections,
        unverified_items: [`등기부등본 조회 오류: ${message.slice(0, 90)}`, ...report.sections.unverified_items]
      }
    } satisfies AnalyzeResponse;
  }

  trace.record(
    REGISTRY_AGENT,
    maskTool,
    "등본/서류 원문 민감정보",
    "소유자명, 등기번호, 인증값, 원문 식별자는 화면과 문서에서 마스킹",
    "success"
  );

  if (!result.registry) {
    return {
      ...report,
      registry: {
        status: "unverified",
        address: payload.address,
        flags: [],
        note: diagnosticSummary(result.diagnostics)
      },
      data_statuses: upsertStatus(report.data_statuses, {
        id: "registry",
        label: "등기부등본",
        status: result.diagnostics.hasClientId && result.diagnostics.hasClientSecret ? "missing" : "failed",
        detail: diagnosticSummary(result.diagnostics)
      }),
      next_actions: [
        result.diagnostics.isTwoWayRequired
          ? "CODEF 추가인증 응답(jobIndex, threadIndex, jti, twoWayTimestamp)을 사용해 2차 요청을 이어서 처리"
          : "CODEF 등기부등본 직접인증 입력값(phoneNo, RSA 암호화 password, inquiryType)을 확인한 뒤 권리관계 원문 조회를 재시도",
        ...report.next_actions
      ],
      sections: {
        ...report.sections,
        unverified_items: [
          "등기부등본 권리관계는 아직 원문으로 확인되지 않았습니다.",
          "등본·서류 원문 민감정보는 화면과 문서에서 마스킹해야 합니다.",
          ...report.sections.unverified_items
        ]
      }
    } satisfies AnalyzeResponse;
  }

  return {
    ...applyRegistrySummary(report, result.registry),
    data_statuses: upsertStatus(report.data_statuses, {
      id: "registry",
      label: "등기부등본",
      status: "success",
      detail: `민감정보 마스킹 · 근저당 ${result.registry.mortgageCount ?? 0}건 · 압류/가압류 ${result.registry.attachmentCount ?? 0}건`
    })
  } satisfies AnalyzeResponse;
}
