# 부동산 RAG 의사결정 코파일럿 — Codex 개발 문서 세트

이 문서 세트는 Codex 또는 Claude Code 같은 AI 코딩 에이전트가 바로 개발을 시작할 수 있도록 만든 실행형 문서입니다.

## 프로젝트 한 줄 설명

사용자가 주소와 계약 조건을 입력하면, 공개 부동산 데이터와 RAG/Agent 기술을 활용해 계약 전 위험 신호, 시세 적정성, 지역 정보, 다음 확인 액션을 리포트로 제공하는 부동산 의사결정 코파일럿입니다.

## 핵심 MVP

DLthon 기간에는 전체 플랫폼이 아니라 아래 MVP에 집중합니다.

> 주소와 계약 조건을 입력하면, 실거래가/지역 통계/건축물 정보/지도 정보를 바탕으로 계약 전 리스크 리포트를 생성한다.

## 문서 구성

| 파일 | 목적 |
|---|---|
| `01_PRD.md` | 제품 요구사항 정의서 |
| `02_SYSTEM_ARCHITECTURE.md` | 전체 시스템 구조와 폴더 구조 |
| `03_DATA_API_SPEC.md` | 필요한 데이터와 API 정리 |
| `04_RAG_AGENT_DESIGN.md` | RAG와 에이전트 설계 |
| `05_NAVER_MAPS_INTEGRATION.md` | 네이버 지도 API 연동 설계 |
| `06_MVP_TASKS.md` | 개발 태스크와 마일스톤 |
| `07_CODEX_GOAL_PROMPT.md` | Codex에 넣을 실행 프롬프트 |
| `08_ENV_AND_RUNBOOK.md` | 환경변수, 실행 방법, 테스트 방법 |

## 추천 기술 스택

- Frontend: Next.js + TypeScript + Tailwind CSS
- Backend: FastAPI + Python
- DB: SQLite 또는 PostgreSQL
- Vector DB: FAISS 또는 pgvector
- LLM: OpenAI API 또는 Claude/Gemini 대체 가능 구조
- Map: Naver Cloud Maps API
- Report: HTML 리포트 우선, PDF는 2차

## 개발 원칙

1. 먼저 동작하는 MVP를 만든다.
2. 실제 API 연동 전에는 mock data로 데모가 가능해야 한다.
3. AI 답변은 항상 사실, 추정, 추가 확인 필요 항목을 분리한다.
4. 부동산 계약 가능 여부를 단정하지 않는다.
5. 최종 표현은 “계약 가능/불가능”이 아니라 “주의/검토 필요/추가 확인 필요”로 한다.
