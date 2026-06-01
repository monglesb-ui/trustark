from app.schemas.request import AnalyzeRequest
from app.schemas.response import (
    AnalysisSections,
    AnalyzeResponse,
    EvidenceItem,
    Location,
    MarketComparison,
    RiskSignal,
)


class ReportService:
    WARNING = "본 결과는 공개 데이터와 입력값 기반의 참고용 분석입니다. 최종 계약 전 공인중개사, 법무사 등 전문가 검토가 필요합니다."

    def build(
        self,
        request: AnalyzeRequest,
        location: Location,
        markers,
        risk_score: int,
        risk_level: str,
        evidence: list[EvidenceItem],
        market_stats: dict,
    ) -> AnalyzeResponse:
        summary = (
            f"현재 데이터 기준으로 위험도는 '{risk_level}'입니다. "
            "계약 가능 여부를 단정하기보다 아래 근거와 미확인 항목을 추가 확인해 주세요."
        )
        next_actions = [
            "등기부등본에서 소유자와 선순위 권리 확인",
            "건축물대장과 실제 주택 유형 일치 여부 확인",
            "보증보험 가입 가능 여부 확인",
            "주변 유사 거래 3건 이상 추가 비교",
            "특약 문구와 잔금 조건 전문가 검토",
        ]

        sections = AnalysisSections(
            confirmed_facts=[
                f"입력 주소: {request.address}",
                f"계약 유형: {self._contract_label(request.contract_type)}",
                f"mock 거래 표본 수: {market_stats['sample_size']}건",
            ],
            assumptions=[
                "주소 좌표는 mock geocoding 결과를 사용했습니다.",
                "주변 시세는 저장된 mock 거래 데이터 평균으로 계산했습니다.",
            ],
            unverified_items=[
                "등기부등본의 최신 권리 관계",
                "임대인 세금 체납 및 보증보험 가입 가능 여부",
                "실제 건축물대장 정보와 현장 상태",
            ],
        )
        risk_signals = self._build_risk_signals(evidence, risk_score, market_stats)

        return AnalyzeResponse(
            risk_level=risk_level,
            risk_score=risk_score,
            summary=summary,
            location=location,
            markers=markers,
            evidence=evidence,
            risk_signals=risk_signals,
            market_comparison=MarketComparison(**market_stats),
            next_actions=next_actions,
            warnings=[self.WARNING, "AI 분석은 참고 자료이며 '계약해도 된다'는 판단을 대신하지 않습니다."],
            sections=sections,
        )

    def _contract_label(self, value: str) -> str:
        return {"jeonse": "전세", "monthly": "월세", "sale": "매매"}.get(value, value)

    def _build_risk_signals(
        self,
        evidence: list[EvidenceItem],
        risk_score: int,
        market_stats: dict,
    ) -> list[RiskSignal]:
        severity = "높음" if risk_score >= 81 else "중간" if risk_score >= 61 else "주의" if risk_score >= 31 else "낮음"
        signals = [
            RiskSignal(
                severity=severity,
                title=item.title,
                metric=self._metric_for_evidence(item, market_stats),
                description=item.description,
                source=item.source,
            )
            for item in evidence
            if not item.source.startswith("rag_docs")
        ]
        return signals or [
            RiskSignal(
                severity=severity,
                title="추가 확인 필요",
                metric=f"위험 점수 {risk_score}",
                description="현재 데이터 기준으로 확인 가능한 위험 신호가 제한적이므로 원문 서류 확인이 필요합니다.",
                source="report_service",
            )
        ]

    def _metric_for_evidence(self, item: EvidenceItem, market_stats: dict) -> str:
        if item.source == "mock_transactions":
            return f"차이율 {market_stats['difference_rate']}%"
        if item.source == "safety_rule":
            return "미확인"
        return "참고"
