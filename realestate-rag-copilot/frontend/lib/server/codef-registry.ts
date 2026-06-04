import type { AnalyzeRequest, AnalyzeResponse, RegistryRiskFlag, RegistryView } from "@/lib/types";
import { serverEnv } from "./env";
import type { LegalDongCode } from "./legal-dong";
import { publicEncrypt } from "node:crypto";
import { getPropertyTypeGroup } from "@/lib/property-types";

const CODEF_TOKEN_URL = "https://oauth.codef.io/oauth/token";

type CodefToken = {
  access_token?: unknown;
  expires_in?: unknown;
  token_type?: unknown;
};

type CodefResult = {
  result?: {
    code?: unknown;
    message?: unknown;
    extraMessage?: unknown;
  };
  data?: unknown;
};

export type CodefRegistryDiagnostics = {
  hasApiHost: boolean;
  hasPublicKey: boolean;
  hasClientId: boolean;
  hasClientSecret: boolean;
  hasConnectedId: boolean;
  hasRegistryEndpoint: boolean;
  hasRegistryPhoneNo: boolean;
  hasRegistryPassword: boolean;
  hasRegistryInquiryType: boolean;
  tokenHttpStatus?: number;
  tokenOk?: boolean;
  apiHttpStatus?: number;
  resultCode?: string;
  resultMessage?: string;
  isTwoWayRequired?: boolean;
  twoWayMethod?: string;
  skippedPaidLookup?: boolean;
  error?: string;
};

export type CodefRegistryLookupResult = {
  registry: RegistryView | null;
  diagnostics: CodefRegistryDiagnostics;
};

let cachedToken: { token: string; expiresAt: number } | null = null;

function safeText(value: unknown) {
  if (value === undefined || value === null) return undefined;
  if (typeof value === "string") return value.trim() || undefined;
  if (typeof value === "number" || typeof value === "boolean") return String(value);
  return undefined;
}

function safeNumber(value: unknown) {
  const text = safeText(value);
  if (!text) return null;
  const parsed = Number(text.replace(/[^\d.-]/g, ""));
  return Number.isFinite(parsed) ? parsed : null;
}

function maskName(value: unknown) {
  const text = safeText(value);
  if (!text) return undefined;
  if (text.length <= 1) return "*";
  if (text.length === 2) return `${text[0]}*`;
  return `${text[0]}${"*".repeat(Math.min(text.length - 2, 4))}${text.at(-1)}`;
}

function maskIdentifier(value: unknown) {
  const text = safeText(value);
  if (!text) return undefined;
  const visible = text.replace(/\s+/g, "").slice(-4);
  return visible ? `****-${visible}` : undefined;
}

function collectRecords(value: unknown): Array<Record<string, unknown>> {
  if (!value) return [];
  if (Array.isArray(value)) return value.flatMap((item) => collectRecords(item));
  if (typeof value !== "object") return [];

  const record = value as Record<string, unknown>;
  const rows = [record];
  Object.values(record).forEach((item) => {
    rows.push(...collectRecords(item));
  });
  return rows;
}

function containsAny(record: Record<string, unknown>, keywords: string[]) {
  const text = Object.values(record)
    .map((value) => safeText(value))
    .filter(Boolean)
    .join(" ");
  return keywords.some((keyword) => text.includes(keyword));
}

function firstValue(records: Array<Record<string, unknown>>, keys: string[]) {
  for (const record of records) {
    for (const key of keys) {
      const value = safeText(record[key]);
      if (value) return value;
    }
  }
  return undefined;
}

function sumByKeys(records: Array<Record<string, unknown>>, keys: string[]) {
  return records.reduce((sum, record) => {
    for (const key of keys) {
      const amount = safeNumber(record[key]);
      if (amount) return sum + amount;
    }
    return sum;
  }, 0);
}

