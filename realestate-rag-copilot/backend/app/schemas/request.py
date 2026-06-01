from typing import Literal

from pydantic import BaseModel, Field


class AnalyzeRequest(BaseModel):
    contract_type: Literal["jeonse", "monthly", "sale"] = Field(
        description="Contract type: jeonse, monthly, or sale."
    )
    address: str = Field(min_length=2)
    deposit: int | None = Field(default=0, ge=0)
    monthly_rent: int | None = Field(default=0, ge=0)
    sale_price: int | None = Field(default=None, ge=0)
    property_type: str = Field(min_length=1)
    user_question: str = Field(default="")
