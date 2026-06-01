from app.schemas.request import AnalyzeRequest
from app.schemas.response import EvidenceItem


class RiskScoringService:
    def score(
        self, request: AnalyzeRequest, market_stats: dict[str, int | float | None]
    ) -> tuple[int, str, list[EvidenceItem]]:
        score = 10
        evidence: list[EvidenceItem] = []
        difference_rate = float(market_stats["difference_rate"] or 0)

        if difference_rate >= 20:
            score += 35
            evidence.append(
                EvidenceItem(
                    title="주변 시세 대비 높은 조건",
                    description=f"입력 금액이 주변 평균보다 약 {difference_rate}% 높습니다.",
                    source="mock_transactions",
                )
            )
        elif difference_rate >= 10:
            score += 20
            evidence.append(
                EvidenceItem(
                    title="주변 평균 초과",
                    description=f"입력 금액이 주변 평균보다 약 {difference_rate}% 높아 추가 비교가 필요합니다.",
                    source="mock_transactions",
                )
            )
        else:
            evidence.append(
                EvidenceItem(
                    title="시세 비교",
                    description="입력 금액은 mock 주변 거래 평균과 큰 차이를 보이지 않습니다.",
                    source="mock_transactions",
                )
            )

        if request.contract_type == "jeonse":
            score += 20
            evidence.append(
                EvidenceItem(
                    title="등기부등본 미확인",
                    description="등기부등본과 선순위 권리 관계는 아직 확인되지 않았습니다.",
                    source="safety_rule",
                )
            )
            score += 15
            evidence.append(
                EvidenceItem(
                    title="보증보험 가능 여부 미확인",
                    description="전세보증보험 가입 가능 여부 확인이 필요합니다.",
                    source="safety_rule",
                )
            )

        if market_stats["sample_size"] and int(market_stats["sample_size"]) < 3:
            score += 10
            evidence.append(
                EvidenceItem(
                    title="거래 표본 부족",
                    description="유사 거래 표본이 적어 가격 판단의 불확실성이 있습니다.",
                    source="mock_transactions",
                )
            )

        score = min(score, 100)
        return score, self.label(score), evidence

    def label(self, score: int) -> str:
        if score <= 30:
            return "낮음"
        if score <= 60:
            return "주의"
        if score <= 80:
            return "검토 필요"
        return "위험"