function buildDiagnostics(): CodefRegistryDiagnostics {
  return {
    hasApiHost: Boolean(serverEnv.codefApiHost),
    hasPublicKey: Boolean(serverEnv.codefPublicKey),
    hasClientId: Boolean(serverEnv.codefClientId),
    hasClientSecret: Boolean(serverEnv.codefClientSecret),
    hasConnectedId: Boolean(serverEnv.codefConnectedId),
    hasRegistryEndpoint: Boolean(serverEnv.codefRegistryEndpoint),
    hasRegistryPhoneNo: Boolean(serverEnv.codefRegistryPhoneNo),
    hasRegistryPassword: Boolean(serverEnv.codefRegistryPassword || serverEnv.codefRegistryPasswordRsa),
    hasRegistryInquiryType: Boolean(serverEnv.codefRegistryInquiryType)
  };
}

function normalizePublicKey(value: string) {
  if (value.includes("BEGIN PUBLIC KEY")) return value;
  const chunks = value.replace(/\s+/g, "").match(/.{1,64}/g)?.join("\n") ?? value;
  return `-----BEGIN PUBLIC KEY-----\n${chunks}\n-----END PUBLIC KEY-----`;
}

function encryptPassword() {
  if (serverEnv.codefRegistryPasswordRsa) return serverEnv.codefRegistryPasswordRsa;
  if (!serverEnv.codefRegistryPassword || !serverEnv.codefPublicKey) return undefined;

  const encrypted = publicEncrypt(
    {
      key: normalizePublicKey(serverEnv.codefPublicKey),
      padding: 1
    },
    Buffer.from(serverEnv.codefRegistryPassword, "utf8")
  );
  return encrypted.toString("base64");
}

function realtyTypeFor(payload: AnalyzeRequest) {
  if (serverEnv.codefRegistryRealtyType) return serverEnv.codefRegistryRealtyType;
  const group = getPropertyTypeGroup(payload.property_type);
  if (["apartment", "officetel", "rowhouse", "urban_living"].includes(group)) return "1";
  if (["detached", "multifamily", "mixed_use"].includes(group)) return "0";
  return "1";
}

function parseRoadAddress(address: string) {
  const cleaned = address.replace(/\([^)]*\)/g, " ").replace(/\s+/g, " ").trim();
  const parts = cleaned.split(" ");
  const sido = parts[0] ?? "";
  const sigungu = parts[1] ?? "";
  const buildingNumberIndex = parts.findIndex((part, index) => index >= 2 && /^\d+(?:-\d+)?$/.test(part));
  const roadName =
    buildingNumberIndex > 2
      ? parts.slice(2, buildingNumberIndex).join(" ")
      : parts.slice(2).find((part) => /(로|길|대로)$/.test(part)) ?? "";
  const buildingNumber = buildingNumberIndex >= 0 ? parts[buildingNumberIndex] : "";

  return {
    sido,
    sigungu,
    roadName,
    buildingNumber
  };
}

function registryRequestBody(payload: AnalyzeRequest, legalDong: LegalDongCode | null, encryptedPassword: string) {
  const inquiryType = serverEnv.codefRegistryInquiryType ?? "3";
  const road = parseRoadAddress(payload.address);

  return {
    organization: serverEnv.codefRegistryOrganization,
    phoneNo: serverEnv.codefRegistryPhoneNo,
    password: encryptedPassword,
    inquiryType,
    uniqueNo: null,
    realtyType: realtyTypeFor(payload),
    addr_sido: road.sido,
    address: inquiryType === "1" ? payload.address : null,
    recordStatus: "0",
    addr_dong: null,
    addr_lotNumber: null,
    inputSelect: null,
    buildingName: null,
    dong: null,
    ho: null,
    addr_sigungu: road.sigungu,
    addr_roadName: road.roadName,
    addr_buildingNumber: road.buildingNumber,
    jointMortgageJeonseYN: "1",
    tradingYN: "1",
    listNumber: null,
    electronicClosedYN: null,
    ePrepayNo: null,
    ePrepayPass: null,
    issueType: serverEnv.codefRegistryIssueType,
    startPageNo: null,
    pageCount: null,
    originData: null,
    originDataYN: "0",
    warningSkipYN: "0",
    registerSummaryYN: "1",
    applicationType: null,
    selectAddress: "0",
    isIdentityViewYn: "0",
    identityList: [{ reqIdentity: "" }],
    lawdCode: legalDong?.lawdCode,
    regionCode: legalDong?.regionCode
  };
}

