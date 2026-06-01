# Real Estate RAG Copilot Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build the "집판단" MVP that accepts real estate contract inputs and returns a Korean risk report using mock data, local RAG documents, simple agents, and a map placeholder/Naver Maps integration structure.

**Architecture:** The backend is a FastAPI app with service classes for geocoding, mock data loading, risk scoring, RAG retrieval, and report assembly. A lightweight Python agent orchestrator wires SearchAgent, RiskAgent, RagEvidenceAgent, ReportAgent, and ValidationAgent. The frontend is a Next.js + TypeScript + Tailwind app with a form, report components, API client, and MapView that falls back to a mock map when no Naver Maps key exists.

**Tech Stack:** FastAPI, Pydantic, pytest, Next.js App Router, TypeScript, Tailwind CSS, local JSON and markdown data.

---

### Task 1: Backend Skeleton

**Files:**
- Create: `realestate-rag-copilot/backend/app/main.py`
- Create: `realestate-rag-copilot/backend/app/api/analyze.py`
- Create: `realestate-rag-copilot/backend/requirements.txt`

**Steps:**
1. Add a FastAPI app with CORS and `/health`.
2. Add `/analyze` router placeholder wired to the orchestrator.
3. Verify import path with `python -m compileall app`.

### Task 2: Backend Schemas and Services

**Files:**
- Create: `backend/app/schemas/request.py`
- Create: `backend/app/schemas/response.py`
- Create: `backend/app/services/*.py`
- Create: `backend/app/data/*.json`
- Create: `backend/app/data/rag_docs/jeonse_risk_checklist.md`

**Steps:**
1. Define request/response Pydantic models.
2. Implement mock geocoding, transaction loading, average price/deposit comparison, scoring, and keyword RAG retrieval.
3. Add risk labels: 낮음, 주의, 검토 필요, 위험.
4. Verify service behavior with focused pytest tests.

### Task 3: Agent Orchestrator

**Files:**
- Create: `backend/app/agents/search_agent.py`
- Create: `backend/app/agents/risk_agent.py`
- Create: `backend/app/agents/rag_evidence_agent.py`
- Create: `backend/app/agents/report_agent.py`
- Create: `backend/app/agents/validation_agent.py`
- Create: `backend/app/agents/orchestrator.py`

**Steps:**
1. Keep each agent as a small class with one responsibility.
2. Ensure report wording separates facts, assumptions, and unverified items.
3. Validate final report avoids deterministic contract approval language.

### Task 4: Frontend MVP

**Files:**
- Create: `frontend/app/page.tsx`
- Create: `frontend/app/layout.tsx`
- Create: `frontend/app/globals.css`
- Create: `frontend/components/*.tsx`
- Create: `frontend/lib/api.ts`
- Create: `frontend/lib/types.ts`
- Create: `frontend/package.json`

**Steps:**
1. Build a Korean input form with all required fields.
2. Call backend `/analyze`.
3. Render risk card, evidence, market comparison, map placeholder, next actions, and warnings.
4. Keep the first screen as the usable app, not a marketing landing page.

### Task 5: Docs and Demo

**Files:**
- Create: `realestate-rag-copilot/README.md`
- Create: `realestate-rag-copilot/.env.example`
- Create: `realestate-rag-copilot/docs/DEMO_SCENARIO.md`

**Steps:**
1. Document backend/frontend install and run commands.
2. Include mock-mode behavior and environment variables.
3. Add a fixed demo scenario.

### Task 6: Verification

**Commands:**
- Backend: `python -m compileall app`
- Backend tests: `python -m pytest`
- Frontend type/lint smoke: `npm install` then `npm run lint`
- Runtime smoke: run backend and frontend, submit sample input, confirm report renders.
