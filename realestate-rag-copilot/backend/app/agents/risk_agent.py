from app.schemas.request import AnalyzeRequest
from app.services.risk_scoring_service import RiskScoringService


class RiskAgent:
    def __init__(self, scoring_service: RiskScoringService | None = None) -> None:
        self.scoring_service = scoring_service or RiskScoringService()

    def run(self, request: AnalyzeRequest, market_stats: dict):
        return self.scoring_service.score(request, market_stats)
