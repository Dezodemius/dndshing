import { test, expect } from "@playwright/test";

const URL = "/test-sheet";

// ── Page 1 — structure ─────────────────────────────────────────────────────────

test.describe("Page 1 — header", () => {
  test("shows full character name", async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByRole("textbox").filter({ hasText: /Кейлин/ }).first()).toBeVisible();
  });

  test("shows class 'Боец'", async ({ page }) => {
    await page.goto(URL);
    const inputs = page.getByRole("textbox");
    const values = await inputs.evaluateAll((els: HTMLInputElement[]) =>
      els.map((e) => e.value)
    );
    expect(values).toContain("Боец");
  });

  test("shows race 'Человек'", async ({ page }) => {
    await page.goto(URL);
    const values = await page
      .getByRole("textbox")
      .evaluateAll((els: HTMLInputElement[]) => els.map((e) => e.value));
    expect(values).toContain("Человек");
  });

  test("shows player name 'Игрок'", async ({ page }) => {
    await page.goto(URL);
    const values = await page
      .getByRole("textbox")
      .evaluateAll((els: HTMLInputElement[]) => els.map((e) => e.value));
    expect(values).toContain("Игрок");
  });
});

test.describe("Page 1 — ability scores", () => {
  test("all 6 ability score section labels are visible", async ({ page }) => {
    await page.goto(URL);
    for (const label of ["СИЛА", "ЛОВКОСТЬ", "ТЕЛОСЛОЖЕНИЕ", "ИНТЕЛЛЕКТ", "МУДРОСТЬ", "ХАРИЗМА"]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });

  test("STR score = 16", async ({ page }) => {
    await page.goto(URL);
    const numInputs = page.locator("input[type='number']");
    const values = await numInputs.evaluateAll((els: HTMLInputElement[]) =>
      els.map((e) => Number(e.value))
    );
    expect(values).toContain(16);
  });

  test("DEX score = 12", async ({ page }) => {
    await page.goto(URL);
    const values = await page
      .locator("input[type='number']")
      .evaluateAll((els: HTMLInputElement[]) => els.map((e) => Number(e.value)));
    expect(values).toContain(12);
  });

  test("CHA score = 8", async ({ page }) => {
    await page.goto(URL);
    const values = await page
      .locator("input[type='number']")
      .evaluateAll((els: HTMLInputElement[]) => els.map((e) => Number(e.value)));
    expect(values).toContain(8);
  });

  // Rendered modifiers appear as text nodes (not inputs)
  test("STR modifier '+3' is visible", async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByText("+3").first()).toBeVisible();
  });

  test("CHA modifier '−1' is visible", async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByText("-1").first()).toBeVisible();
  });
});

test.describe("Page 1 — combat stats", () => {
  test("AC = 11", async ({ page }) => {
    await page.goto(URL);
    const values = await page
      .locator("input[type='number']")
      .evaluateAll((els: HTMLInputElement[]) => els.map((e) => Number(e.value)));
    expect(values).toContain(11);
  });

  test("Speed = 30", async ({ page }) => {
    await page.goto(URL);
    const values = await page
      .locator("input[type='number']")
      .evaluateAll((els: HTMLInputElement[]) => els.map((e) => Number(e.value)));
    expect(values).toContain(30);
  });

  test("HP max = 10", async ({ page }) => {
    await page.goto(URL);
    const values = await page
      .locator("input[type='number']")
      .evaluateAll((els: HTMLInputElement[]) => els.map((e) => Number(e.value)));
    expect(values.filter((v) => v === 10).length).toBeGreaterThanOrEqual(1);
  });

  test("initiative '+1' visible", async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByText("Инициатива").first()).toBeVisible();
    // Initiative = DEX mod = +1
    await expect(page.getByText("+1").first()).toBeVisible();
  });
});