function valueFromPath(value: unknown, key: string): unknown {
  if (!value || typeof value !== "object") return undefined;
  const record = value as Record<string, unknown>;
  if (record[key] !== undefined) return record[key];
  for (const child of Object.values(record)) {
    if (Array.isArray(child)) {
      for (const item of child) {
        const found = valueFromPath(item, key);
        if (found !== undefined) return found;
      }
    } else if (typeof child === "object" && child !== null) {
      const found = valueFromPath(child, key);
      if (found !== undefined) return found;
    }
  }
  return undefined;
}

async function requestCodefToken(diagnostics: CodefRegistryDiagnostics) {
  if (cachedToken && cachedToken.expiresAt > Date.now() + 60_000) return cachedToken.token;
  if (!serverEnv.codefClientId || !serverEnv.codefClientSecret) return null;

  const auth = Buffer.from(`${serverEnv.codefClientId}:${serverEnv.codefClientSecret}`).toString("base64");
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 7000);

  try {
    const response = await fetch(CODEF_TOKEN_URL, {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${auth}`
      },
      body: "grant_type=client_credentials&scope=read"
    });
    diagnostics.tokenHttpStatus = response.status;
    const tokenResult = (await response.json().catch(() => null)) as CodefToken | null;
    const token = safeText(tokenResult?.access_token);
    diagnostics.tokenOk = response.ok && Boolean(token);

    if (!response.ok || !token) {
      diagnostics.error = `CODEF token failed · HTTP ${response.status}`;
      return null;
    }

    const expiresIn = safeNumber(tokenResult?.expires_in) ?? 604799;
    cachedToken = {
      token,
      expiresAt: Date.now() + Math.max(60, expiresIn - 300) * 1000
    };
    return token;
  } catch (error) {
    diagnostics.tokenOk = false;
    diagnostics.error = error instanceof Error ? error.message.slice(0, 120) : "CODEF token request failed";
    return null;
  } finally {
    clearTimeout(timeout);
  }
}

function endpointUrl(path: string) {
  const host = (serverEnv.codefApiHost ?? "https://development.codef.io").replace(/\/+$/, "");
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  return `${host}${normalizedPath}`;
}

function summarizeRegistry(data: unknown, payload: AnalyzeRequest): RegistryView {
  const records = collectRecords(data);
  const mortgageRecords = records.filter((record) => containsAny(record, ["근저당", "저당권"]));
  const attachmentRecords = records.filter((record) => containsAny(record, ["압류", "가압류"]));
  const trustRegistered = records.some((record) => containsAny(record, ["신탁"]));
  const leaseRightRegistered = records.some((record) => containsAny(record, ["전세권", "임차권"]));
  const seniorClaimAmount = sumByKeys(mortgageRecords, ["amount", "claimAmount", "maxBondAmount", "채권최고액", "금액"]);
  const flags: RegistryRiskFlag[] = [];

  if (mortgageRecords.length > 0) {
    flags.push({
      type: "mortgage",
      severity: "높음",
      title: "근저당권 후보 확인",
      detail: `등기 데이터에서 근저당/저당권 관련 항목 ${mortgageRecords.length}건이 감지되었습니다.`,
      amount: seniorClaimAmount || null
    });
  }
  if (attachmentRecords.length > 0) {
    flags.push({
      type: "attachment",
      severity: "높음",
      title: "압류/가압류 후보 확인",
      detail: `등기 데이터에서 압류 또는 가압류 관련 항목 ${attachmentRecords.length}건이 감지되었습니다.`
    });
  }
  if (trustRegistered) {
    flags.push({
      type: "trust",
      severity: "높음",
      title: "신탁등기 후보 확인",
      detail: "등기 데이터에서 신탁 관련 문구가 감지되었습니다. 임대 권한과 동의 조건 확인이 필요합니다."
    });
  }
  if (leaseRightRegistered) {
    flags.push({
      type: "lease_right",
      severity: "확인 필요",
      title: "전세권/임차권 등기 후보 확인",
      detail: "등기 데이터에서 전세권 또는 임차권 관련 문구가 감지되었습니다."
    });
  }

  return {
    status: "confirmed",
    address: payload.address,
    ownerMasked: maskName(firstValue(records, ["owner", "ownerName", "소유자", "성명"])),
    registryNumberMasked: maskIdentifier(firstValue(records, ["registryNumber", "pin", "uniqueNo", "고유번호", "등기번호"])),
    issuedAt: firstValue(records, ["issueDate", "issuedAt", "발급일", "열람일"]),
    seniorClaimAmount: seniorClaimAmount || null,
    mortgageCount: mortgageRecords.length,
    attachmentCount: attachmentRecords.length,
    trustRegistered,
    leaseRightRegistered,
    flags,
    note:
      flags.length > 0
        ? "등기부등본 응답에서 권리 리스크 후보가 감지되었습니다. 원문 대조와 전문가 확인이 필요합니다."
        : "등기부등본 응답에서 주요 권리 리스크 후보는 감지되지 않았습니다. 원문 확인은 계속 필요합니다."
  };
}

export async function lookupCodefRegistry({
  payload,
  legalDong,
  allowPaidLookup = false
}: {
  payload: AnalyzeRequest;
  legalDong: LegalDongCode | null;
  allowPaidLookup?: boolean;
}): Promise<CodefRegistryLookupResult> {
  const diagnostics = buildDiagnostics();

  if (!diagnostics.hasClientId || !diagnostics.hasClientSecret || !diagnostics.hasPublicKey) {
    diagnostics.error = "CODEF credentials are not fully configured";
    return { registry: null, diagnostics };
  }

  if (!allowPaidLookup) {
    diagnostics.skippedPaidLookup = true;
    diagnostics.error = "CODEF registry lookup requires explicit user action";
    return {
      registry: {
        status: "requires_user_action",
        address: payload.address,
        flags: [],
        note: "등기부등본 열람은 수수료와 추가인증이 발생할 수 있어 자동 분석에서는 실행하지 않았습니다. 사용자가 별도 실행을 명시해야 합니다."
      },
      diagnostics
    };
  }

  const token = await requestCodefToken(diagnostics);
  if (!token) return { registry: null, diagnostics };

  if (!diagnostics.hasRegistryEndpoint) {
    diagnostics.error = "CODEF_REGISTRY_ENDPOINT is not configured";
    return { registry: null, diagnostics };
  }

  if (!diagnostics.hasRegistryPhoneNo || !diagnostics.hasRegistryPassword || !diagnostics.hasRegistryInquiryType) {
    diagnostics.error = "CODEF registry direct auth parameters are not fully configured";
    return { registry: null, diagnostics };
  }

  const encryptedPassword = encryptPassword();
  if (!encryptedPassword) {
    diagnostics.error = "CODEF registry password encryption failed";
    return { registry: null, diagnostics };
  }

  const body = registryRequestBody(payload, legalDong, encryptedPassword);

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(endpointUrl(serverEnv.codefRegistryEndpoint!), {
      method: "POST",
      cache: "no-store",
      signal: controller.signal,
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`
      },
      body: encodeURIComponent(JSON.stringify(body))
    });
    diagnostics.apiHttpStatus = response.status;
    const decoded = decodeURIComponent(await response.text());
    const data = JSON.parse(decoded) as CodefResult;
    diagnostics.resultCode = safeText(data.result?.code);
    diagnostics.resultMessage = safeText(data.result?.message) ?? safeText(data.result?.extraMessage);
    diagnostics.isTwoWayRequired = safeText(valueFromPath(data.data, "continue2Way")) === "true" || valueFromPath(data.data, "continue2Way") === true || diagnostics.resultCode === "CF-03002";
    diagnostics.twoWayMethod = safeText(valueFromPath(data.data, "method"));

    if (diagnostics.isTwoWayRequired) {
      diagnostics.error = `추가인증 필요${diagnostics.twoWayMethod ? ` · ${diagnostics.twoWayMethod}` : ""}`;
      return { registry: null, diagnostics };
    }

    if (!response.ok || diagnostics.resultCode !== "CF-00000") {
      diagnostics.error = diagnostics.resultMessage ?? `CODEF registry request failed · HTTP ${response.status}`;
      return { registry: null, diagnostics };
    }

    return { registry: summarizeRegistry(data.data, payload), diagnostics };
  } catch (error) {
    diagnostics.error = error instanceof Error ? error.message.slice(0, 120) : "CODEF registry request failed";
    return { registry: null, diagnostics };
  } finally {
    clearTimeout(timeout);
  }
}

