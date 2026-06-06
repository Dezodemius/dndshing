import path from "node:path";

import { test, expect } from "@playwright/test";

import { compareToEtalon } from "./etalon-compare";

// Visual comparison against the committed etalon images (tests/references/etalon).
//
// Tagged @visual and excluded from the deploy-gating e2e run. The etalons are
// PDF exports, so the current diff vs the HTML render is large and the default
// threshold is wide-open (non-gating) — the job's value is the attached
// actual/diff images. When the etalons are later replaced with real app
// screenshots, set VISUAL_THRESHOLD low (e.g. 0.02) to turn this into a real
// pixel-regression gate.

const URL = "/test-sheet";
const ETALON_DIR = path.resolve(process.cwd(), "tests/references/etalon");
const THRESHOLD = Number(process.env.VISUAL_THRESHOLD ?? "1");

for (let i = 1; i <= 4; i++) {
  test(`@visual page ${i} vs etalon`, async ({ page }, testInfo) => {
    await page.goto(URL, { waitUntil: "networkidle" });

    const sheetPage = page.locator(".sheet-page").nth(i - 1);
    await expect(sheetPage).toBeVisible();

    const shot = await sheetPage.screenshot();
    const etalonPath = path.join(ETALON_DIR, `page${i}.png`);
    const { diffRatio, actualPng, diffPng } = await compareToEtalon(shot, etalonPath);

    await testInfo.attach(`page${i}-actual`, {
      body: actualPng,
      contentType: "image/png",
    });
    await testInfo.attach(`page${i}-diff`, {
      body: diffPng,
      contentType: "image/png",
    });

    console.log(`page ${i}: diff vs etalon = ${(diffRatio * 100).toFixed(1)}%`);

    expect(diffRatio).toBeLessThanOrEqual(THRESHOLD);
  });
}
