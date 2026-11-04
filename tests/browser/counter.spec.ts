// Integration checks for the counter page, run against two front ends:
//   react:   react/src/Counter.tsx shows the generated machine's context and
//            meta, and enables each button exactly when snapshot.can says
//            its event is accepted;
//   foldkit: foldkit-web/src/main.ts shows the printed program's model, and
//            enables each button exactly when can(model, message) holds.
// The cap itself is proved in Rocq (theories/Counter.v, CounterMachine.v,
// CounterFold.v).
import { test, expect, type Page } from "@playwright/test";

const btn = (page: Page, name: string) => page.getByRole("button", { name, exact: true });
const count = (page: Page) => page.locator("#count");

async function press(page: Page, name: string, times = 1) {
  for (let i = 0; i < times; i++) await btn(page, name).click();
}

async function expectCounter(page: Page, c: number, changes: number, locked = false) {
  await expect(count(page)).toHaveText(String(c));
  await expect(page.locator("#changes")).toHaveText(String(changes));
  await expect(page.locator("#status")).toHaveText(locked ? "Locked" : "Unlocked");
  expect(await page.locator("#meter").evaluate((m: HTMLMeterElement) => [m.value, m.max])).toEqual([c, 500]);
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/counter.html");
  await expect(count(page)).toHaveText("0");
  expect(errors).toEqual([]);
});

test("initial rendering", async ({ page }) => {
  await expectCounter(page, 0, 0);
  await expect(page.locator("#limit")).toHaveText("500");
  for (const name of ["−100", "−10", "−1", "Unlock"]) await expect(btn(page, name)).toBeDisabled();
  for (const name of ["+1", "+10", "+100", "Reset", "Lock", "Add amount"]) await expect(btn(page, name)).toBeEnabled();
});

test("climbing to the cap disables exactly the steps that would cross it", async ({ page }) => {
  await press(page, "+100", 4);
  await expectCounter(page, 400, 4);
  await expect(btn(page, "+100")).toBeDisabled(); // 400 + 100 = 500 is not below 500
  await press(page, "+10", 9);
  await expectCounter(page, 490, 13);
  await expect(btn(page, "+10")).toBeDisabled();
  await press(page, "+1", 9);
  await expectCounter(page, 499, 22);
  for (const name of ["+1", "+10", "+100"]) await expect(btn(page, name)).toBeDisabled();
  await press(page, "−1");
  await expectCounter(page, 498, 23);
  await expect(btn(page, "+1")).toBeEnabled();
});

test("the machine, not the UI, enforces the cap", async ({ page }) => {
  await press(page, "+100", 4);
  await press(page, "+10", 9);
  // Force the disabled +100 button back on and click it: the guard rejects
  // the event, so nothing changes.
  const plus100 = btn(page, "+100");
  await expect(plus100).toBeDisabled();
  await plus100.evaluate((b: HTMLButtonElement) => { b.disabled = false; });
  await plus100.click();
  await expectCounter(page, 490, 13);
});

test("subtraction never goes below zero", async ({ page }) => {
  await press(page, "+10");
  await expect(btn(page, "−100")).toBeDisabled();
  await expect(btn(page, "−10")).toBeEnabled();
  await press(page, "−10");
  await expectCounter(page, 0, 2);
  await expect(btn(page, "−1")).toBeDisabled();
});

test("custom amounts follow the same guards", async ({ page }) => {
  const amount = page.locator("#amount");
  await amount.fill("499");
  await press(page, "Add amount");
  await expectCounter(page, 499, 1);
  await amount.fill("1");
  await expect(btn(page, "Add amount")).toBeDisabled();
  await amount.fill("499");
  await press(page, "Subtract amount");
  await expectCounter(page, 0, 2);
  await amount.fill("500");
  await expect(btn(page, "Add amount")).toBeDisabled();
  await expect(btn(page, "Subtract amount")).toBeDisabled();
  for (const bad of ["", "1.5", "-3", "abc", "1e3"]) {
    await amount.fill(bad);
    await expect(btn(page, "Add amount")).toBeDisabled();
    await expect(btn(page, "Subtract amount")).toBeDisabled();
  }
});

test("lock disables everything but unlock", async ({ page }) => {
  await press(page, "+10", 2);
  await press(page, "Lock");
  await expectCounter(page, 20, 2, true);
  for (const name of ["+1", "+10", "+100", "−1", "−10", "−100", "Reset", "Lock", "Add amount", "Subtract amount"]) {
    await expect(btn(page, name)).toBeDisabled();
  }
  await press(page, "Unlock");
  await expectCounter(page, 20, 2, false);
  await expect(btn(page, "Unlock")).toBeDisabled();
});

test("reset returns to zero changes", async ({ page }) => {
  await press(page, "+100", 3);
  await press(page, "Reset");
  await expectCounter(page, 0, 0);
});
