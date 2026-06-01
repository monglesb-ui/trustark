# 07. Codex 실행 프롬프트

아래 프롬프트를 Codex 또는 Claude Code에 넣어 프로젝트를 생성하도록 지시한다.

---

## /goal 프롬프트

당신은 풀스택 AI 서비스 개발자입니다. 다음 요구사항에 맞춰 “부동산 RAG 의사결정 코파일럿” MVP를 구현하세요.

## 프로젝트 목표

사용자가 주소와 계약 조건을 입력하면, mock 부동산 데이터와 RAG 문서, 간단한 에이전트 오케스트레이션을 사용해 계약 전 리스크 리포트를 생성하는 웹 데모를 만듭니다.

서비스명은 가칭 “집판단”입니다.

## 기술 스택

- Frontend: Next.js + TypeScript + Tailwind CSS
- Backend: FastAPI + Python
- Data: JSON mock data
- RAG: local markdown docs + simple keyword retrieval first
- Map: Naver Maps 연동 구조를 만들되, API 키가 없으면 placeholder와 mock coordinate 사용
- LLM: API 키가 없을 경우 template-based report generation으로 fallback

## 반드시 구현할 기능

1. 사용자가 입력 폼에 다음 값을 입력할 수 있어야 합니다.
   - 계약 유형: 전세/월세/매매
   - 주소
   - 보증금
   - 월세
   - 매매가
   - 주택 유형
   - 질문

2. FastAPI backend에 `/analyze` 엔드포인트를 만드세요.

3. `/analyze`는 다음 처리를 수행해야 합니다.
   - 주소를 mock 좌표로 변환
   - mock 거래 데이터를 불러오기
   - 주변 평균 보증금 또는 가격 계산
   - 입력값과 비교
   - 위험 점수 계산
   - RAG 문서에서 관련 체크리스트 검색
   - 리포트 JSON 반환

4. 위험도는 다음 기준을 사용하세요.
   - 0~30: 낮음
   - 31~60: 주의
   - 61~80: 검토 필요
   - 81~100: 위험

5. Frontend는 다음을 표시해야 합니다.
   - 종합 위험도 카드
   - 위험 점수
   - 핵심 근거 목록
   - 주변 시세 비교
   - 지도 또는 지도 placeholder
   - 다음 액션 체크리스트
   - 주의 문구

6. 지도 기능은 다음 방식으로 구현하세요.
   - `MapView.tsx` 컴포넌트 생성
   - `NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID`가 있으면 네이버 지도 script를 로드
   - 없으면 “지도 API 키가 없어 데모 좌표를 표시합니다” placeholder를 보여줌
   - 분석 대상 매물과 주변 mock marker를 표시할 수 있는 props 구조를 만듦

7. Agent 구조는 실제 복잡한 프레임워크 없이 Python class로 먼저 구현하세요.
   - `SearchAgent`
   - `RiskAgent`
   - `RagEvidenceAgent`
   - `ReportAgent`
   - `ValidationAgent`
   - `Orchestrator`

8. AI 답변 안전 원칙을 지키세요.
   - “계약해도 됩니다” 같은 단정 표현 금지
   - “현재 데이터 기준으로”, “추가 확인 필요”, “전문가 검토 권장” 표현 사용
   - 확인된 사실, 추정, 미확인 항목을 분리

## 폴더 구조

다음 구조로 생성하세요.

```text
realestate-rag-copilot/
├─ README.md
├─ .env.example
├─ backend/
│  ├─ app/
│  │  ├─ main.py
│  │  ├─ api/analyze.py
│  │  ├─ schemas/request.py
│  │  ├─ schemas/response.py
│  │  ├─ services/geocoding_service.py
│  │  ├─ services/realestate_data_service.py
│  │  ├─ services/risk_scoring_service.py
│  │  ├─ services/rag_service.py
│  │  ├─ services/report_service.py
│  │  ├─ agents/orchestrator.py
│  │  ├─ agents/search_agent.py
│  │  ├─ agents/risk_agent.py
│  │  ├─ agents/rag_evidence_agent.py
│  │  ├─ agents/report_agent.py
│  │  ├─ agents/validation_agent.py
│  │  ├─ data/mock_transactions.json
│  │  ├─ data/mock_poi.json
│  │  └─ data/rag_docs/jeonse_risk_checklist.md
│  └─ requirements.txt
├─ frontend/
│  ├─ app/page.tsx
│  ├─ app/layout.tsx
│  ├─ app/globals.css
│  ├─ components/AnalysisForm.tsx
│  ├─ components/RiskReport.tsx
│  ├─ components/MapView.tsx
│  ├─ components/EvidenceList.tsx
│  ├─ lib/api.ts
│  ├─ lib/types.ts
│  └─ package.json
└─ docs/
   └─ DEMO_SCENARIO.md
```

## 구현 순서

1. backend부터 구현하세요.
2. `/health`와 `/analyze`가 동작하는지 확인하세요.
3. mock data 기반 response를 완성하세요.
4. frontend 입력 폼과 결과 화면을 구현하세요.
5. backend와 frontend를 연결하세요.
6. 지도 placeholder 또는 Naver Map 연동 구조를 구현하세요.
7. README에 실행 방법을 작성하세요.
8. 최소 테스트를 추가하세요.

## 완료 조건

- `backend`에서 `uvicorn app.main:app --reload` 실행 가능
- `frontend`에서 `npm run dev` 실행 가능
- 웹에서 입력 후 분석 결과가 표시됨
- API 키가 없어도 mock mode로 데모 가능
- README에 설치/실행 방법이 있음

## 주의

- 실제 API 키는 코드에 하드코딩하지 마세요.
- 모든 외부 API는 환경변수로 처리하세요.
- mock mode를 기본값으로 두세요.
- 계약 가능 여부를 단정하지 마세요.
- 사용자가 이해하기 쉬운 한국어 리포트를 출력하세요.

---

## 추가 개선 프롬프트

1차 구현이 끝난 뒤 아래 프롬프트를 사용한다.

```text
현재 구현된 부동산 RAG 코파일럿 MVP를 점검하고, 다음을 개선하세요.
1. 위험도 계산 로직을 더 명확하게 분리
2. RAG 검색 결과가 리포트 근거에 표시되도록 수정
3. 지도 marker props 구조 정리
4. 사용자가 보기 좋은 리포트 카드 UI 개선
5. 발표 데모용 샘플 입력값과 결과 고정
6. README에 데모 시나리오 추가
```
