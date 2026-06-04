import type { PropertyType } from "./property-types";

export type ContractType = "jeonse" | "monthly" | "sale";

export type AnalysisMode = "real_estate" | "business_permit" | "commercial_use";

export type BusinessType =
  | "restaurant"
  | "cafe"
  | "beauty"
  | "academy"
  | "pc_room"
  | "karaoke"
  | "other";

export type OperatingHours = "day" | "all_day" | "late_night";

export type CommercialPurpose = "lease_out" | "buy_and_use" | "business_location";

export type AnalyzeRequest = {
  /** 검토 모드 (선택, 미지정 시 real_estate로 처리) */
  mode?: AnalysisMode;
  /** 모든 모드에서 필수 */
  address: string;

  // === 부동산 임차·매수 모드 ===
  contract_type?: ContractType;
  property_type?: PropertyType;
  deposit?: number;
  monthly_rent?: number;
  sale_price?: number | null;

  // === 창업·영업 적합성 모드 ===
  business_type?: BusinessType;
  store_area_sqm?: number;
  operating_hours?: OperatingHours;
  has_license?: boolean;

  // === 상가 활용성 모드 ===
  commercial_purpose?: CommercialPurpose;
  budget?: number;

  // === 공통 (선택) ===
  user_question?: string;
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

export type PlannableAgent =
  | "market_data"
  | "building_register"
  | "registry"
  | "search_context";

export type PlanPriority = "critical" | "normal" | "optional";

export type ExecutionPlanEntry = {
  agent: PlannableAgent;
  priority: PlanPriority;
  notes: string;
};

export type PlannerOutput = {
  intent_tags: string[];
  emphasis: string[];
  user_question_summary: string;
  execution_plan: ExecutionPlanEntry[];
};

export type DensityLabel = "낮음" | "보통" | "높음" | "매우 높음";

export type CompetitionDensityFinding = {
  business_type_label: string;
  radius_meters: number;
  total_stores: number;          // 업종 필터 통과한 매장 수
  all_stores_in_radius: number;  // 반경 내 전체 매장 수
  density_label: DensityLabel;
  density_score: number;          // 0~100 (높을수록 경쟁 심함)
  sample_stores: Array<{
    name: string;
    category?: string;
    address?: string;
  }>;
  source: string;
  diagnostic: string;
  note: string;
};

export type SchoolKind = "초등학교" | "중학교" | "고등학교" | "특수학교" | "기타";

export type SchoolZoneImpact = "low" | "medium" | "high";

export type SchoolZoneFinding = {
  district: string;                 // 사용자 자치구 (예: 양천구)
  total_schools_in_district: number;
  nearby_schools: Array<{
    name: string;
    kind: string;                   // 초등학교/중학교/고등학교/...
    address: string;
    matchedBy: "same_road" | "same_district";  // 매칭 방식
  }>;
  school_kind_counts: Record<string, number>;  // {"초등학교": 5, "중학교": 2, ...}
  business_type_label: string;
  impact_level: SchoolZoneImpact;
  impact_message: string;            // 사용자 업종 기반 영향 안내
  source: string;
  diagnostic: string;
  note: string;
};

export type BusinessPermitFindings = {
  competition?: CompetitionDensityFinding;
  school_zone?: SchoolZoneFinding;
  // 이후 추가될 항목: zoning, license_requirement, building_suitability, youth_protection
};

export type AnalyzeResponse = {
  requested_mode?: AnalysisMode;
  business_findings?: BusinessPermitFindings;
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
