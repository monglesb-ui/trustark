import type { AnalyzeRequest, AnalyzeResponse } from "./types";

const formatter = new Intl.NumberFormat("ko-KR");

function formatEok(value: number) {
  return `${formatter.format(Math.round(value / 100000000))}억`;
}

export function buildMockAnalysis(payload: AnalyzeRequest): AnalyzeResponse {
  const nearbyAvgDeposit = 256000000;
  const inputDeposit = payload.deposit || 300000000;
  const differenceRate = Math.round(((inputDeposit - nearbyAvgDeposit) / nearbyAvgDeposit) * 100);
  const riskScore = differenceRate >= 15 ? 78 : differenceRate >= 8 ? 65 : 42;
  const riskLevel = riskScore >= 75 ? "위험 · HIGH" : riskScore >= 60 ? "검토 필요" : "낮음";

  return {
    request_property_type: payload.property_type,
    data_statuses: [
      { id: "geocoding", label: "VWorld 지오코딩", status: "fallback", detail: "대체 좌표 사용" },
      { id: "legal-dong", label: "법정동코드", status: "missing", detail: "법정동코드 미조회" },
      { id: "rent-market", label: "전월세 실거래가", status: "fallback", detail: "대체 전월세 표본 4건" },
      { id: "sale-market", label: "매매 실거래가", status: "missing", detail: "매매 표본 없음" }
    ],
    risk_level: riskLevel,
    risk_score: riskScore,
    summary:
      differenceRate >= 15
        ? "깡통전세 의심 구간입니다. 계약 전 등기부등본, 선순위 채권, 보증보험 가입 가능 여부를 추가 확인해 주세요."
        : "현재 입력값은 주변 대체 표본 대비 추가 확인이 필요한 범위입니다. 계약 전 권리관계와 보증보험 조건을 함께 검토하세요.",
    location: {
      lat: 37.5636,
      lng: 126.9217,
      address: payload.address || "서울시 마포구 성산동 000-00"
    },
    markers: [
      { id: "target", label: "대상", lat: 37.5636, lng: 126.9217, marker_type: "target", amount: inputDeposit },
      { id: "sample-1", label: "1", lat: 37.5643, lng: 126.9224, marker_type: "nearby", amount: 245000000 },
      { id: "sample-2", label: "2", lat: 37.5628, lng: 126.9208, marker_type: "nearby", amount: 260000000 },
      { id: "sample-3", label: "3", lat: 37.5651, lng: 126.9212, marker_type: "nearby", amount: 263000000 },
      { id: "sample-4", label: "4", lat: 37.5631, lng: 126.9232, marker_type: "nearby", amount: 256000000 }
    ],
    market_comparison: {
      nearby_avg_deposit: nearbyAvgDeposit,
      nearby_avg_monthly_rent: 0,
      nearby_avg_sale_price: null,
      input_deposit: inputDeposit,
      input_monthly_rent: payload.monthly_rent,
      input_sale_price: payload.sale_price,
      difference_rate: differenceRate,
      sample_size: 4
    },
    risk_signals: [
      {
        severity: "높음",
        title: `전세가율 ${Math.max(90, Math.round((inputDeposit / 320000000) * 100))}% - 깡통전세 위험 구간`,
        metric: `보증금 ${formatEok(inputDeposit)}`,
        description:
          "보증금이 추정 시세 대비 높은 구간입니다. 임대인이 보증금을 반환하지 못하거나 경매로 넘어갈 경우 회수 가능성이 낮아질 수 있습니다.",
        source: "국토교통부 전세사기 예방 체크리스트"
      },
      {
        severity: "높음",
        title: "다세대/빌라 시세 표본 부족",
        metric: "표본 4건",
        description:
          "최근 6개월 인근 실거래 표본이 적어 시세 신뢰구간이 넓습니다. 다세대·연립은 아파트보다 시세 산정이 어려워 감정가와 공시가격 교차 확인이 필요합니다.",
        source: "fallback 거래 표본 데이터"
      }
    ],
    evidence: [
      {
        title: "전세가율 확인",
        description: "보증금이 주변 평균보다 높아 전세가율과 매매가 추정을 함께 확인해야 합니다.",
        source: "risk_rule:deposit_to_market_ratio"
      },
      {
        title: "표본 부족",
        description: "인근 대체 거래 표본이 4건으로 제한적이어서 단일 평균값만으로 판단하기 어렵습니다.",
        source: "risk_rule:sample_size"
      },
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
      "본 결과는 API 조회와 대체 표본을 함께 사용한 참고 분석이며 법적 판단이 아닙니다.",
      "계약 전 공인중개사, 법률 전문가, 보증기관 확인이 필요합니다."
    ],
    sections: {
      confirmed_facts: [
        `${payload.contract_type === "jeonse" ? "전세" : payload.contract_type} 계약 조건이 입력되었습니다.`,
        `입력 보증금은 ${formatter.format(inputDeposit)}원입니다.`,
        `주변 대체 전세 표본은 ${4}건입니다.`
      ],
      assumptions: [
        "주소는 샘플 좌표로 변환되었습니다.",
        "시세는 대체 거래 표본의 단순 평균을 기준으로 계산했습니다."
      ],
      unverified_items: [
        "실제 등기부등본 권리관계",
        "임대인의 체납 및 선순위 채권",
        "보증보험 가입 가능 여부"
      ]
    }
  };
}
