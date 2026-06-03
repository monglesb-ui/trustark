# 트러스트 아크(Trust Ark) - 부동산 RAG 의사결정 코파일럿

주소와 계약 조건을 입력하면 외부 데이터 소스(네이버 지오코딩, VWorld, data.go.kr 실거래가, CODEF 등기부등본 등)와 로컬 RAG 체크리스트, Next.js 기반 Agent Runtime을 통해 계약 전 리스크 리포트를 생성하는 MVP입니다.

## 구성

- `frontend`: Next.js + TypeScript + Tailwind CSS 웹 앱 (분석 API 라우트와 Agent Runtime 포함)
- `docs`: 발표 데모 시나리오 및 아키텍처 다이어그램

## 실행

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## 분석 API

분석 파이프라인은 Next.js Route Handler로 제공됩니다.

`POST /api/analyze`

```json
{
  "contract_type": "jeonse",
  "address": "서울시 마포구 성산동 000-00",
  "deposit": 300000000,
  "monthly_rent": 0,
  "sale_price": null,
  "property_type": "villa",
  "user_question": "이 집 전세 계약 전에 무엇을 확인해야 하나요?"
}
```

응답에는 위험도, 위험 점수, 핵심 근거, 시세 비교, 지도 marker, 데이터 출처 상태(`data_statuses`), 에이전트 추적(`agent_traces`), 다음 액션, 주의 문구가 포함됩니다.

추가로 `POST /api/registry`는 수수료 발생 가능성을 사용자가 명시적으로 승인한 후 CODEF 등기부등본을 열람하는 별도 엔드포인트입니다.

## 환경변수

`.env.example`을 참고해 `frontend/.env.local`에 외부 API 키를 채워 넣습니다. 키가 비어 있는 경우 해당 단계는 `data_statuses`에 `fallback` / `missing` 상태로 표기됩니다.

## 테스트

```bash
cd frontend
npm run lint
npm run build
```

## 안전 원칙

이 MVP는 계약 가능 여부를 단정하지 않습니다. 모든 리포트는 "현재 데이터 기준", "추가 확인 필요", "전문가 검토 권장"을 전제로 표시합니다.
