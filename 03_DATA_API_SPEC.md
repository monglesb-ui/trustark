# 03. 데이터 및 API 명세

## 1. 데이터 전략

MVP에서는 실제 API와 mock data를 병행한다.

- 실제 API 사용 가능 시: 실데이터 조회
- API 키 미설정 또는 장애 시: mock data 사용
- 발표 데모는 mock data만으로도 완주 가능해야 함

## 2. 필수 데이터

| 데이터 | 목적 | MVP 처리 방식 |
|---|---|---|
| 주소 좌표 | 지도 표시, 반경 분석 | 네이버 Geocoding 또는 mock |
| 실거래가 | 시세 비교 | 국토부 API 또는 mock |
| 전월세 거래 | 보증금 적정성 분석 | 국토부 API 또는 mock |
| 지역 통계 | 지역 흐름 분석 | 한국부동산원 API 또는 mock |
| 건축물 정보 | 건물 리스크 확인 | API 또는 사용자 업로드/미확인 표시 |
| 지도/입지 정보 | 위치 이해, 시각화 | 네이버 Maps |
| RAG 문서 | 계약 전 체크리스트, 위험 기준 | 로컬 markdown |

## 3. Mock Data 설계

### `mock_transactions.json`

```json
[
  {
    "id": "tx_001",
    "address": "서울시 마포구 성산동",
    "property_type": "villa",
    "contract_type": "jeonse",
    "deposit": 250000000,
    "monthly_rent": 0,
    "area_m2": 49.5,
    "deal_date": "2026-04-12",
    "lat": 37.5631,
    "lng": 126.9089
  },
  {
    "id": "tx_002",
    "address": "서울시 마포구 성산동",
    "property_type": "villa",
    "contract_type": "jeonse",
    "deposit": 270000000,
    "monthly_rent": 0,
    "area_m2": 51.2,
    "deal_date": "2026-05-02",
    "lat": 37.5640,
    "lng": 126.9095
  }
]
```

### `mock_poi.json`

```json
[
  {
    "name": "가까운 지하철역",
    "type": "subway",
    "distance_m": 620,
    "lat": 37.5635,
    "lng": 126.9101
  },
  {
    "name": "초등학교",
    "type": "school",
    "distance_m": 430,
    "lat": 37.5627,
    "lng": 126.9078
  }
]
```

## 4. API 연동 후보

### 4-1. 국토교통부 실거래가 API

#### 목적

- 아파트, 연립/다세대, 오피스텔, 단독/다가구 실거래가 조회
- 매매/전월세 가격 비교

#### MVP 사용 방식

- 처음에는 mock data 사용
- 추후 법정동 코드와 기간 입력으로 API 조회

#### 필요 필드

- 법정동 코드
- 계약 연월
- 주택 유형
- 보증금/월세/매매가
- 면적
- 층
- 건축년도

### 4-2. 한국부동산원 부동산통계 API

#### 목적

- 지역별 가격 동향
- 거래량 흐름
- 전월세 지수
- 시장 분위기 요약

#### MVP 사용 방식

- 실제 연동 전에는 지역 통계 mock data 사용

### 4-3. 건축물대장 API

#### 목적

- 건물 용도
- 면적
- 층수
- 사용승인일
- 위반건축물 가능성 확인

#### MVP 사용 방식

- API 연동이 어려우면 “건축물대장 미확인”으로 표시
- 사용자 업로드 방식은 2차 기능

### 4-4. 네이버 클라우드 Maps API

#### 목적

- 주소를 좌표로 변환
- 지도 표시
- 분석 대상 위치 표시
- 주변 시설 시각화

#### 사용 API

- Geocoding
- Reverse Geocoding
- Dynamic Map
- Static Map
- Directions는 2차 기능

## 5. 주소 처리 전략

주소 처리는 부동산 서비스의 핵심이다.

### 단계

1. 사용자가 주소 입력
2. Geocoding으로 좌표 획득
3. 좌표 기준 mock 거래/POI 거리 계산
4. 향후 법정동 코드 변환 추가

### MVP 제한

- 정확한 동/호수 분석은 하지 않는다.
- 주소가 실패하면 샘플 주소를 사용한다.
- 주소 정규화 실패 시 사용자에게 다시 입력 요청한다.

## 6. RAG용 문서 데이터

MVP에서 RAG에 넣을 문서 예시:

```text
backend/app/data/rag_docs/
├─ jeonse_risk_checklist.md
├─ realestate_contract_warning.md
├─ building_register_checklist.md
├─ deposit_price_analysis_rules.md
└─ report_generation_guidelines.md
```

### 문서 내용 예시

- 전세 계약 전 확인사항
- 등기부등본에서 봐야 할 항목
- 건축물대장에서 확인할 항목
- 보증보험 가입 가능성 체크
- 전세가율 위험 기준
- AI 답변 시 주의 문구

## 7. 데이터 품질 원칙

1. 출처가 없는 판단은 하지 않는다.
2. mock data는 화면에 “데모 데이터”로 표시한다.
3. 실제 API 실패 시 fallback data를 사용한다.
4. 데이터 미확인 항목은 위험도에 반영한다.
5. 미확인 데이터를 임의로 안전하다고 판단하지 않는다.
