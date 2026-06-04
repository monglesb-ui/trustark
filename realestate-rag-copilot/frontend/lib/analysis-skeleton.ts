import type { AnalyzeRequest, AnalyzeResponse } from "./types";

export function buildAnalysisSkeleton(payload: AnalyzeRequest): AnalyzeResponse {
  return {
    request_property_type: payload.property_type,
    data_statuses: [
      { id: "geocoding", label: "지도 지오코딩", status: "missing", detail: "조회 전" },
      { id: "legal-dong", label: "법정동코드", status: "missing", detail: "조회 전" },
      { id: "rent-market", label: "전월세 실거래가", status: "missing", detail: "조회 전" },
      { id: "sale-market", label: "매매 실거래가", status: "missing", detail: "조회 전" }
    ],
    risk_level: "터무니 모으는 중",
    risk_score: 0,
    score_breakdown: {
      base_score: 0,
      base_reason: "외부 근거 수집 전",
      adjustments: [],
      final_score: 0
    },
    summary: "외부 데이터 근거를 모은 뒤 터무니지수가 갱신됩니다.",
    location: {
      lat: 0,
      lng: 0,
      address: payload.address ?? ""
    },
    markers: [],
    market_comparison: {
      nearby_avg_deposit: null,
      nearby_avg_monthly_rent: null,
      nearby_avg_sale_price: null,
      input_deposit: payload.deposit || 0,
      input_monthly_rent: payload.monthly_rent || 0,
      input_sale_price: payload.sale_price ?? null,
      difference_rate: 0,
      sample_size: 0
    },
    risk_signals: [],
    evidence: [
      {
        title: "계약 전 필수 확인",
        description: "등기부등본의 소유자, 근저당권, 압류·가압류, 선순위 임차인 여부를 확인해야 합니다.",
        source: "rag_docs/jeonse_risk_checklist.md"
      },
      {
        title: "보증보험 확인",
        description: "전세보증금 반환보증 가입 가능 여부와 보증 한도를 계약 전 확인해야 합니다.",
        source: "rag_docs/jeonse_risk_checklist.md"
      }
    ],
    next_actions: [
      "등기부등본을 발급해 소유자와 근저당권 변동을 확인",
      "전세보증금 반환보증 가입 가능 여부와 한도 확인",
      "주변 실거래가, 공시가격, 감정가를 교차 비교",
      "특약에 잔금 전 권리변동 금지와 보증보험 협조 의무 포함"
    ],
    warnings: [
      "본 결과는 외부 API와 RAG 체크리스트를 기반으로 한 참고 분석이며 법적 판단이 아닙니다.",
      "계약 전 공인중개사, 법률 전문가, 보증기관 확인이 필요합니다."
    ],
    sections: {
      confirmed_facts: [],
      assumptions: [],
      unverified_items: [
        "실제 등기부등본 권리관계",
        "임대인의 체납 및 선순위 채권",
        "보증보험 가입 가능 여부"
      ]
    }
  };
}
