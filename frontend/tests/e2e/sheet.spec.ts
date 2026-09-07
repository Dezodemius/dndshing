import { readFileSync } from 'node:fs'
import path from 'node:path'
import { expect, test, type Locator, type Page } from '@playwright/test'
import { buildSheetModel, SHEET_BLOCKS, type SheetFieldValue } from '../../src/features/characters/sheet'
import { getEmptySheet, getFilledSheet, openSheet } from './fixtures'
import { SHEET_LAYOUT_SPEC, type SheetLayoutSpecEntry } from './layout-spec'

type CollectedFieldValue = string | boolean

const ru: unknown = JSON.parse(
  readFileSync(path.resolve(process.cwd(), 'src/i18n/locales/ru.json'), 'utf8'),
)

function canonicaliseFields(fields: Record<string, SheetFieldValue>): Record<string, CollectedFieldValue> {
  return Object.fromEntries(
    Object.entries(fields).map(([id, value]) => [id, typeof value === 'boolean' ? value : String(value)]),
  )
}

/** Reads checked for checkboxes; their HTML value is always "on" and is not data. */
async function collectSheetFields(root: Locator): Promise<Record<string, CollectedFieldValue>> {
  return root.locator('[data-sheet-field]').evaluateAll((nodes) => {
    const fields: Record<string, string | boolean> = {}
    for (const node of nodes) {
      const id = node.getAttribute('data-sheet-field')
      if (!id) continue
      const style = getComputedStyle(node)
      if (style.display === 'none' || style.visibility === 'hidden' || node.getClientRects().length === 0) {
        continue
      }

      let value: string | boolean
      if (node instanceof HTMLInputElement && node.type === 'checkbox') {
        value = node.checked
      } else if (node.classList.contains('printable-sheet__checkbox-print')) {
        value = node.textContent?.trim() === '☑'
      } else if (
        node instanceof HTMLInputElement ||
        node instanceof HTMLTextAreaElement ||
        node instanceof HTMLSelectElement
      ) {
        value = node.value
      } else {
        value = node.textContent?.trim() ?? ''
        const formattedModifier = id.startsWith('ability.') || id.startsWith('save.') ||
          id.startsWith('skill.') || id === 'proficiency.bonus' ||
          id === 'combat.initiative' || id === 'spellcasting.attack_bonus'
        if (formattedModifier && /^[+-]\d+$/.test(value)) value = String(Number(value))
        if (id === 'spellcasting.ability') {
          const abilityByLabel: Record<string, string> = {
            Сила: 'str',
            Ловкость: 'dex',
            Телосложение: 'con',
            Интеллект: 'int',
            Мудрость: 'wis',
            Харизма: 'cha',
          }
          value = abilityByLabel[value] ?? value
        }
      }

      if (id in fields && fields[id] !== value) {
        throw new Error(`data-sheet-field ${id} has inconsistent duplicate values`)
      }
      fields[id] = value
    }
    return fields
  })
}

function translate(key: string): string {
  const value = key.split('.').reduce<unknown>((current, part) => {
    if (typeof current !== 'object' || current === null || !(part in current)) return undefined
    return (current as Record<string, unknown>)[part]
  }, ru)
  if (typeof value !== 'string') throw new Error(`Missing Russian translation for ${key}`)
  return value
}

async function openPrintMode(page: Page): Promise<void> {
  await page.emulateMedia({ media: 'print' })
  await expect(page.locator('[data-sheet-document]')).toBeVisible()
}

function blockSelector(id: string): string {
  return `[data-sheet-block="${id}"]`
}

