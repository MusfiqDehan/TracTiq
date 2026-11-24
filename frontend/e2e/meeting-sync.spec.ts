import { execSync } from "node:child_process";
import path from "node:path";
import { expect, test } from "@playwright/test";

const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8003";

async function resetSeedState() {
  try {
    const res = await fetch(`${API_URL}/api/test/reset`, { method: "POST" });
    if (res.ok) return;
  } catch {
    // fallback to CLI reset when APP_ENV != test
  }
  const repoRoot = path.resolve(__dirname, "../..");
  execSync("uv run seed-db --reset", {
    cwd: path.join(repoRoot, "backend"),
    stdio: "inherit",
  });
}

test.describe("Level 10 Meeting Two-Browser Real-Time Sync", () => {
  test("facilitator starts, advances sections, and syncs live state across two browser contexts", async ({
    browser,
  }) => {
    await resetSeedState();

    const facilitatorCtx = await browser.newContext();
    const observerCtx = await browser.newContext();

    const facilitatorPage = await facilitatorCtx.newPage();
    const observerPage = await observerCtx.newPage();

    await facilitatorPage.goto("/teams/team_lead/meeting?as=u2");
    await observerPage.goto("/teams/team_lead/meeting?as=u5");

    // 1. Facilitator starts Level 10 Meeting
    const startBtn = facilitatorPage.getByTestId("start-meeting-btn");
    await expect(startBtn).toBeVisible();
    await startBtn.click();

    // Both browsers enter Scorecard and display server-owned timer
    await expect(facilitatorPage.getByTestId("meeting-timer")).toBeVisible();
    await expect(observerPage.getByTestId("meeting-timer")).toBeVisible();
    await expect(observerPage.getByTestId("scorecard-section")).toBeVisible();

    // Observer is read-only and has no Advance / End controls
    await expect(observerPage.getByTestId("advance-section-btn")).toHaveCount(0);
    await expect(observerPage.getByTestId("end-meeting-btn")).toHaveCount(0);

    // 2. Facilitator flags off-track cell (m1, 2026-10-26) as Issue, then advances to IDS
    await facilitatorPage.getByTestId("make-issue-m1-2026-10-26").click();
    await facilitatorPage.getByTestId("advance-section-btn").click();

    // Observer browser follows transition to IDS in real time without reload
    await expect(observerPage.getByTestId("issues-section")).toBeVisible({ timeout: 5000 });
    await expect(
      observerPage.getByText("New deals closed – 2026-10-26")
    ).toBeVisible({ timeout: 5000 });

    // 3. Facilitator advances to Conclude and rates 9
    await facilitatorPage.getByTestId("advance-section-btn").click();
    await expect(observerPage.getByText(/Recap New To-Dos/i)).toBeVisible({
      timeout: 5000,
    });

    await facilitatorPage.getByTestId("rate-btn-9").click();
    await expect(observerPage.getByText(/Avg:\s*9\.0/)).toBeVisible({
      timeout: 5000,
    });

    // 4. Facilitator ends meeting; both browsers display final Meeting Summary
    await facilitatorPage.getByTestId("end-meeting-btn").click();
    await expect(facilitatorPage.getByTestId("meeting-summary")).toBeVisible({
      timeout: 5000,
    });
    await expect(observerPage.getByTestId("meeting-summary")).toBeVisible({
      timeout: 5000,
    });

    await facilitatorCtx.close();
    await observerCtx.close();
  });
});
