# 트러스트 아크(Trust Ark) - 부동산 RAG 의사결정 코파일럿

주소와 계약 조건을 입력하면 mock 거래 데이터, 로컬 RAG 체크리스트, 간단한 Agent Orchestrator를 사용해 계약 전 리스크 리포트를 생성하는 MVP입니다.

## 구성

- `backend`: FastAPI API 서버
- `frontend`: Next.js + TypeScript + Tailwind CSS 웹 앱
- `docs`: 발표 데모 시나리오

## Backend 실행

```bash
cd backend
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

확인:

```bash
curl http://127.0.0.1:8000/health
```

## Frontend 실행

```bash
cd frontend
npm install
npm run dev
```

브라우저에서 `http://localhost:3000`을 엽니다.

## Mock Mode

기본값은 mock mode입니다.

- 주소는 mock 좌표로 변환됩니다.
- 거래 데이터는 `backend/app/data/mock_transactions.json`을 사용합니다.
- RAG 근거는 `backend/app/data/rag_docs/jeonse_risk_checklist.md`를 검색합니다.
- `NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID`가 비어 있으면 지도 placeholder가 표시됩니다.

## API

`POST /analyze`

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

응답에는 위험도, 위험 점수, 핵심 근거, 시세 비교, 지도 marker, 다음 액션, 주의 문구가 포함됩니다.

## 테스트

```bash
cd backend
python -m pytest
python -m compileall app
```

```bash
cd frontend
npm run lint
npm run build
```

## 안전 원칙

이 MVP는 계약 가능 여부를 단정하지 않습니다. 모든 리포트는 "현재 데이터 기준", "추가 확인 필요", "전문가 검토 권장"을 전제로 표시합니다.
