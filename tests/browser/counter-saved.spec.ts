// Saving checks for the Foldkit counter page (foldkit project only): every
// accepted click runs the printed save command, which writes the saved
// fields to localStorage, and a reload restores them through the printed
// [flags]. That a save restores to the same counter is proved in Rocq
// (theories/CounterFold.v, save_restore); these check the browser wiring.
import { test, expect, type Page } from "@playwright/test";

const key = "counter";
const btn = (page: Page, name: string) => page.getByRole("button", { name, exact: true });

async function expectCounter(page: Page, c: number, changes: number, locked = false) {
  await expect(page.locator("#count")).toHaveText(String(c));
  await expect(page.locator("#changes")).toHaveText(String(changes));
  await expect(page.locator("#status")).toHaveText(locked ? "Locked" : "Unlocked");
}

const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), key);

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/counter.html");
  await expect(page.locator("#count")).toHaveText("0");
  expect(errors).toEqual([]);
});

test("accepted clicks are saved, and a reload restores them", async ({ page }) => {
  expect(await stored(page)).toBeNull();
  await btn(page, "+100").click();
  await btn(page, "+10").click();
  await btn(page, "Lock").click();
  await expectCounter(page, 110, 2, true);
  await expect.poll(() => stored(page)).toBe('{"locked":true,"count":110,"changes":2}');
  await page.reload();
  await expectCounter(page, 110, 2, true);
  await expect(btn(page, "Unlock")).toBeEnabled();
  await expect(btn(page, "+1")).toBeDisabled();
});

test("the amount field is not saved", async ({ page }) => {
  await page.locator("#amount").fill("7");
  await btn(page, "Add amount").click();
  await expectCounter(page, 7, 1);
  await page.locator("#amount").fill("abc");
  await expect(btn(page, "Add amount")).toBeDisabled();
  await page.reload();
  await expectCounter(page, 7, 1);
  await expect(page.locator("#amount")).toHaveValue("250");
  await expect(btn(page, "Add amount")).toBeEnabled();
});

test("a stored value that breaks the cap, or is not a save, is ignored", async ({ page }) => {
  for (const bad of [
    '{"locked":false,"count":500,"changes":1}',
    '{"locked":false,"count":-1,"changes":1}',
    '{"locked":false,"count":4.5,"changes":1}',
    '{"locked":"no","count":4,"changes":1}',
    "{",
    "[]",
  ]) {
    await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, bad]);
    await page.reload();
    await expectCounter(page, 0, 0);
  }
  await page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, '{"locked":false,"count":499,"changes":9}']);
  await page.reload();
  await expectCounter(page, 499, 9);
  await expect(btn(page, "+1")).toBeDisabled();
});

test("a rejected click changes nothing, so the next save follows the last accepted one", async ({ page }) => {
  await btn(page, "+100").click();
  await expect.poll(() => stored(page)).toBe('{"locked":false,"count":100,"changes":1}');
  const minus100 = btn(page, "−100");
  await btn(page, "−100").click();
  await expect.poll(() => stored(page)).toBe('{"locked":false,"count":0,"changes":2}');
  // Force the disabled button back on and click it: update ignores the
  // message, so the model and the next save are as if it never happened.
  await expect(minus100).toBeDisabled();
  await minus100.evaluate((b: HTMLButtonElement) => { b.disabled = false; });
  await minus100.click();
  await expectCounter(page, 0, 2);
  await btn(page, "+1").click();
  await expect.poll(() => stored(page)).toBe('{"locked":false,"count":1,"changes":3}');
});