async function expectLayout(page: Page, entry: SheetLayoutSpecEntry): Promise<void> {
  const block = page.locator(`[data-sheet-page="${entry.page}"] ${blockSelector(entry.id)}`)
  await expect(block).toHaveCount(1)
  await expect(block).toContainText(translate(entry.labelKey))
  await expect(block).toHaveAttribute('data-sheet-row', String(entry.row))

  const sheetPage = block.locator('xpath=ancestor::*[@data-sheet-page][1]')
  await expect(sheetPage).toHaveAttribute('data-sheet-page', String(entry.page))
  if (entry.column === 'all') {
    await expect(block).toHaveAttribute('data-sheet-page-column', 'all')
  } else {
    const explicitColumn = await block.getAttribute('data-sheet-page-column')
    if (explicitColumn !== null) {
      expect(explicitColumn).toBe(entry.column)
    } else {
      const column = block.locator('xpath=ancestor::*[@data-sheet-page-column][1]')
      await expect(column).toHaveAttribute('data-sheet-page-column', entry.column)
    }
  }
}

for (const fixture of [
  { name: 'filled sheet', create: getFilledSheet },
  { name: 'empty sheet', create: getEmptySheet },
]) {
  test(`${fixture.name}: screen and print fields independently match the pure model`, async ({ page }) => {
    const sheet = fixture.create()
    const expected = canonicaliseFields(buildSheetModel(sheet, undefined, {
      itemName: (id) => `Предмет #${id}`,
      spellName: (id) => `Заклинание #${id}`,
    }).fields)
    await openSheet(page, sheet)
    const root = page.locator('[data-sheet-document]')
    await expect(root).toBeVisible()

    await page.emulateMedia({ media: 'screen' })
    await expect(collectSheetFields(root)).resolves.toEqual(expected)

    await openPrintMode(page)
    await expect(collectSheetFields(root)).resolves.toEqual(expected)
  })
}

test('checkbox parity reads checked state rather than the HTML value attribute', async ({ page }) => {
  await openSheet(page, getFilledSheet())
  const inspiration = page.locator('input[type="checkbox"][data-sheet-field="inspiration"]')
  await expect(inspiration).toBeChecked()
  await openPrintMode(page)
  await expect(inspiration).toBeChecked()
})

test('saving an edited field keeps the server-only content block in the sheet cache', async ({ page }) => {
  await openSheet(page, getFilledSheet())
  await page.getByLabel('Имя персонажа').first().fill('Кейлин Старший')
  await page.getByLabel('Потраченные ячейки 1 уровня').fill('2')
  await expect(page.getByLabel('Потраченные ячейки 1 уровня')).toHaveValue('2')
  const patchRequest = page.waitForRequest((request) => (
    request.method() === 'PATCH' && new URL(request.url()).pathname.endsWith('/characters/101')
  ))
  await page.getByRole('button', { name: 'Сохранить' }).click()

  const payload = (await patchRequest).postDataJSON() as Record<string, unknown>
  expect(payload.name).toBe('Кейлин Старший')
  expect(payload.spell_slots_spent).toMatchObject({ '1': 2 })
  await expect(page.getByText('Сохранено')).toBeVisible()
  await expect(page.locator('[data-sheet-field="identity.name"]:visible').first()).toHaveValue('Кейлин Старший')
  await expect(page.locator('[data-sheet-field="identity.class"]:visible').first()).toHaveText('Следопыт')
})

test('a failed save keeps the user edit in the form', async ({ page }) => {
  await openSheet(page, getFilledSheet())
  await page.route('**/api/v1/characters/101', async (route) => {
    await route.fulfill({ status: 500, json: { error: { code: 'internal_error', message: 'Failed' } } })
  })
  const name = page.getByLabel('Имя персонажа').first()
  await name.fill('Несохранённый Кейлин')
  await page.getByRole('button', { name: 'Сохранить' }).click()

  await expect(name).toHaveValue('Несохранённый Кейлин')
  await expect(page.locator('.printable-sheet__toolbar [role="alert"]')).toBeVisible()
})

test('print action calls window.print after validation', async ({ page }) => {
  await page.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printCalled = 'true'
    }
  })
  await openSheet(page, getFilledSheet())
  await page.getByRole('button', { name: 'Печать / PDF' }).click()
  await expect(page.locator('html')).toHaveAttribute('data-print-called', 'true')
})