export function applyRegistrySummary(report: AnalyzeResponse, registry: RegistryView) {
  const highFlags = registry.flags.filter((flag) => flag.severity === "높음");
  const seniorClaimText = registry.seniorClaimAmount ? `${registry.seniorClaimAmount.toLocaleString("ko-KR")}원` : "금액 미확인";
  const adjustedScore = highFlags.length > 0 ? Math.max(report.risk_score, 82) : report.risk_score;

  return {
    ...report,
    registry,
    risk_score: adjustedScore,
    risk_level: adjustedScore >= 75 ? "근거 매우 부족" : adjustedScore >= 60 ? "근거 보강 필요" : report.risk_level,
    summary:
      highFlags.length > 0
        ? `${report.summary} 등기부등본에서 권리 리스크 후보가 확인되어 원문 대조와 전문가 검토가 필요합니다.`
        : `${report.summary} 등기부등본 요약은 민감정보를 마스킹해 반영했습니다.`,
    evidence: [
      {
        title: "CODEF 등기부등본 권리관계 조회",
        description: `등기 응답에서 근저당 ${registry.mortgageCount ?? 0}건, 압류/가압류 ${registry.attachmentCount ?? 0}건, 신탁 ${registry.trustRegistered ? "후보 있음" : "후보 없음"}으로 요약했습니다. 소유자와 등기번호는 마스킹했습니다.`,
        source: "codef:registry"
      },
      ...report.evidence
    ],
    risk_signals: [
      ...registry.flags.map((flag) => ({
        severity: flag.severity,
        title: flag.title,
        metric: flag.amount ? `${flag.amount.toLocaleString("ko-KR")}원` : seniorClaimText,
        description: flag.detail,
        source: "codef:registry"
      })),
      ...(report.risk_signals ?? [])
    ],
    next_actions: [
      "등기부등본 갑구·을구 원문에서 소유자, 근저당권, 압류, 신탁, 전세권 항목을 직접 대조",
      ...report.next_actions
    ],
    sections: {
      ...report.sections,
      confirmed_facts: [
        `등기부등본 요약: 근저당 ${registry.mortgageCount ?? 0}건 · 압류/가압류 ${registry.attachmentCount ?? 0}건 · 신탁 ${registry.trustRegistered ? "후보 있음" : "후보 없음"}`,
        ...report.sections.confirmed_facts
      ],
      unverified_items: [
        "등기부등본 원문 민감정보는 화면과 문서에서 마스킹 처리했습니다.",
        ...report.sections.unverified_items
      ]
    }
  } satisfies AnalyzeResponse;
}
