// Browser test: five players and a TV screen play a whole game against the local dev server.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:5173";
const shots = process.env.SHOTS ?? "/tmp/mgm-shots";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const names = ["Ravi", "Meena", "Priya", "Arun", "Kavya"];
const pages = [];
for (const name of names) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.error("PAGE ERROR", name, e.message); process.exitCode = 1; });
  pages.push({ name, page, role: null });
}
const [host, ...rest] = pages;
await host.page.goto(BASE);
await host.page.fill("#name", host.name);
await host.page.click("text=Create a game");
const code = (await host.page.locator(".bigcode").innerText()).trim();
console.log("room", code);
for (const p of rest) {
  await p.page.goto(BASE);
  await p.page.fill("#name", p.name);
  await p.page.fill("#code", code);
  await p.page.click("text=Join game");
}
const tvCtx = await browser.newContext({ viewport: { width: 1280, height: 720 } });
const tv = await tvCtx.newPage();
await tv.goto(BASE);
await tv.fill("#code", code);
await tv.click("text=Show on TV");

await host.page.waitForSelector("text=Players (5)");
await host.page.screenshot({ path: `${shots}/lobby.png`, fullPage: true });
await tv.screenshot({ path: `${shots}/tv-lobby.png` });
await host.page.click("button:has-text(\"Rules\")");
await host.page.waitForSelector("text=How to play");
await host.page.screenshot({ path: `${shots}/rules.png` });
await host.page.keyboard.press("Escape");
await host.page.click("text=Narrator off");
await host.page.screenshot({ path: `${shots}/narrator.png` });
await host.page.click("text=Narrator off");
await host.page.click("text=Start game");

const snap = {};
const deadline = Date.now() + 300_000;
let over = false;
while (!over && Date.now() < deadline) {
  for (const p of pages) {
    const pg = p.page;
    if (await pg.locator("text=Winners").count()) { over = true; continue; }
    const card = pg.locator("button.card");
    if (await card.count() && (await pg.locator("text=I have seen my role").count())) {
      await card.dispatchEvent("pointerdown");
      p.role = (await card.locator(".big").innerText()).trim();
      if (!snap.reveal) { await pg.screenshot({ path: `${shots}/reveal.png` }); snap.reveal = 1; }
      await card.dispatchEvent("pointerup");
      await pg.click("text=I have seen my role", { timeout: 1500 }).catch(() => {});
    }
    const opt = pg.locator('button[role="option"]:not([disabled])').first();
    if (await opt.count()) {
      const phaseText = await pg.locator(".narration").innerText().catch(() => "");
      if (!snap.pick) { await pg.screenshot({ path: `${shots}/pick.png` }); snap.pick = 1; }
      if (/vote/i.test(phaseText) && !snap.vote) { await pg.screenshot({ path: `${shots}/vote.png` }); snap.vote = 1; }
      await opt.click().catch(() => {});
    }
    if (!snap.defense && (await pg.locator(".defender").count())) { await pg.screenshot({ path: `${shots}/defense.png` }); snap.defense = 1; }
    if (!snap.sleep && (await pg.locator("text=Keep your eyes closed").count())) { await pg.screenshot({ path: `${shots}/sleep.png` }); snap.sleep = 1; }
    if (p === host) {
      for (const label of ["Start the vote now", "Next speaker", "Go to the final vote"]) {
        const b = pg.locator(`text=${label}`);
        if (await b.count()) await b.click().catch(() => {});
      }
    }
  }
  if (!snap.tvnight && (await tv.locator(".tv-screen.night").count())) { await tv.screenshot({ path: `${shots}/tv-night.png` }); snap.tvnight = 1; }
  await host.page.waitForTimeout(250);
}
await host.page.screenshot({ path: `${shots}/over.png`, fullPage: true });
await tv.screenshot({ path: `${shots}/tv-over.png` });
console.log(over ? "GAME FINISHED" : "TIMED OUT");
console.log("roles", pages.map((p) => `${p.name}:${p.role}`).join(" "));
await browser.close();
process.exit(over && !process.exitCode ? 0 : 1);
