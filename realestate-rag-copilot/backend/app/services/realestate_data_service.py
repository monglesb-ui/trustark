import json
from functools import cached_property
from pathlib import Path
from statistics import mean
from typing import Any

from app.schemas.request import AnalyzeRequest
from app.schemas.response import MapMarker

DATA_DIR = Path(__file__).resolve().parents[1] / "data"


class RealEstateDataService:
    @cached_property
    def transactions(self) -> list[dict[str, Any]]:
        with (DATA_DIR / "mock_transactions.json").open(encoding="utf-8") as file:
            return json.load(file)

    @cached_property
    def poi(self) -> list[dict[str, Any]]:
        with (DATA_DIR / "mock_poi.json").open(encoding="utf-8") as file:
            return json.load(file)

    def find_nearby_transactions(self, request: AnalyzeRequest) -> list[dict[str, Any]]:
        region = self._region_from_address(request.address)
        matches = [
            row
            for row in self.transactions
            if row["region"] == region
            and row["contract_type"] == request.contract_type
            and row["property_type"] == request.property_type
        ]
        if matches:
            return matches
        return [row for row in self.transactions if row["contract_type"] == request.contract_type]

    def build_market_stats(
        self, request: AnalyzeRequest, transactions: list[dict[str, Any]]
    ) -> dict[str, int | float | None]:
        deposits = [row["deposit"] for row in transactions if row.get("deposit")]
        rents = [row["monthly_rent"] for row in transactions if row.get("monthly_rent")]
        sale_prices = [row["sale_price"] for row in transactions if row.get("sale_price")]

        if request.contract_type == "sale":
            nearby_avg = int(mean(sale_prices)) if sale_prices else 0
            input_value = request.sale_price or 0
        else:
            nearby_avg = int(mean(deposits)) if deposits else 0
            input_value = request.deposit or 0

        difference_rate = 0.0
        if nearby_avg > 0 and input_value > 0:
            difference_rate = round(((input_value - nearby_avg) / nearby_avg) * 100, 1)

        return {
            "nearby_avg_deposit": int(mean(deposits)) if deposits else None,
            "nearby_avg_monthly_rent": int(mean(rents)) if rents else None,
            "nearby_avg_sale_price": int(mean(sale_prices)) if sale_prices else None,
            "input_deposit": request.deposit or 0,
            "input_monthly_rent": request.monthly_rent or 0,
            "input_sale_price": request.sale_price,
            "difference_rate": difference_rate,
            "sample_size": len(transactions),
        }

    def build_markers(self, transactions: list[dict[str, Any]]) -> list[MapMarker]:
        return [
            MapMarker(
                id=str(row["id"]),
                label=row["label"],
                lat=row["lat"],
                lng=row["lng"],
                marker_type="nearby",
                amount=row.get("deposit") or row.get("sale_price"),
            )
            for row in transactions[:5]
        ]

    def _region_from_address(self, address: str) -> str:
        if "마포" in address or "성산" in address:
            return "mapo"
        if "강남" in address:
            return "gangnam"
        if "송파" in address:
            return "songpa"
        if "분당" in address:
            return "bundang"
        return "seoul"
