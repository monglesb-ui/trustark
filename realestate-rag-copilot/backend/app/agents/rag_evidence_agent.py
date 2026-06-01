from app.schemas.request import AnalyzeRequest
from app.services.rag_service import RagService


class RagEvidenceAgent:
    def __init__(self, rag_service: RagService | None = None) -> None:
        self.rag_service = rag_service or RagService()

    def run(self, request: AnalyzeRequest):
        return self.rag_service.search(request.user_question, request.contract_type)
