// Saving checks for the Foldkit list page (foldkit project only): every
// accepted click runs the printed save command, which writes the list and
// the selection to localStorage, and a reload restores them through the
// printed [flags]. That whatever is stored restores to a valid list, and
// that a save restores to the same list, is proved in Rocq
// (theories/ListFold.v, restore_valid and save_restore); these check the
// browser wiring.
import { test, expect, type Page } from "@playwright/test";

const key = "list";
const rows = (page: Page) => page.locator("#items button");
const row = (page: Page, label: string) => page.getByRole("button", { name: label, exact: true });
const del = (page: Page) => page.getByRole("button", { name: "Delete selected" });
const reset = (page: Page) => page.getByRole("button", { name: "Reset" });

async function expectState(page: Page, labels: string[], selected: string | null) {
  await expect(rows(page)).toHaveText(labels);
  await expect
    .poll(() => rows(page).evaluateAll((bs) => bs.map((b) => b.getAttribute("aria-pressed"))))
    .toEqual(labels.map((l) => (l === selected ? "true" : "false")));
  if (selected === null) await expect(del(page)).toBeDisabled();
  else await expect(del(page)).toBeEnabled();
  if (labels.length === 0) await expect(page.locator("#empty")).toBeVisible();
  else await expect(page.locator("#empty")).toBeHidden();
}

const stored = (page: Page) => page.evaluate((k) => localStorage.getItem(k), key);
const store = (page: Page, value: string) =>
  page.evaluate(([k, v]) => localStorage.setItem(k, v), [key, value]);

const item = (id: number, label: string) => ({ id, label });
const save = (selected: number | null, items: { id: number; label: string }[]) =>
  JSON.stringify({ selected, items });
const start = [item(1, "Alpha"), item(2, "Beta"), item(3, "Gamma")];

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expectState(page, ["Alpha", "Beta", "Gamma"], null);
  expect(errors).toEqual([]);
});

test("selections and deletes are saved, and a reload restores them", async ({ page }) => {
  expect(await stored(page)).toBeNull();
  await row(page, "Beta").click();
  await expect.poll(() => stored(page)).toBe(save(2, start));
  await del(page).click();
  await expect.poll(() => stored(page)).toBe(save(null, [item(1, "Alpha"), item(3, "Gamma")]));
  await row(page, "Gamma").click();
  await expect.poll(() => stored(page)).toBe(save(3, [item(1, "Alpha"), item(3, "Gamma")]));
  await page.reload();
  await expectState(page, ["Alpha", "Gamma"], "Gamma");
  // The restored list goes on as usual.
  await del(page).click();
  await expectState(page, ["Alpha"], null);
  await page.reload();
  await expectState(page, ["Alpha"], null);
});

test("the empty list and reset are saved", async ({ page }) => {
  for (const label of ["Alpha", "Beta", "Gamma"]) {
    await row(page, label).click();
    await del(page).click();
  }
  await expectState(page, [], null);
  await expect.poll(() => stored(page)).toBe(save(null, []));
  await page.reload();
  await expectState(page, [], null);
  await reset(page).click();
  await expect.poll(() => stored(page)).toBe(save(null, start));
  await page.reload();
  await expectState(page, ["Alpha", "Beta", "Gamma"], null);
});

test("a stored value that is not a valid list is ignored", async ({ page }) => {
  for (const bad of [
    save(9, [item(1, "One")]),
    save(null, [item(1, "One"), item(1, "Again")]),
    save(null, [item(1001, "Big")]),
    save(null, [item(1.5, "Half")]),
    save(null, [item(-1, "Minus")]),
    save(null, [item(1, 'Say "hi"')]),
    save(null, [item(1, "back\\slash")]),
    save(null, [item(1, "two\nlines")]),
    save(null, [item(1, "café")]),
    JSON.stringify({ items: [item(1, "One")] }),
    JSON.stringify({ selected: null, items: [{ id: 1 }] }),
    "{",
    "[]",
  ]) {
    await store(page, bad);
    await page.reload();
    await expectState(page, ["Alpha", "Beta", "Gamma"], null);
    // Nothing is saved until a click is accepted.
    expect(await stored(page)).toBe(bad);
  }
  // A valid list someone else wrote is restored, extra keys dropped, and
  // the next save writes it back in the program's own form.
  await store(page, JSON.stringify({ items: [{ id: 7, label: "Seven", done: true }, item(1000, "Max")], selected: 7, x: 1 }));
  await page.reload();
  await expectState(page, ["Seven", "Max"], "Seven");
  await row(page, "Max").click();
  await expect.poll(() => stored(page)).toBe(save(1000, [item(7, "Seven"), item(1000, "Max")]));
});

test("a rejected click changes nothing, so nothing is saved", async ({ page }) => {
  await row(page, "Alpha").click();
  await del(page).click();
  await expect.poll(() => stored(page)).toBe(save(null, [item(2, "Beta"), item(3, "Gamma")]));
  // Mark the store, force the disabled Delete button back on, and click
  // it: update ignores the message, so no save overwrites the mark.
  await store(page, "mark");
  await expect(del(page)).toBeDisabled();
  await del(page).evaluate((b: HTMLButtonElement) => { b.disabled = false; });
  await del(page).click();
  await page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));
  // (The button stays as forced: the model did not change, so nothing re-renders.)
  await expect(rows(page)).toHaveText(["Beta", "Gamma"]);
  expect(await stored(page)).toBe("mark");
  // The next accepted click saves again.
  await row(page, "Gamma").click();
  await expect.poll(() => stored(page)).toBe(save(3, [item(2, "Beta"), item(3, "Gamma")]));
});
