import "server-only";
import { serverEnv } from "./env";
import type { SbizWidget, SbizWidgets } from "@/lib/types";

const BASE_URL = "https://bigdata.sbiz.or.kr/gis/openApi";

const WIDGET_META: Array<{
  key: keyof typeof serverEnv.sbizKeys;
  endpoint: string;
  label: string;
  description: string;
}> = [
  {
    key: "simple",
    endpoint: "simple",
    label: "간단분석",
    description: "이 위치에서의 입지 종합 점수 — 매출·유동·경쟁 요약"
  },
  {
    key: "detail",
    endpoint: "detail",
    label: "상세분석",
    description: "심층 상권 분석 — 인구·매출·신규폐업·임대료 추세"
  },
  {
    key: "weather",
    endpoint: "weather",
    label: "창업기상도",
    description: "이 자리에서 창업 가능성 — 종합 위험·기회 신호"
  },
  {
    key: "map",
    endpoint: "startupPublic",
    label: "상권지도",
    description: "주변 매장·시설 분포 시각화"
  },
  {
    key: "delivery",
    endpoint: "delivery",
    label: "배달분석",
    description: "배달 매출·트래픽 패턴"
  },
  {
    key: "sns",
    endpoint: "snsAnaly",
    label: "SNS 분석",
    description: "SNS 언급량·감정 트렌드"
  },
  {
    key: "sales",
    endpoint: "slsIdex",
    label: "점포당 매출",
    description: "점포당 평균 매출액 추이"
  },
  {
    key: "store",
    endpoint: "storSttus",
    label: "업소현황",
    description: "업종별 매장 수·분포"
  },
  {
    key: "lifespan",
    endpoint: "stcarSttus",
    label: "업력현황",
    description: "이 상권 매장 평균 영업기간"
  },
  {
    key: "theme",
    endpoint: "hpReport",
    label: "테마상권",
    description: "특수 상권 분석 (관광·먹자·학원가 등)"
  }
];

/**
 * 좌표 기반 소상공인365 위젯 URL 생성.
 * 위젯 자체는 iframe 임베드로 사용자에게 노출되며 우리 서버는 URL만 생성.
 */
export function buildSbizWidgets(args: {
  lat?: number;
  lng?: number;
}): SbizWidgets {
  const widgets: SbizWidget[] = [];
  for (const meta of WIDGET_META) {
    const certKey = serverEnv.sbizKeys[meta.key];
    if (!certKey) continue;
    const params = new URLSearchParams();
    params.set("certKey", certKey);
    if (typeof args.lat === "number" && typeof args.lng === "number") {
      // 다양한 파라미터 이름을 시도 (위젯 측이 어느 것을 인식하는지 추후 확인)
      params.set("lat", args.lat.toFixed(6));
      params.set("lng", args.lng.toFixed(6));
      params.set("x", args.lng.toFixed(6));
      params.set("y", args.lat.toFixed(6));
    }
    widgets.push({
      key: meta.key,
      label: meta.label,
      description: meta.description,
      url: `${BASE_URL}/${meta.endpoint}?${params.toString()}`
    });
  }
  return {
    widgets,
    has_coordinates: typeof args.lat === "number" && typeof args.lng === "number",
    source: "소상공인365 (bigdata.sbiz.or.kr) iframe 임베드 위젯"
  };
}