test('print action reports overflowing text instead of clipping it', async ({ page }) => {
  const sheet = getFilledSheet()
  sheet.notes = Array.from({ length: 300 }, () => 'Строка').join('\n')
  await page.addInitScript(() => {
    window.print = () => {
      document.documentElement.dataset.printCalled = 'true'
    }
  })
  await openSheet(page, sheet)
  await page.getByRole('button', { name: 'Печать / PDF' }).click()

  await expect(page.getByRole('alert')).toContainText('Текст не помещается')
  await expect(page.locator('html')).not.toHaveAttribute('data-print-called', 'true')
})

test('named layout specification covers the print document', async ({ page }) => {
  const sheet = getFilledSheet()
  const model = buildSheetModel(sheet)
  const modelLayout = model.blocks.map(({ id, page: pageNumber, column, row }) => ({
    id,
    page: pageNumber,
    column:
      column === 'all'
        ? 'all'
        : column === 1
          ? 'left'
          : column === 3 || pageNumber === 2 || pageNumber === 3
            ? 'right'
            : 'center',
    row,
  }))
  const specifiedLayout = SHEET_LAYOUT_SPEC.map(({ id, page: pageNumber, column, row }) => ({
    id,
    page: pageNumber,
    column,
    row,
  }))
  expect(specifiedLayout).toEqual(modelLayout)
  expect(SHEET_LAYOUT_SPEC.map(({ id }) => id)).toEqual(SHEET_BLOCKS.map(({ id }) => id))
  for (const entry of SHEET_LAYOUT_SPEC) {
    if (entry.status !== 'implemented') expect(entry.reason).toMatch(/\S/)
  }

  await openSheet(page, sheet)
  await openPrintMode(page)
  const printBlocks = await page.locator('[data-sheet-block]').evaluateAll((nodes) =>
    nodes.map((node) => node.getAttribute('data-sheet-block')).filter((id): id is string => id !== null),
  )
  expect(printBlocks.sort()).toEqual(SHEET_LAYOUT_SPEC.map(({ id }) => id).sort())
  for (const entry of SHEET_LAYOUT_SPEC) await expectLayout(page, entry)
})

test('375px document has no horizontal viewport overflow and retains all four page groups', async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 })
  await openSheet(page, getFilledSheet())
  await expect(page.locator('[data-sheet-page]')).toHaveCount(4)
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(375)
  for (const pageNumber of ['1', '2', '3', '4']) {
    await expect(page.locator(`[data-sheet-page="${pageNumber}"]`)).toHaveCount(1)
  }
})

test('QA: browser produces four A4 PDF pages with print-side canonical coverage', async ({ page }, testInfo) => {
  const sheet = getFilledSheet()
  const expected = canonicaliseFields(buildSheetModel(sheet, undefined, {
    itemName: (id) => `Предмет #${id}`,
    spellName: (id) => `Заклинание #${id}`,
  }).fields)
  await openSheet(page, sheet)
  await openPrintMode(page)
  const root = page.locator('[data-sheet-document]')
  await expect(collectSheetFields(root)).resolves.toEqual(expected)
  await expect(page.locator('.printable-sheet__toolbar')).toBeHidden()
  await expect(page.locator('button:visible, input:visible, textarea:visible')).toHaveCount(0)

  const clipping = await page.locator('[data-sheet-page], [data-overflow-watch]:visible').evaluateAll((nodes) => (
    nodes.flatMap((node) => {
      const element = node as HTMLElement
      const clipped = element.scrollHeight > element.clientHeight + 1 || element.scrollWidth > element.clientWidth + 1
      return clipped ? [element.getAttribute('data-sheet-page') ?? element.getAttribute('data-sheet-field') ?? element.className] : []
    })
  ))
  expect(clipping).toEqual([])

  const pdf = await page.pdf({ format: 'A4', printBackground: true })
  await testInfo.attach('printable-character-sheet.pdf', { body: pdf, contentType: 'application/pdf' })
  expect(pdf.byteLength).toBeGreaterThan(1_000)
  expect(pdf.toString('latin1').match(/\/Type\s*\/Page\b/g)).toHaveLength(4)
  expect(pdf.toString('latin1')).not.toContain('/AcroForm')
})
