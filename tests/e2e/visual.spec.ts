import { test, expect } from "@playwright/test";

// Visual regression — render each A4 page and compare to a committed baseline.
//
// These tests are tagged @visual and excluded from the deploy-gating e2e run
// (`npm run test:e2e`). On the first CI run no Linux baseline exists yet, so the
// snapshot is generated and uploaded as an artifact; download it, commit it
// under tests/snapshots/, and subsequent runs will catch visual regressions.
//
// The etalon PDF screenshots in tests/references/etalon/ are the human source of
// truth — pixel comparison against a PDF renderer is not reliable, so we compare
// the app against its own committed baseline instead.

const URL = "/test-sheet";

for (let i = 1; i <= 4; i++) {
  test(`@visual page ${i} matches baseline`, async ({ page }) => {
    await page.goto(URL, { waitUntil: "networkidle" });
    const sheetPage = page.locator(".sheet-page").nth(i - 1);
    await expect(sheetPage).toBeVisible();
    await expect(sheetPage).toHaveScreenshot(`page${i}.png`, {
      maxDiffPixelRatio: 0.02,
    });
  });
}
