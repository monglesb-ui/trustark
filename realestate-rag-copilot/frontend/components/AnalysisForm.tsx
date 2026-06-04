"use client";

import { useState } from "react";
import { ChevronDown, ChevronRight, ClipboardCheck, Home, Search, Store, Building2 } from "lucide-react";
import { propertyTypeOptions, type PropertyType } from "@/lib/property-types";
import type {
  AnalysisMode,
  AnalyzeRequest,
  BusinessType,
  CommercialPurpose,
  ContractType,
  OperatingHours
} from "@/lib/types";

type Props = {
  loading: boolean;
  onSubmit: (payload: AnalyzeRequest) => void;
};

const MODE_TABS: Array<{ value: AnalysisMode; label: string; sub: string; Icon: typeof Home }> = [
  { value: "real_estate", label: "부동산 임차·매수", sub: "전세·월세·매매 검토", Icon: Home },
  { value: "business_permit", label: "창업·영업 적합성", sub: "이 자리에서 가능한지", Icon: Store },
  { value: "commercial_use", label: "상가 활용성", sub: "임대·매수 후 활용", Icon: Building2 }
];

const BUSINESS_TYPE_OPTIONS: Array<{ value: BusinessType; label: string }> = [
  { value: "restaurant", label: "음식점" },
  { value: "cafe", label: "카페" },
  { value: "beauty", label: "미용실·이용원" },
  { value: "academy", label: "학원·교습소" },
  { value: "pc_room", label: "PC방" },
  { value: "karaoke", label: "노래방" },
  { value: "other", label: "기타" }
];

const COMMERCIAL_PURPOSE_OPTIONS: Array<{ value: CommercialPurpose; label: string }> = [
  { value: "lease_out", label: "임대 주려고" },
  { value: "buy_and_use", label: "매수 후 활용" },
  { value: "business_location", label: "창업 입지 평가" }
];

const OPERATING_HOURS_OPTIONS: Array<{ value: OperatingHours; label: string }> = [
  { value: "day", label: "주간 (07~22시)" },
  { value: "all_day", label: "24시간" },
  { value: "late_night", label: "심야 포함 (22시 이후)" }
];

const SAMPLE_ADDRESS = "서울시 마포구 성산동 000-00";

