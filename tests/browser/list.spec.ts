// Integration checks for every front end: event wiring and rendering.
// The general state properties are proved in Rocq; these tests only provide
// evidence that each renderer connects the verified core to the DOM correctly.
// Projects (playwright.config.ts):
//   jsoo:    browser/host.ml driving the extracted update/view
//   react:   react/src/App.tsx driving the generated XState config
//   foldkit: foldkit-web/src/list.ts driving the printed Foldkit program
import { test, expect, type Page } from "@playwright/test";

const rows = (page: Page) => page.locator("#items button");
const row = (page: Page, label: string) => page.getByRole("button", { name: label, exact: true });
const del = (page: Page) => page.getByRole("button", { name: "Delete selected" });
const reset = (page: Page) => page.getByRole("button", { name: "Reset" });

// Lets any pending render reach the DOM (Foldkit dispatches in a microtask
// and renders in an animation frame) before a check that nothing changed,
// which would otherwise pass at once.
const settle = (page: Page) =>
  page.evaluate(() => new Promise<void>((r) => requestAnimationFrame(() => requestAnimationFrame(() => r()))));

// Every check retries until it holds: Foldkit renders after the click
// handler returns, so the DOM may still show the previous model.
async function expectState(page: Page, labels: string[], selected: string | null) {
  await expect(rows(page)).toHaveText(labels);
  await expect
    .poll(() =>
      rows(page).evaluateAll((bs) =>
        bs.map((b) => [b.textContent, b.getAttribute("aria-pressed"), b.classList.contains("selected")]),
      ),
    )
    .toEqual(labels.map((l) => [l, l === selected ? "true" : "false", l === selected]));
  if (selected === null) await expect(del(page)).toBeDisabled();
  else await expect(del(page)).toBeEnabled();
  await expect(reset(page)).toBeEnabled();
  if (labels.length === 0) await expect(page.locator("#empty")).toBeVisible();
  else await expect(page.locator("#empty")).toBeHidden();
}

test.beforeEach(async ({ page }) => {
  const errors: string[] = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(rows(page)).toHaveCount(3);
  expect(errors).toEqual([]);
});

test("initial rendering", async ({ page }) => {
  await expectState(page, ["Alpha", "Beta", "Gamma"], null);
  expect(
    await rows(page).evaluateAll((bs) => bs.map((b) => [(b as HTMLButtonElement).type, b.dataset.id])),
  ).toEqual([["button", "1"], ["button", "2"], ["button", "3"]]);
  // The native property, not just the attribute, reflects the view flag.
  expect(await del(page).evaluate((b: HTMLButtonElement) => b.disabled)).toBe(true);
});

test("selection highlights exactly the chosen row", async ({ page }) => {
  await row(page, "Beta").click();
  await expectState(page, ["Alpha", "Beta", "Gamma"], "Beta");
  expect(await del(page).evaluate((b: HTMLButtonElement) => b.disabled)).toBe(false);
  await row(page, "Gamma").click();
  await expectState(page, ["Alpha", "Beta", "Gamma"], "Gamma");
  await row(page, "Gamma").click();
  await settle(page);
  await expectState(page, ["Alpha", "Beta", "Gamma"], "Gamma");
});

test("delete removes the intended row and keeps order", async ({ page }) => {
  await row(page, "Beta").click();
  await del(page).click();
  await expectState(page, ["Alpha", "Gamma"], null);
  // Selecting the deleted ID is impossible from the UI; a second delete is disabled.
  await expect(row(page, "Beta")).toHaveCount(0);
});

test("reselect then delete removes the last selection", async ({ page }) => {
  await row(page, "Alpha").click();
  await row(page, "Gamma").click();
  await del(page).click();
  await expectState(page, ["Alpha", "Beta"], null);
});

test("delete down to the empty state, then reset", async ({ page }) => {
  for (const label of ["Alpha", "Beta", "Gamma"]) {
    await row(page, label).click();
    await del(page).click();
  }
  await expectState(page, [], null);
  await expect(page.locator("#items li")).toHaveCount(0);
  await reset(page).click();
  await expectState(page, ["Alpha", "Beta", "Gamma"], null);
});

test("reset works from a selected state and repeatedly", async ({ page }) => {
  await row(page, "Beta").click();
  await reset(page).click();
  await expectState(page, ["Alpha", "Beta", "Gamma"], null);
  await reset(page).click();
  await expectState(page, ["Alpha", "Beta", "Gamma"], null);
});

// jsoo: the detached button still has its Select(2) handler, so this checks
// that the core ignores the absent ID. react: React delegates events from the
// root, so a detached button's click never reaches a handler; the absent-ID
// case for the machine is covered by tests/xstate (SELECT_2 after delete).
// foldkit: the virtual DOM removes a destroyed element's listeners, so the
// click also reaches nothing; ClickedItem for an absent id is covered by
// tests/foldkit/list.test.mjs and proved in ListFold.v.
test("a retained handler naming an absent ID leaves the state unchanged", async ({ page }) => {
  const staleBeta = await row(page, "Beta").elementHandle();
  await row(page, "Beta").click();
  await del(page).click();
  await row(page, "Alpha").click();
  await expectState(page, ["Alpha", "Gamma"], "Alpha");

  // The old Beta button is detached but still carries its Select(2) handler.
  expect(await staleBeta!.evaluate((b) => b.isConnected)).toBe(false);
  await staleBeta!.evaluate((b: HTMLButtonElement) => b.click());
  await settle(page);
  await expectState(page, ["Alpha", "Gamma"], "Alpha");
});

test("a retained handler naming a present ID behaves normally", async ({ page }, testInfo) => {
  const staleAlpha = await row(page, "Alpha").elementHandle();
  await row(page, "Gamma").click();
  // host.ml rebuilds every row on render; React and Foldkit reuse the keyed element.
  expect(await staleAlpha!.evaluate((b) => b.isConnected)).toBe(testInfo.project.name !== "jsoo");
  await staleAlpha!.evaluate((b: HTMLButtonElement) => b.click());
  await expectState(page, ["Alpha", "Beta", "Gamma"], "Alpha");
});

test("the host exposes no application state to page scripts", async ({ page }) => {
  // Compare against a pristine window to find globals the bundle added.
  const added = await page.evaluate(() => {
    const frame = document.createElement("iframe");
    document.body.append(frame);
    const pristine = new Set(Object.getOwnPropertyNames(frame.contentWindow!));
    frame.remove();
    return Object.getOwnPropertyNames(window).filter((k) => !pristine.has(k));
  });
  // js_of_ocaml installs only its runtime hooks; no extracted state or
  // event constructor is reachable by name.
  expect(added.filter((k) => /state|update|view|verified|core|dispatch/i.test(k))).toEqual([]);
  console.log(`globals added by the bundle: ${JSON.stringify(added)}`);
});
