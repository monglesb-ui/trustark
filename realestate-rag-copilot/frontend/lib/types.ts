import type { PropertyType } from "./property-types";

export type ContractType = "jeonse" | "monthly" | "sale";

export type AnalyzeRequest = {
  contract_type: ContractType;
  address: string;
  deposit: number;
  monthly_rent: number;
  sale_price: number | null;
  property_type: PropertyType;
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
  complex_name?: string | null;
  match_mode?: "complex" | "regional" | "fallback";
  regional_sample_size?: number;
  rent_sample_size?: number;
  sale_sample_size?: number;
  latest_rent_deposit?: number | null;
  latest_rent_monthly_rent?: number | null;
  latest_rent_deal_month?: string | null;
  latest_sale_price?: number | null;
  latest_sale_deal_month?: string | null;
  jeonse_ratio?: number | null;
  difference_rate: number;
  sample_size: number;
};

export type AnalysisSections = {
  confirmed_facts: string[];
  assumptions: string[];
  unverified_items: string[];
};

export type DataSourceStatus = {
  id: string;
  label: string;
  status: "success" | "fallback" | "missing" | "failed";
  detail: string;
};

export type AgentTrace = {
  id: string;
  agent: string;
  tool: string;
  status: "success" | "fallback" | "missing" | "failed";
  inputSummary: string;
  outputSummary: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
};

export type BuildingRegisterView = {
  address: string;
  roadAddress?: string;
  buildingName?: string;
  mainPurpose?: string;
  etcPurpose?: string;
  householdCount?: number | null;
  familyCount?: number | null;
  groundFloors?: number | null;
  undergroundFloors?: number | null;
  useApprovalDate?: string;
  violationBuilding?: boolean | null;
};

export type RegistryRiskFlag = {
  type: "mortgage" | "attachment" | "trust" | "lease_right" | "owner_mismatch" | "unknown";
  severity: "높음" | "확인 필요" | "낮음";
  title: string;
  detail: string;
  amount?: number | null;
};

export type RegistryView = {
  status: "confirmed" | "unverified" | "unavailable" | "requires_user_action";
  address: string;
  ownerMasked?: string;
  registryNumberMasked?: string;
  issuedAt?: string;
  seniorClaimAmount?: number | null;
  mortgageCount?: number | null;
  attachmentCount?: number | null;
  trustRegistered?: boolean | null;
  leaseRightRegistered?: boolean | null;
  flags: RegistryRiskFlag[];
  note: string;
};

export type ScoreAdjustmentCategory =
  | "market"
  | "property_type"
  | "data_quality"
  | "rights"
  | "other";

export type ScoreAdjustment = {
  category: ScoreAdjustmentCategory;
  delta: number;
  reason: string;
};

export type ScoreBreakdown = {
  base_score: number;
  base_reason: string;
  adjustments: ScoreAdjustment[];
  final_score: number;
};

export type PlannerOutput = {
  intent_tags: string[];
  emphasis: string[];
  user_question_summary: string;
};

export type AnalyzeResponse = {
  request_property_type?: PropertyType;
  data_statuses?: DataSourceStatus[];
  agent_traces?: AgentTrace[];
  building_register?: BuildingRegisterView;
  registry?: RegistryView;
  planner?: PlannerOutput;
  risk_level: string;
  risk_score: number;
  score_breakdown?: ScoreBreakdown;
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