export function AnalysisForm({ loading, onSubmit }: Props) {
  const [mode, setMode] = useState<AnalysisMode>("real_estate");
  const [showDetails, setShowDetails] = useState(false);

  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const address = String(form.get("address") || "").trim();
    const question = String(form.get("user_question") || "").trim();
    const base: AnalyzeRequest = { mode, address, user_question: question || undefined };

    if (mode === "real_estate") {
      onSubmit({
        ...base,
        contract_type: (form.get("contract_type") as ContractType) || "jeonse",
        property_type: (form.get("property_type") as PropertyType) || undefined,
        deposit: form.get("deposit") ? Number(form.get("deposit")) : undefined,
        monthly_rent: form.get("monthly_rent") ? Number(form.get("monthly_rent")) : undefined,
        sale_price: form.get("sale_price") ? Number(form.get("sale_price")) : null
      });
      return;
    }
    if (mode === "business_permit") {
      onSubmit({
        ...base,
        business_type: (form.get("business_type") as BusinessType) || "restaurant",
        store_area_sqm: form.get("store_area_sqm") ? Number(form.get("store_area_sqm")) : undefined,
        operating_hours: (form.get("operating_hours") as OperatingHours) || undefined,
        has_license: form.get("has_license") === "on"
      });
      return;
    }
    // commercial_use
    onSubmit({
      ...base,
      commercial_purpose: (form.get("commercial_purpose") as CommercialPurpose) || "buy_and_use",
      store_area_sqm: form.get("store_area_sqm") ? Number(form.get("store_area_sqm")) : undefined,
      budget: form.get("budget") ? Number(form.get("budget")) : undefined
    });
  }

  return (
    <form onSubmit={handleSubmit} className="dashboard-panel p-5 sm:p-6">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 pb-4">
        <div className="flex items-center gap-3">
          <span className="grid h-11 w-11 place-items-center rounded-md bg-moss text-white shadow-sm">
            <ClipboardCheck aria-hidden="true" size={22} />
          </span>
          <div>
            <h2 className="text-xl font-bold">검토 조건 입력</h2>
            <p className="text-sm text-ink/65">필수 2개만 채워도 터무니 검토를 시작합니다.</p>
          </div>
        </div>
        <span className="rounded-md border border-moss/20 bg-moss/10 px-3 py-1.5 text-xs font-bold text-moss">
          터무니 검토
        </span>
      </div>

      {/* 모드 탭 */}
      <div role="tablist" aria-label="검토 모드 선택" className="mb-5 grid grid-cols-3 gap-2">
        {MODE_TABS.map((tab) => {
          const active = mode === tab.value;
          const Icon = tab.Icon;
          return (
            <button
              key={tab.value}
              role="tab"
              type="button"
              aria-selected={active}
              onClick={() => {
                setMode(tab.value);
                setShowDetails(false);
              }}
              className={`flex flex-col items-start gap-1 rounded-md border px-3 py-2.5 text-left transition ${
                active
                  ? "border-moss/55 bg-moss/10 text-ink shadow-sm"
                  : "border-ink/15 bg-white text-ink/70 hover:border-moss/30 hover:bg-mint/30"
              }`}
            >
              <span className="flex items-center gap-1.5 text-sm font-black">
                <Icon aria-hidden="true" size={15} className={active ? "text-moss" : "text-ink/55"} />
                {tab.label}
              </span>
              <span className="text-[0.7rem] text-ink/55">{tab.sub}</span>
            </button>
          );
        })}
      </div>

      {/* 모드별 필수 필드 */}
      <fieldset className="grid gap-4">
        <legend className="sr-only">{MODE_TABS.find((t) => t.value === mode)?.label} 필수 입력</legend>

        {mode === "real_estate" ? (
          <>
            <label className="grid gap-2 text-sm font-medium">
              계약 유형 <span className="text-clay">*</span>
              <select name="contract_type" className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]" defaultValue="jeonse">
                <option value="jeonse">전세</option>
                <option value="monthly">월세</option>
                <option value="sale">매매</option>
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              주소 <span className="text-clay">*</span>
              <input
                name="address"
                required
                autoComplete="street-address"
                defaultValue={SAMPLE_ADDRESS}
                className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]"
              />
            </label>
          </>
        ) : null}

        {mode === "business_permit" ? (
          <>
            <label className="grid gap-2 text-sm font-medium">
              업종 <span className="text-clay">*</span>
              <select name="business_type" className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]" defaultValue="cafe">
                {BUSINESS_TYPE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              점포 주소 <span className="text-clay">*</span>
              <input
                name="address"
                required
                autoComplete="street-address"
                defaultValue={SAMPLE_ADDRESS}
                className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]"
              />
            </label>
          </>
        ) : null}

        {mode === "commercial_use" ? (
          <>
            <label className="grid gap-2 text-sm font-medium">
              검토 목적 <span className="text-clay">*</span>
              <select name="commercial_purpose" className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]" defaultValue="buy_and_use">
                {COMMERCIAL_PURPOSE_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="grid gap-2 text-sm font-medium">
              상가 주소 <span className="text-clay">*</span>
              <input
                name="address"
                required
                autoComplete="street-address"
                defaultValue={SAMPLE_ADDRESS}
                className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]"
              />
            </label>
          </>
        ) : null}

        {/* 더 자세히 토글 */}
        <button
          type="button"
          onClick={() => setShowDetails((v) => !v)}
          aria-expanded={showDetails}
          className="flex items-center justify-between rounded-md border border-dashed border-ink/20 bg-paper px-3 py-2.5 text-sm font-bold text-ink/70 transition hover:border-moss/35 hover:bg-mint/25"
        >
          <span className="flex items-center gap-2">
            {showDetails ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
            더 자세히 알려주면 결과가 정확해져요
          </span>
          <span className="text-xs font-medium text-ink/45">선택 입력</span>
        </button>

        {/* 더 자세히 — 모드별 선택 필드 */}
        {showDetails ? (
          <div className="grid gap-4 rounded-md border border-ink/10 bg-paper/60 p-4">
            {mode === "real_estate" ? (
              <>
                <label className="grid gap-2 text-sm font-medium">
                  주택 유형
                  <select name="property_type" className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]" defaultValue="multi_household">
                    {propertyTypeOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="grid gap-4 sm:grid-cols-3">
                  <label className="grid gap-2 text-sm font-medium">
                    보증금
                    <input name="deposit" type="number" inputMode="numeric" placeholder="예: 300000000" className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]" />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    월세
                    <input name="monthly_rent" type="number" inputMode="numeric" placeholder="0" className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]" />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    매매가
                    <input name="sale_price" type="number" inputMode="numeric" placeholder="매매일 때 입력" className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]" />
                  </label>
                </div>
              </>
            ) : null}

            {mode === "business_permit" ? (
              <>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="grid gap-2 text-sm font-medium">
                    점포 면적 (㎡)
                    <input name="store_area_sqm" type="number" inputMode="decimal" placeholder="예: 50" className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]" />
                  </label>
                  <label className="grid gap-2 text-sm font-medium">
                    운영 시간
                    <select name="operating_hours" className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]" defaultValue="day">
                      {OPERATING_HOURS_OPTIONS.map((option) => (
                        <option key={option.value} value={option.value}>
                          {option.label}
                        </option>
                      ))}
                    </select>
                  </label>
                </div>
                <label className="inline-flex items-center gap-2 text-sm font-medium">
                  <input name="has_license" type="checkbox" className="h-4 w-4 accent-moss" />
                  관련 자격증/면허 보유 (영양사·미용사·학원장 등)
                </label>
              </>
            ) : null}

            {mode === "commercial_use" ? (
              <div className="grid gap-4 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-medium">
                  점포 면적 (㎡)
                  <input name="store_area_sqm" type="number" inputMode="decimal" placeholder="예: 50" className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]" />
                </label>
                <label className="grid gap-2 text-sm font-medium">
                  예산 (만원)
                  <input name="budget" type="number" inputMode="numeric" placeholder="예: 5000" className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]" />
                </label>
              </div>
            ) : null}

            <label className="grid gap-2 text-sm font-medium">
              자유 질문
              <textarea
                name="user_question"
                rows={3}
                placeholder={
                  mode === "real_estate"
                    ? "예: 등기부에 근저당이 있는지 가장 우려됩니다."
                    : mode === "business_permit"
                      ? "예: 이 자리에서 카페 가능한지 확인하고 싶어요."
                      : "예: 이 상가 매수 후 어떤 업종이 가장 적합할까요?"
                }
                className="resize-none border border-ink/15 bg-white p-3 shadow-inner shadow-ink/[0.03]"
              />
            </label>
          </div>
        ) : null}
      </fieldset>

      {/* 비활성 모드 안내 */}
      {mode !== "real_estate" ? (
        <div className="mt-4 rounded-md border border-brass/35 bg-brass/10 p-3 text-xs leading-5 text-ink/80">
          ⓘ {mode === "business_permit" ? "창업·영업 적합성" : "상가 활용성"} 모드는 곧 출시됩니다. 지금은 입력값을 받아 placeholder 결과를 보여드립니다. 발표 직전 LOCALDATA·LURIS 연동으로 정식 활성화 예정.
        </div>
      ) : null}

      <button
        type="submit"
        disabled={loading}
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-moss disabled:cursor-not-allowed disabled:opacity-60 sm:w-auto"
        aria-live="polite"
      >
        <Search aria-hidden="true" size={19} />
        {loading ? "터무니 모으는 중" : "터무니 검토 시작"}
      </button>
    </form>
  );
}
