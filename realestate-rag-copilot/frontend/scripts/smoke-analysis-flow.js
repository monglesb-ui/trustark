const { chromium } = require("playwright");

async function main() {
  const baseUrl = process.env.TRUST_ARK_BASE_URL || "http://127.0.0.1:3000";
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1366, height: 900 } });

  await page.goto(baseUrl, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.getByRole("heading", { name: "트러스트 아크" }).waitFor({ timeout: 15000 });
  await page.waitForTimeout(750);
  await page.getByRole("button", { name: "리스크 분석" }).click({ noWaitAfter: true });

  await page.getByText("리스크 분석 진행 중").waitFor({ timeout: 3000 });
  await page.getByText("Agent 실행 타임라인").waitFor({ timeout: 3000 });
  await page.getByText("Live Trace").first().waitFor({ timeout: 3000 });
  await page.getByText("RAG Evidence Agent").first().waitFor({ timeout: 3000 });
  await page.getByText("시세 표본").first().waitFor({ timeout: 3000 });
  await page.getByText("종합 위험도").waitFor({ timeout: 15000 });
  await page.getByText(/검토 필요|위험/).first().waitFor({ timeout: 15000 });
  await page.getByRole("heading", { name: "핵심 위험 신호" }).waitFor({ timeout: 15000 });
  await page.getByRole("heading", { name: "시세 적정성" }).waitFor({ timeout: 15000 });
  await page.getByRole("heading", { name: "위치 맥락" }).waitFor({ timeout: 15000 });
  await page.getByRole("heading", { name: "RAG 근거 문서" }).waitFor({ timeout: 15000 });
  await page.getByRole("heading", { name: "다음 확인 액션" }).waitFor({ timeout: 15000 });
  await page.getByText("핵심 근거").waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: "Agent 검토" }).click();
  await page.getByRole("heading", { name: "Agent 검토 노트" }).waitFor({ timeout: 15000 });
  await page.getByRole("button", { name: /RAG Evidence Agent/ }).click();
  await page.getByRole("heading", { name: "RAG Evidence Agent 검토 노트" }).waitFor({ timeout: 15000 });
  await page.getByText("다음 확인").waitFor({ timeout: 15000 });

  await page.getByRole("button", { name: "문서형", exact: true }).click();
  await page.getByRole("heading", { name: "전세 계약 사전 위험 검토 리포트" }).waitFor({ timeout: 15000 });
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "문서 다운로드" }).click();
  const download = await downloadPromise;
  if (!download.suggestedFilename().endsWith(".html")) {
    throw new Error(`Expected html report download, got ${download.suggestedFilename()}`);
  }

  await browser.close();
  console.log("analysis flow smoke passed");
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
