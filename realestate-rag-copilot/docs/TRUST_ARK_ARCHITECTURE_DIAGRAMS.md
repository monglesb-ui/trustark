# 트러스트 아크(Trust Ark) 설계 구조 다이어그램

## 시스템 아키텍처

```mermaid
flowchart TD
    U["사용자"] --> FE["Next.js Frontend"]

    FE --> FORM["계약 조건 입력 폼"]
    FORM --> API_CLIENT["frontend/lib/api.ts"]
    API_CLIENT --> ANALYZE["POST /analyze"]

    subgraph BACKEND["FastAPI Backend"]
        HEALTH["GET /health"]
        ANALYZE_ROUTE["app/api/analyze.py"]

        ANALYZE_ROUTE --> ORCH["Orchestrator"]

        ORCH --> GEO["GeocodingService"]
        ORCH --> SEARCH["SearchAgent"]
        ORCH --> RISK["RiskAgent"]
        ORCH --> RAG["RagEvidenceAgent"]
        ORCH --> REPORT["ReportAgent"]
        ORCH --> VALIDATION["ValidationAgent"]

        SEARCH --> DATA_SERVICE["RealEstateDataService"]
        DATA_SERVICE --> TX["mock_transactions.json"]
        DATA_SERVICE --> POI["mock_poi.json"]

        RISK --> SCORE["RiskScoringService"]
        RAG --> RAG_SERVICE["RagService"]
        RAG_SERVICE --> DOCS["rag_docs/jeonse_risk_checklist.md"]

        REPORT --> REPORT_SERVICE["ReportService"]
        VALIDATION --> SAFE["단정 표현 검증"]
    end

    ANALYZE --> ANALYZE_ROUTE

    GEO --> LOCATION["mock 좌표"]
    SEARCH --> MARKET["주변 거래 / 평균 시세 / marker"]
    RISK --> RISK_RESULT["위험 점수 / 위험도 / 규칙 근거"]
    RAG --> EVIDENCE["RAG 체크리스트 근거"]
    REPORT --> JSON["리포트 JSON"]
    SAFE --> JSON

    JSON --> API_CLIENT

    subgraph UI["Frontend Result UI"]
        RISK_CARD["종합 위험도 카드"]
        MARKET_CARD["주변 시세 비교"]
        MAP["MapView / Naver Maps Placeholder"]
        EVIDENCE_LIST["핵심 근거"]
        ACTIONS["다음 액션"]
        WARNINGS["주의 문구"]
    end

    API_CLIENT --> UI
```

## 분석 시퀀스

```mermaid
sequenceDiagram
    participant User as 사용자
    participant FE as Next.js 화면
    participant API as FastAPI /analyze
    participant OR as Orchestrator
    participant DA as SearchAgent
    participant RA as RiskAgent
    participant RAG as RagEvidenceAgent
    participant RP as ReportAgent
    participant VA as ValidationAgent

    User->>FE: 주소/계약 조건 입력
    FE->>API: POST /analyze
    API->>OR: 분석 요청 전달

    OR->>DA: mock 거래 데이터 검색
    DA-->>OR: 주변 거래, 평균 시세, marker

    OR->>RA: 위험 점수 계산
    RA-->>OR: risk_score, risk_level, 위험 근거

    OR->>RAG: 로컬 문서 검색
    RAG-->>OR: 체크리스트 근거

    OR->>RP: 리포트 JSON 생성
    RP-->>OR: summary, evidence, next_actions

    OR->>VA: 안전 표현 검증
    VA-->>API: 최종 리포트

    API-->>FE: 분석 결과 JSON
    FE-->>User: 위험도/지도/근거/액션 표시
```
