export type PropertyType =
  | "apartment"
  | "officetel"
  | "villa"
  | "multi_household"
  | "row_house"
  | "multi_family"
  | "detached"
  | "mixed_use"
  | "urban_living"
  | "other";

export type PropertyTypeGroup =
  | "apartment"
  | "rowhouse"
  | "multifamily"
  | "officetel"
  | "detached"
  | "mixed_use"
  | "urban_living"
  | "other";

export const propertyTypeOptions: Array<{ value: PropertyType; label: string; group: PropertyTypeGroup }> = [
  { value: "apartment", label: "아파트", group: "apartment" },
  { value: "officetel", label: "오피스텔", group: "officetel" },
  { value: "villa", label: "빌라", group: "rowhouse" },
  { value: "multi_household", label: "다세대주택", group: "rowhouse" },
  { value: "row_house", label: "연립주택", group: "rowhouse" },
  { value: "multi_family", label: "다가구주택", group: "multifamily" },
  { value: "detached", label: "단독주택", group: "detached" },
  { value: "mixed_use", label: "상가주택", group: "mixed_use" },
  { value: "urban_living", label: "도시형생활주택", group: "urban_living" },
  { value: "other", label: "기타", group: "other" }
];

export function getPropertyTypeLabel(value: string | undefined | null) {
  if (!value) return "기타";
  return propertyTypeOptions.find((option) => option.value === value)?.label ?? value;
}

export function getPropertyTypeGroup(value: string | undefined | null): PropertyTypeGroup {
  if (!value) return "other";
  return propertyTypeOptions.find((option) => option.value === value)?.group ?? "other";
}
