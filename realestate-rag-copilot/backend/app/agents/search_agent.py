from app.schemas.request import AnalyzeRequest
from app.services.realestate_data_service import RealEstateDataService


class SearchAgent:
    def __init__(self, data_service: RealEstateDataService | None = None) -> None:
        self.data_service = data_service or RealEstateDataService()

    def run(self, request: AnalyzeRequest) -> dict:
        transactions = self.data_service.find_nearby_transactions(request)
        return {
            "transactions": transactions,
            "market_stats": self.data_service.build_market_stats(request, transactions),
            "markers": self.data_service.build_markers(transactions),
        }
