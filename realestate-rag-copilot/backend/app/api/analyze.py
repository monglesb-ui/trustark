from fastapi import APIRouter

from app.agents.orchestrator import Orchestrator
from app.schemas.request import AnalyzeRequest
from app.schemas.response import AnalyzeResponse

router = APIRouter()
orchestrator = Orchestrator()


@router.post("/analyze", response_model=AnalyzeResponse)
def analyze(request: AnalyzeRequest) -> AnalyzeResponse:
    return orchestrator.analyze(request)
