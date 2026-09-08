import fs from 'node:fs/promises'
import path from 'node:path'
import { expect, test } from '@playwright/test'
import { openSheet } from './fixtures'
import { compareToEtalon, PIXEL_TOLERANCE } from './etalon-compare'
import { getZlatobradSheet } from './zlatobrad-fixture'

const ETALON_DIR = path.resolve(process.cwd(), 'tests/references/zlatobrad')
const VISUAL_THRESHOLD = 0.20

async function expectRelativeRect(
  page: import('@playwright/test').Page,
  selector: string,
  expected: { x: number; y: number; width: number; height: number },
): Promise<void> {
  const element = page.locator(selector)
  const pageRect = await element.locator('xpath=ancestor-or-self::*[@data-sheet-page][1]').boundingBox()
  const rect = await element.boundingBox()
  expect(rect, selector).not.toBeNull()
  expect(pageRect).not.toBeNull()
  if (!rect || !pageRect) return
  expect(Math.abs(rect.x - pageRect.x - expected.x), `${selector} x`).toBeLessThanOrEqual(3)
  expect(Math.abs(rect.y - pageRect.y - expected.y), `${selector} y`).toBeLessThanOrEqual(3)
  expect(Math.abs(rect.width - expected.width), `${selector} width`).toBeLessThanOrEqual(3)
  expect(Math.abs(rect.height - expected.height), `${selector} height`).toBeLessThanOrEqual(3)
}

async function assertReferenceGeometry(page: import('@playwright/test').Page, pageNumber: number): Promise<void> {
  const grids: Record<number, Array<[string, { x: number; y: number; width: number; height: number }]>> = {
    1: [
      ['.printable-sheet__page-grid--three', { x: 48, y: 158, width: 700, height: 890 }],
      ['.printable-sheet__page-grid--three > [data-sheet-page-column="left"]', { x: 48, y: 158, width: 226, height: 890 }],
      ['.printable-sheet__page-grid--three > [data-sheet-page-column="center"]', { x: 284, y: 158, width: 227, height: 890 }],
      ['.printable-sheet__page-grid--three > [data-sheet-page-column="right"]', { x: 521, y: 158, width: 227, height: 890 }],
    ],
    2: [
      ['.printable-sheet__page-grid--two', { x: 48, y: 158, width: 700, height: 890 }],
      ['.printable-sheet__page-grid--two > [data-sheet-page-column="left"]', { x: 48, y: 158, width: 229, height: 890 }],
      ['.printable-sheet__page-grid--two > [data-sheet-page-column="right"]', { x: 288, y: 158, width: 460, height: 890 }],
    ],
    3: [
      ['.printable-sheet__page-grid--notes', { x: 48, y: 158, width: 700, height: 890 }],
      ['.printable-sheet__page-grid--notes > [data-sheet-page-column="left"]', { x: 48, y: 158, width: 460, height: 890 }],
      ['.printable-sheet__page-grid--notes > [data-sheet-page-column="right"]', { x: 518, y: 158, width: 230, height: 890 }],
    ],
    4: [
      ['.printable-sheet__spell-columns', { x: 48, y: 113, width: 700, height: 935 }],
      ['.printable-sheet__spell-column:nth-child(1)', { x: 48, y: 113, width: 226, height: 935 }],
      ['.printable-sheet__spell-column:nth-child(2)', { x: 284, y: 113, width: 225, height: 935 }],
      ['.printable-sheet__spell-column:nth-child(3)', { x: 521, y: 113, width: 227, height: 935 }],
    ],
  }
  for (const [selector, expected] of grids[pageNumber]) {
    await expectRelativeRect(page, `[data-sheet-page="${pageNumber}"] ${selector}`, expected)
  }
}

// The reference is a 96 DPI PDF rasterisation. The comparison runs with print
// media so it exercises the same DOM and CSS that Chromium sends to PDF.
for (let pageNumber = 1; pageNumber <= 4; pageNumber += 1) {
  test(`@visual printable page ${pageNumber} vs immutable reference`, async ({ page }, testInfo) => {
    await page.emulateMedia({ media: 'print' })
    await openSheet(page, getZlatobradSheet())
    const sheetPage = page.locator(`[data-sheet-page="${pageNumber}"]`)
    await expect(sheetPage).toBeVisible()
    await assertReferenceGeometry(page, pageNumber)

    const screenshot = await sheetPage.screenshot()
    const comparison = await compareToEtalon(
      screenshot,
      path.join(ETALON_DIR, `page${pageNumber}.png`),
      PIXEL_TOLERANCE,
    )
    await testInfo.attach(`page${pageNumber}-actual`, { body: comparison.actualPng, contentType: 'image/png' })
    await testInfo.attach(`page${pageNumber}-diff`, { body: comparison.diffPng, contentType: 'image/png' })
    await fs.writeFile(testInfo.outputPath(`page${pageNumber}-actual.png`), comparison.actualPng)
    await fs.writeFile(testInfo.outputPath(`page${pageNumber}-diff.png`), comparison.diffPng)
    testInfo.annotations.push({ type: 'visual-diff-ratio', description: comparison.diffRatio.toFixed(6) })
    testInfo.annotations.push({
      type: 'missing-structure-ratio',
      description: comparison.missingStructureRatio.toFixed(6),
    })
    testInfo.annotations.push({
      type: 'extra-structure-ratio',
      description: comparison.extraStructureRatio.toFixed(6),
    })
    expect.soft(comparison.diffRatio, 'pixel diff ratio').toBeLessThanOrEqual(VISUAL_THRESHOLD)
  })
}
