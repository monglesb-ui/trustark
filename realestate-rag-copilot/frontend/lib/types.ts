export type ContractType = "jeonse" | "monthly" | "sale";

export type AnalyzeRequest = {
  contract_type: ContractType;
  address: string;
  deposit: number;
  monthly_rent: number;
  sale_price: number | null;
  property_type: string;
  user_question: string;
};

export type Location = {
  lat: number;
  lng: number;
  address: string;
};

export type MapMarker = {
  id: string;
  label: string;
  lat: number;
  lng: number;
  marker_type: "target" | "nearby" | string;
  amount?: number | null;
};

export type EvidenceItem = {
  title: string;
  description: string;
  source: string;
};

export type RiskSignal = {
  severity: string;
  title: string;
  metric: string;
  description: string;
  source: string;
};

export type MarketComparison = {
  nearby_avg_deposit?: number | null;
  nearby_avg_monthly_rent?: number | null;
  nearby_avg_sale_price?: number | null;
  input_deposit?: number | null;
  input_monthly_rent?: number | null;
  input_sale_price?: number | null;
  difference_rate: number;
  sample_size: number;
};

export type AnalysisSections = {
  confirmed_facts: string[];
  assumptions: string[];
  unverified_items: string[];
};

export type AnalyzeResponse = {
  risk_level: string;
  risk_score: number;
  summary: string;
  location: Location;
  markers: MapMarker[];
  evidence: EvidenceItem[];
  risk_signals?: RiskSignal[];
  market_comparison: MarketComparison;
  next_actions: string[];
  warnings: string[];
  sections: AnalysisSections;
};
