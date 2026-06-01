from app.schemas.request import AnalyzeRequest
from app.services.risk_scoring_service import RiskScoringService


def test_risk_label_boundaries():
    service = RiskScoringService()

    assert service.label(30) == "낮음"
    assert service.label(31) == "주의"
    assert service.label(61) == "검토 필요"
    assert service.label(81) == "위험"


def test_jeonse_high_deposit_scores_review_needed():
    request = AnalyzeRequest(
        contract_type="jeonse",
        address="서울시 마포구 성산동",
        deposit=330000000,
        monthly_rent=0,
        sale_price=None,
        property_type="villa",
        user_question="전세 보증금이 적절한가요?",
    )
    market_stats = {
        "difference_rate": 25.0,
        "sample_size": 3,
    }

    score, label, evidence = RiskScoringService().score(request, market_stats)

    assert score >= 80
    assert label in {"검토 필요", "위험"}
    assert any(item.source == "safety_rule" for item in evidence)
