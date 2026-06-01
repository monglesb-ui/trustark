# 08. 환경변수 및 실행 가이드

## 1. `.env.example`

```env
# Backend
APP_ENV=development
USE_MOCK_DATA=true
USE_MOCK_GEO=true

# LLM
OPENAI_API_KEY=
ANTHROPIC_API_KEY=
LLM_PROVIDER=template

# Naver Maps
NAVER_MAPS_CLIENT_ID=
NAVER_MAPS_CLIENT_SECRET=
NEXT_PUBLIC_NAVER_MAPS_CLIENT_ID=

# API base
NEXT_PUBLIC_API_BASE_URL=http://localhost:8000
```

## 2. Backend 실행

```bash
cd backend
python -m venv .venv
source .venv/bin/activate  # Windows: .venv\Scripts\activate
pip install -r requirements.txt
uvicorn app.main:app --reload --port 8000
```

## 3. Frontend 실행

```bash
cd frontend
npm install
npm run dev
```

기본 접속 주소:

```text
http://localhost:3000
```

## 4. API 테스트

### Health Check

```bash
curl http://localhost:8000/health
```

### Analyze Test

```bash
curl -X POST http://localhost:8000/analyze \
  -H "Content-Type: application/json" \
  -d '{
    "contract_type": "jeonse",
    "address": "서울시 마포구 성산동",
    "deposit": 300000000,
    "monthly_rent": 0,
    "sale_price": null,
    "property_type": "villa",
    "user_question": "이 집 전세 계약해도 괜찮을까?"
  }'
```

## 5. 발표용 샘플 입력

| 항목 | 값 |
|---|---|
| 계약 유형 | 전세 |
| 주소 | 서울시 마포구 성산동 |
| 보증금 | 300,000,000원 |
| 월세 | 0원 |
| 주택 유형 | 빌라 |
| 질문 | 이 집 전세 계약해도 괜찮을까? |

## 6. 발표용 예상 결과

```text
종합 위험도: 검토 필요
위험 점수: 68점

요약:
현재 입력된 보증금은 주변 유사 거래 평균보다 높은 편이며, 등기부등본과 건축물대장 확인이 필요합니다.

핵심 근거:
1. 입력 보증금이 주변 유사 전세 거래 평균보다 약 15% 높습니다.
2. 비교 가능한 주변 거래는 있으나, 정확한 권리관계 정보는 아직 확인되지 않았습니다.
3. 건축물 정보와 보증보험 가능 여부 확인이 필요합니다.

다음 액션:
- 등기부등본 확인
- 건축물대장 확인
- 보증보험 가입 가능 여부 확인
- 특약 문구 검토
- 전문가 상담 검토
```

## 7. 테스트 체크리스트

### Backend

- [ ] `/health`가 200 반환
- [ ] `/analyze`가 200 반환
- [ ] 주소가 없어도 적절한 에러 반환
- [ ] 보증금이 주변 평균보다 높으면 위험 점수 상승
- [ ] mock data가 정상 로드됨
- [ ] RAG 문서 검색 결과가 반환됨

### Frontend

- [ ] 입력 폼이 정상 표시됨
- [ ] 분석 버튼 클릭 시 API 호출됨
- [ ] 결과 카드가 표시됨
- [ ] 지도 placeholder 또는 지도 표시됨
- [ ] 다음 액션 체크리스트가 표시됨
- [ ] 모바일에서도 깨지지 않음

## 8. 문제 발생 시 fallback

| 문제 | 대응 |
|---|---|
| 네이버 지도 API 키 없음 | 지도 placeholder 표시 |
| LLM API 키 없음 | template report 사용 |
| 외부 API 실패 | mock data 사용 |
| RAG 검색 실패 | 기본 체크리스트 반환 |
| PDF 생성 실패 | HTML 리포트만 표시 |

## 9. 발표 전 준비물

- 데모 주소 1개
- 데모 입력값 고정
- API 서버 실행 확인
- 프론트 실행 확인
- 인터넷 실패 대비 화면 캡처
- RAG/Agent 구조도
- 데이터 출처 설명 슬라이드

## 10. 배포는 선택

시간이 부족하면 로컬 데모만으로 충분하다.

가능하면 아래 중 하나를 선택한다.

- Frontend: Vercel
- Backend: Render 또는 Railway
- DB: mock JSON 유지

DLthon 발표에서는 완전 배포보다 “입력 → 분석 → 리포트” 흐름이 더 중요하다.
