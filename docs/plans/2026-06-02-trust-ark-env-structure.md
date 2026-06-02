# Trust Ark Env Structure Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Establish a clean environment variable structure for Trust Ark as OpenAI, public real estate, VWorld, Naver Maps, and future real estate API keys are added.

**Architecture:** Split server-only secrets from browser-safe public configuration. Keep mock fallback behavior while allowing the frontend to call either a deployed API base URL or local FastAPI.

**Tech Stack:** Next.js, TypeScript, Vercel environment variables, FastAPI backend.

---

### Task 1: Add Env Helpers

**Files:**
- Create: `realestate-rag-copilot/frontend/lib/server/env.ts`
- Create: `realestate-rag-copilot/frontend/lib/public-env.ts`

**Steps:**
1. Add `serverEnv` for secrets such as `OPENAI_API_KEY`, `DATA_GO_KR_SERVICE_KEY_*`, `VWORLD_API_KEY`, and future provider secrets.
2. Add `publicEnv` for values intentionally exposed to the browser, such as Naver Maps client ID.

### Task 2: Normalize API Base URL

**Files:**
- Modify: `realestate-rag-copilot/frontend/lib/api.ts`
- Modify: `realestate-rag-copilot/frontend/components/MapView.tsx`

**Steps:**
1. Support `TRUST_ARK_API_BASE_URL` while keeping `NEXT_PUBLIC_API_BASE_URL` for compatibility.
2. Move Naver Maps public client id access to `publicEnv`.

### Task 3: Document Env Names

**Files:**
- Modify: `realestate-rag-copilot/.env.example`

**Steps:**
1. Add server-only variables with empty values.
2. Add public variables and explain that only `NEXT_PUBLIC_*` values are browser-visible.
3. Include future Naver and real estate provider placeholders.

### Task 4: Verify

**Commands:**
- `npm run lint`
- `npm run build`

**Expected:** Both commands pass.
