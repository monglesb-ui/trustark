"use client";

import { ClipboardCheck, Search } from "lucide-react";
import { propertyTypeOptions } from "@/lib/property-types";
import type { AnalyzeRequest } from "@/lib/types";

type Props = {
  loading: boolean;
  onSubmit: (payload: AnalyzeRequest) => void;
};

export function AnalysisForm({ loading, onSubmit }: Props) {
  function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    onSubmit({
      contract_type: String(form.get("contract_type")) as AnalyzeRequest["contract_type"],
      address: String(form.get("address")),
      deposit: Number(form.get("deposit") || 0),
      monthly_rent: Number(form.get("monthly_rent") || 0),
      sale_price: form.get("sale_price") ? Number(form.get("sale_price")) : null,
      property_type: String(form.get("property_type")) as AnalyzeRequest["property_type"],
      user_question: String(form.get("user_question"))
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
          <p className="text-sm text-ink/65">샘플 주소: 서울시 마포구 성산동 000-00</p>
        </div>
        </div>
        <span className="rounded-md border border-moss/20 bg-moss/10 px-3 py-1.5 text-xs font-bold text-moss">
          터무니 검토
        </span>
      </div>

      <fieldset className="grid gap-4">
        <legend className="sr-only">검토 조건</legend>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="grid gap-2 text-sm font-medium">
            계약 유형
            <select name="contract_type" className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]" defaultValue="jeonse">
              <option value="jeonse">전세</option>
              <option value="monthly">월세</option>
              <option value="sale">매매</option>
            </select>
          </label>
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
        </div>

        <label className="grid gap-2 text-sm font-medium">
          주소
          <input
            name="address"
            required
            autoComplete="street-address"
            defaultValue="서울시 마포구 성산동 000-00"
            className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]"
          />
        </label>

        <div className="grid gap-4 sm:grid-cols-3">
          <label className="grid gap-2 text-sm font-medium">
            보증금
            <input name="deposit" type="number" inputMode="numeric" defaultValue={300000000} className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            월세
            <input name="monthly_rent" type="number" inputMode="numeric" defaultValue={0} className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]" />
          </label>
          <label className="grid gap-2 text-sm font-medium">
            매매가
            <input name="sale_price" type="number" inputMode="numeric" placeholder="매매일 때 입력" className="h-11 border border-ink/15 bg-white px-3 shadow-inner shadow-ink/[0.03]" />
          </label>
        </div>

        <label className="grid gap-2 text-sm font-medium">
          질문
          <textarea
            name="user_question"
            rows={3}
            defaultValue="이 집 전세 계약 전에 무엇을 확인해야 하나요?"
            className="resize-none border border-ink/15 bg-white p-3 shadow-inner shadow-ink/[0.03]"
          />
        </label>
      </fieldset>

      <button
        type="submit"
        className="mt-5 inline-flex w-full items-center justify-center gap-2 rounded-md bg-ink px-5 py-3 font-semibold text-white shadow-sm transition hover:bg-moss sm:w-auto"
        aria-live="polite"
      >
        <Search aria-hidden="true" size={19} />
        {loading ? "터무니 모으는 중" : "터무니 검토 시작"}
      </button>
    </form>
  );
}
