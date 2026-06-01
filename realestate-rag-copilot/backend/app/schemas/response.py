from pydantic import BaseModel


class Location(BaseModel):
    lat: float
    lng: float
    address: str


class MapMarker(BaseModel):
    id: str
    label: str
    lat: float
    lng: float
    marker_type: str
    amount: int | None = None


class EvidenceItem(BaseModel):
    title: str
    description: str
    source: str


class RiskSignal(BaseModel):
    severity: str
    title: str
    metric: str
    description: str
    source: str


class MarketComparison(BaseModel):
    nearby_avg_deposit: int | None = None
    nearby_avg_monthly_rent: int | None = None
    nearby_avg_sale_price: int | None = None
    input_deposit: int | None = None
    input_monthly_rent: int | None = None
    input_sale_price: int | None = None
    difference_rate: float
    sample_size: int


class AnalysisSections(BaseModel):
    confirmed_facts: list[str]
    assumptions: list[str]
    unverified_items: list[str]


class AnalyzeResponse(BaseModel):
    risk_level: str
    risk_score: int
    summary: str
    location: Location
    markers: list[MapMarker]
    evidence: list[EvidenceItem]
    risk_signals: list[RiskSignal]
    market_comparison: MarketComparison
    next_actions: list[str]
    warnings: list[str]
    sections: AnalysisSections
