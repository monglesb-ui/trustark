from app.agents.rag_evidence_agent import RagEvidenceAgent
from app.agents.report_agent import ReportAgent
from app.agents.risk_agent import RiskAgent
from app.agents.search_agent import SearchAgent
from app.agents.validation_agent import ValidationAgent
from app.schemas.request import AnalyzeRequest
from app.schemas.response import AnalyzeResponse, MapMarker
from app.services.geocoding_service import GeocodingService


class Orchestrator:
    def __init__(self) -> None:
        self.geocoding = GeocodingService()
        self.search_agent = SearchAgent()
        self.risk_agent = RiskAgent()
        self.rag_agent = RagEvidenceAgent()
        self.report_agent = ReportAgent()
        self.validation_agent = ValidationAgent()

    def analyze(self, request: AnalyzeRequest) -> AnalyzeResponse:
        location = self.geocoding.geocode(request.address)
        search_result = self.search_agent.run(request)
        risk_score, risk_level, risk_evidence = self.risk_agent.run(
            request, search_result["market_stats"]
        )
        rag_evidence = self.rag_agent.run(request)
        target_marker = MapMarker(
            id="target",
            label="분석 대상",
            lat=location.lat,
            lng=location.lng,
            marker_type="target",
            amount=(request.sale_price if request.contract_type == "sale" else request.deposit),
        )
        response = self.report_agent.run(
            request=request,
            location=location,
            markers=[target_marker, *search_result["markers"]],
            risk_score=risk_score,
            risk_level=risk_level,
            evidence=[*risk_evidence, *rag_evidence],
            market_stats=search_result["market_stats"],
        )
        return self.validation_agent.run(response)