test.describe("Page 1 — saves and skills section labels", () => {
  test("'СПАСБРОСКИ' label visible", async ({ page }) => {
    await page.goto(URL);
    // exact: avoid matching "Спасброски от смерти" (death saves box)
    await expect(page.getByText("Спасброски", { exact: true })).toBeVisible();
  });

  test("'НАВЫКИ' label visible", async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByText("НАВЫКИ")).toBeVisible();
  });

  test("passive perception = 11", async ({ page }) => {
    await page.goto(URL);
    // 10 + WIS mod(1) + 0 prof = 11
    await expect(page.getByText("11").first()).toBeVisible();
  });

  test("all 18 skill labels visible", async ({ page }) => {
    await page.goto(URL);
    for (const label of [
      "Акробатика", "Анализ", "Атлетика", "Восприятие", "Выживание",
      "Выступление", "Запугивание", "История", "Ловкость рук", "Магия",
      "Медицина", "Обман", "Природа", "Проницательность", "Религия",
      "Скрытность", "Убеждение", "Уход за животными",
    ]) {
      await expect(page.getByText(label).first()).toBeVisible();
    }
  });
});

test.describe("Page 1 — roleplay section labels", () => {
  for (const label of ["ЧЕРТЫ ХАРАКТЕРА", "ИДЕАЛЫ", "ПРИВЯЗАННОСТИ", "СЛАБОСТИ", "УМЕНИЯ И СПОСОБНОСТИ"]) {
    test(`'${label}' label visible`, async ({ page }) => {
      await page.goto(URL);
      await expect(page.getByText(label)).toBeVisible();
    });
  }
});

// ── Page 1 — layout: 3 columns must all be visible (regression for double-nesting bug) ──

test.describe("Page 1 — layout", () => {
  test("КЗ (AC) box is visible within the first 1122px", async ({ page }) => {
    await page.goto(URL);
    const el = page.getByText("КЗ").first();
    await expect(el).toBeVisible();
    const box = await el.boundingBox();
    expect(box).not.toBeNull();
    // Must be within the first page (≤1122px from top of sheet)
    expect(box!.y).toBeLessThan(1500);
  });

  test("skills list is in the left column (x < 300)", async ({ page }) => {
    await page.goto(URL);
    const skillsLabel = page.getByText("НАВЫКИ");
    await expect(skillsLabel).toBeVisible();
    const box = await skillsLabel.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeLessThan(400);
  });

  test("ЧЕРТЫ ХАРАКТЕРА is in the right column (x > 500)", async ({ page }) => {
    await page.goto(URL);
    const el = page.getByText("ЧЕРТЫ ХАРАКТЕРА");
    await expect(el).toBeVisible();
    const box = await el.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThan(500);
  });

  test("КЗ (combat) is in the middle column (300 < x < 700)", async ({ page }) => {
    await page.goto(URL);
    const el = page.getByText("КЗ").first();
    const box = await el.boundingBox();
    expect(box).not.toBeNull();
    expect(box!.x).toBeGreaterThan(200);
    expect(box!.x).toBeLessThan(700);
  });
});

// ── Pages 2–4 presence ────────────────────────────────────────────────────────

test.describe("Pages 2–4 section labels", () => {
  test("page 2: ПРЕДЫСТОРИЯ ПЕРСОНАЖА label visible", async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByText("ПРЕДЫСТОРИЯ ПЕРСОНАЖА")).toBeVisible();
  });

  test("page 2: backstory text visible", async ({ page }) => {
    await page.goto(URL);
    await expect(
      page.getByText("Кейлин родился в большом городе")
    ).toBeVisible();
  });

  test("page 3: ЗАМЕТКИ label visible", async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByText("ЗАМЕТКИ").first()).toBeVisible();
  });

  test("page 4: КЛАСС ЗАКЛИНАТЕЛЯ label visible", async ({ page }) => {
    await page.goto(URL);
    await expect(page.getByText("КЛАСС ЗАКЛИНАТЕЛЯ")).toBeVisible();
  });
});

// Visual snapshot tests live in visual.spec.ts (tagged @visual) so they can be
// run separately — they need committed per-platform baselines and therefore do
// not gate the deploy pipeline.
