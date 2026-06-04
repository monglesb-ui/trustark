import type { AnalyzeRequest, BuildingRegisterView } from "@/lib/types";
import {
  lookupBuildingRegister,
  type BuildingRegisterSummary
} from "@/lib/server/building-register";
import {
  extractLegalDongQuery,
  lookupLegalDongCode,
  type LegalDongCode
} from "@/lib/server/legal-dong";
import type { GeocodeResult } from "@/lib/server/vworld";
import type { TraceRecorder } from "../trace";

const AGENT = "Building Register Agent" as const;

function toView(summary: BuildingRegisterSummary): BuildingRegisterView {
  return {
    address: summary.address,
    roadAddress: summary.roadAddress,
    buildingName: summary.buildingName,
    mainPurpose: summary.mainPurpose,
    etcPurpose: summary.etcPurpose,
    householdCount: summary.householdCount,
    familyCount: summary.familyCount,
    groundFloors: summary.groundFloors,
    undergroundFloors: summary.undergroundFloors,
    useApprovalDate: summary.useApprovalDate,
    violationBuilding: summary.violationBuilding
  };
}

export async function runBuildingRegisterLightAgent({
  payload,
  geocode,
  trace
}: {
  payload: AnalyzeRequest;
  geocode: GeocodeResult;
  trace: TraceRecorder;
}): Promise<BuildingRegisterView | null> {
  const address = payload.address ?? "";
  const legalDongQuery =
    typeof geocode?.result?.legalDong === "string" && geocode.result.legalDong.trim()
      ? geocode.result.legalDong
      : extractLegalDongQuery(address);

  const inputSummary = `query=${legalDongQuery.slice(0, 40)} addr=${address.slice(0, 30)}`;

  let legalDong: LegalDongCode | null = null;
  try {
    legalDong = await trace.run(
      AGENT,
      "lookupLegalDongCode",
      inputSummary,
      () => lookupLegalDongCode(legalDongQuery),
      (result) => ({
        status: result ? "success" : "missing",
        outputSummary: result
          ? `${result.regionCode} · LAWD_CD ${result.lawdCode} · ${result.addressName}`
          : "법정동 코드 조회 실패"
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "legal dong lookup failed";
    trace.record(AGENT, "lookupLegalDongCode", inputSummary, message.slice(0, 120), "failed");
    return null;
  }

  if (!legalDong) return null;

  const candidates = [
    geocode.result?.parcelAddress,
    geocode.result?.addressType === "parcel" ? geocode.result.address : undefined,
    geocode.result?.roadAddress,
    address
  ].filter((item): item is string => Boolean(item));

  try {
    return await trace.run(
      AGENT,
      "lookupBuildingRegister",
      `region=${legalDong.regionCode} · address=${candidates[0] ?? address}`,
      async () => {
        const result = await lookupBuildingRegister({ legalDong, addressCandidates: candidates });
        return result.summary ? toView(result.summary) : null;
      },
      (view) => ({
        status: view ? "success" : "missing",
        outputSummary: view
          ? `${view.buildingName ?? "이름 미확인"} · ${view.mainPurpose ?? "용도 미확인"} · 지상 ${view.groundFloors ?? "?"}층`
          : "건축물대장 표제부 0건"
      })
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "building register lookup failed";
    trace.record(AGENT, "lookupBuildingRegister", `region=${legalDong.regionCode}`, message.slice(0, 120), "failed");
    return null;
  }
}
