// Regression test: every lobby control works for the host, in a fresh room and in a room saved by an older version.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:5173";
const shots = process.env.SHOTS ?? "/tmp/mgm-settings";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let failures = 0;

async function exercise(label, page) {
  const errors = () => page.locator(".error").allInnerTexts();
  const check = async (what) => {
    await page.waitForTimeout(250);
    const e = await errors();
    if (e.length) { console.error(`  FAIL ${label} / ${what}: ${e.join(" | ")}`); failures++; }
  };
  let n = 0;
  // radios: click each one and confirm it becomes selected
  for (const name of ["mode", "vstyle", "vis"]) {
    const radios = page.locator(`input[type=radio][name=${name}]`);
    const count = await radios.count();
    for (let i = 0; i < count; i++) {
      // Controlled inputs only change after the server answers, so click and wait for the new state.
      await radios.nth(i).click();
      let selected = false;
      for (let t = 0; t < 20 && !selected; t++) { selected = await radios.nth(i).isChecked(); if (!selected) await page.waitForTimeout(150); }
      await check(`${name} #${i}`);
      if (!selected) { console.error(`  FAIL ${label} / ${name} #${i} did not become selected. Page says: ${(await errors()).join(" | ") || "(no error shown)"}`); failures++; }
      n++;
    }
  }
  // checkboxes: toggle each twice
  const boxes = page.locator(".check input[type=checkbox]");
  for (let i = 0; i < (await boxes.count()); i++) {
    for (let k = 0; k < 2; k++) { await boxes.nth(i).click(); await check(`checkbox #${i}`); n++; }
  }
  // selects: pick every option
  for (const sel of ["#mafia", "#day", "#defense", "#vote"]) {
    const el = page.locator(sel);
    if (!(await el.count())) continue;
    for (const value of await el.locator("option").evaluateAll((os) => os.map((o) => o.value))) {
      await el.selectOption(value);
      await check(`${sel}=${value}`);
      n++;
    }
  }
  // room name
  await page.fill("#roomname", "Family night");
  await page.locator("#roomname").blur();
  await check("room name");
  console.log(`${label}: exercised ${n} controls`);
}

const fresh = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
await fresh.goto(BASE);
await fresh.fill("#name", "Venkat");
await fresh.click("text=Create a game");
await fresh.waitForSelector("text=Who can join");
await exercise("fresh room", fresh);

if (process.env.CHECK_OLD_ROOM) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const old = await ctx.newPage();
  await old.addInitScript(() => {
    localStorage.setItem("mgm.token", "host");
    localStorage.setItem("mgm.session", JSON.stringify({ code: "OLDX", mode: "player" }));
  });
  await old.goto(BASE);
  await old.waitForSelector("text=Who can join");
  await exercise("old-format room", old);
}
await fresh.screenshot({ path: `${shots}/lobby.png`, fullPage: true });
await browser.close();
console.log(failures ? `${failures} FAILURES` : "all lobby controls work");
process.exit(failures ? 1 : 0);
