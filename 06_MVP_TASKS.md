# 06. MVP 개발 태스크 및 마일스톤

## 1. 전체 목표

DLthon 기간 내 목표는 완성형 서비스가 아니라, 발표 가능한 MVP 데모를 만드는 것이다.

## 2. MVP 데모 성공 기준

- 사용자가 주소와 계약 조건을 입력한다.
- 분석 버튼을 누르면 백엔드가 분석 결과를 반환한다.
- 리스크 점수와 위험도가 표시된다.
- 핵심 근거와 다음 액션이 표시된다.
- 지도에 대상 매물 위치가 표시된다.
- 발표에서 RAG와 Agent 흐름을 설명할 수 있다.

## 3. 일정

기간: 6월 1일 ~ 6월 7일 개발, 6월 8일 발표

| 날짜 | 목표 | 상세 Task | 산출물 |
|---|---|---|---|
| 6/1 | 프로젝트 셋업 | 레포 생성, 폴더 구조, README, 환경변수 예시 | 기본 프로젝트 |
| 6/2 | Backend MVP | FastAPI, `/analyze`, request/response schema | API 동작 |
| 6/3 | 데이터/리스크 로직 | mock 거래 데이터, 위험 점수 계산 | Risk Scoring |
| 6/4 | Frontend MVP | 입력 폼, 결과 화면, API 연결 | 웹 화면 |
| 6/5 | 지도 연동 | mock geocoding, Naver Map 또는 지도 placeholder | 지도 데모 |
| 6/6 | RAG/Agent 연결 | 로컬 문서 검색, Agent Orchestrator | RAG 기반 근거 |
| 6/7 | 통합/발표 준비 | 오류 수정, 데모 시나리오, 발표 스크립트 | 최종 데모 |
| 6/8 | 발표 | 서비스 시연, 구조 설명, 확장성 제시 | 발표 완료 |

## 4. 역할 분담 — 3명 기준

| 역할 | 담당 업무 |
|---|---|
| 팀원 A: PM/기획/발표/프론트 | 서비스 플로우, UI 구성, 발표자료, 데모 시나리오 |
| 팀원 B: 데이터/RAG | 공공데이터 조사, mock data, RAG 문서, 검색 모듈 |
| 팀원 C: 백엔드/Agent | FastAPI, 리스크 점수, Agent Orchestrator, LLM 연동 |

## 5. 역할 분담 — 4명 기준

| 역할 | 담당 업무 |
|---|---|
| 팀원 A: PM/기획 | 문제 정의, 수익 모델, 발표자료 |
| 팀원 B: Frontend | Next.js UI, 지도 화면, 결과 리포트 |
| 팀원 C: Backend/Agent | FastAPI, Orchestrator, Risk Agent |
| 팀원 D: Data/RAG | mock data, RAG 문서, retrieval |

## 6. 개발 태스크 상세

### Task 1. 프로젝트 초기화

- [ ] Git repo 생성
- [ ] `backend/`, `frontend/`, `docs/` 폴더 생성
- [ ] `.env.example` 작성
- [ ] README 작성
- [ ] mock data 폴더 생성

### Task 2. Backend API

- [ ] FastAPI 설치
- [ ] `/health` API 생성
- [ ] `/analyze` API 생성
- [ ] request schema 생성
- [ ] response schema 생성
- [ ] CORS 설정

### Task 3. Mock Data

- [ ] `mock_transactions.json`
- [ ] `mock_poi.json`
- [ ] `mock_region_stats.json`
- [ ] mock loader 함수 생성

### Task 4. Risk Scoring

- [ ] 주변 평균 보증금 계산
- [ ] 입력 보증금과 비교
- [ ] 위험 점수 계산
- [ ] 위험도 라벨 변환
- [ ] 위험 근거 생성

### Task 5. RAG

- [ ] `rag_docs/` 생성
- [ ] 계약 전 체크리스트 문서 작성
- [ ] 문서 chunking
- [ ] keyword retrieval 또는 FAISS 검색
- [ ] 검색 결과를 리포트 근거로 전달

### Task 6. Agent Orchestrator

- [ ] Search Agent 생성
- [ ] Risk Agent 생성
- [ ] RAG Evidence Agent 생성
- [ ] Report Agent 생성
- [ ] Validation Agent 생성
- [ ] 전체 흐름 연결

### Task 7. Frontend

- [ ] Next.js 프로젝트 생성
- [ ] 입력 폼 구현
- [ ] API 호출 함수 구현
- [ ] RiskReport 컴포넌트 구현
- [ ] EvidenceList 컴포넌트 구현
- [ ] MapView 컴포넌트 구현

### Task 8. Naver Map

- [ ] env에 client id 추가
- [ ] 지도 script 로드
- [ ] center 좌표 적용
- [ ] target marker 표시
- [ ] 주변 marker 표시
- [ ] API 없을 때 placeholder 표시

### Task 9. 발표 준비

- [ ] 샘플 주소 1개 고정
- [ ] 데모 데이터 고정
- [ ] 발표 시나리오 작성
- [ ] 에러 대비 스크린샷 준비
- [ ] RAG/Agent 구조도 준비

## 7. 반드시 지킬 범위 제한

### 이번 MVP에 포함하지 않음

- 실제 매물 크롤링
- 등기부등본 자동 발급
- 임대인 신용정보 조회
- 실제 계약 가능/불가능 판정
- 결제 기능
- 로그인/회원가입
- 완전한 PDF 리포트

### 이번 MVP에 포함

- 입력 → 분석 → 리포트 → 지도 표시 흐름
- mock data 기반 전체 데모
- RAG/Agent 구조 설명 가능성

## 8. 발표에서 강조할 포인트

1. 부동산은 정보가 많지만 해석이 어렵다.
2. 기존 서비스는 검색 중심이다.
3. 우리는 계약 전 판단 흐름을 지원한다.
4. RAG는 근거를 찾고, Agent는 분석 단계를 실행한다.
5. 네이버 지도는 분석 결과를 위치 기반으로 이해하게 만든다.
6. 초기에는 전세/월세 리스크 진단으로 시작하고, 이후 B2B SaaS로 확장한다.
