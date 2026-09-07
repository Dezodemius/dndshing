import path from 'node:path'
import { expect, test } from '@playwright/test'
import { getFilledSheet, openSheet } from './fixtures'
import { compareToEtalon, PIXEL_TOLERANCE } from './etalon-compare'

const ETALON_DIR = path.resolve(process.cwd(), 'tests/references/etalon')
const VISUAL_THRESHOLD = 0.12

// Informational only in CI: supplied pages are PDF rasterisations, so browser
// font rendering cannot be pixel-identical. Tolerance and threshold are fixed
// regression criteria, not environment switches.
for (let pageNumber = 1; pageNumber <= 4; pageNumber += 1) {
  test(`@visual printable page ${pageNumber} vs immutable reference`, async ({ page }, testInfo) => {
    await openSheet(page, getFilledSheet())
    await page.locator('.printable-sheet__toolbar').evaluate((toolbar) => {
      toolbar.setAttribute('style', 'display: none !important')
    })
    const sheetPage = page.locator(`[data-sheet-page="${pageNumber}"]`)
    await expect(sheetPage).toBeVisible()

    const screenshot = await sheetPage.screenshot()
    const comparison = await compareToEtalon(
      screenshot,
      path.join(ETALON_DIR, `page${pageNumber}.png`),
      PIXEL_TOLERANCE,
    )
    await testInfo.attach(`page${pageNumber}-actual`, { body: comparison.actualPng, contentType: 'image/png' })
    await testInfo.attach(`page${pageNumber}-diff`, { body: comparison.diffPng, contentType: 'image/png' })
    testInfo.annotations.push({ type: 'visual-diff-ratio', description: comparison.diffRatio.toFixed(6) })
    expect(comparison.diffRatio).toBeLessThanOrEqual(VISUAL_THRESHOLD)
  })
}
