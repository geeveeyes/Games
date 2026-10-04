// Browser test: one person plus bots play a whole game on a single phone.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:5173";
const shots = process.env.SHOTS ?? "/tmp/mgm-solo";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
const pg = await ctx.newPage();
// Count live audio nodes so we can prove nothing keeps playing after leaving the room.
await pg.addInitScript(() => {
  window.__live = 0;
  for (const m of ["createOscillator", "createBufferSource"]) {
    const orig = AudioContext.prototype[m];
    AudioContext.prototype[m] = function (...a) {
      const n = orig.apply(this, a);
      window.__live++;
      n.addEventListener("ended", () => window.__live--);
      return n;
    };
  }
});
pg.on("pageerror", (e) => { console.error("PAGE ERROR", e.message); process.exitCode = 1; });

await pg.goto(BASE);
await pg.fill("#name", "Venkat");
await pg.click("text=Create a game");
await pg.waitForSelector("text=Fill to 6 players");
await pg.click("text=Fill to 6 players");
await pg.waitForSelector("text=Players (6)");
await pg.screenshot({ path: `${shots}/lobby-bots.png`, fullPage: true });
await pg.click("button:has-text(\"Narrator off\")");
await pg.click("text=Start game");

const snap = {};
let said = false;
const deadline = Date.now() + 240_000;
let over = false;
while (!over && Date.now() < deadline) {
  if (await pg.locator("text=Winners").count()) { over = true; break; }
  const card = pg.locator("button.card");
  if (await card.count() && (await pg.locator("text=I have seen my role").count())) {
    await pg.click("text=I have seen my role", { timeout: 1500 }).catch(() => {});
  }
  const opt = pg.locator('button[role="option"]:not([disabled])').first();
  if (await opt.count()) await opt.click().catch(() => {});
  if (await pg.locator("#say").count()) {
    if (!said) {
      const names = await pg.locator(".talklist b").allInnerTexts();
      await pg.fill("#say", `${names[0] ?? "Maya"}, you seem suspicious`);
      await pg.click("button:has-text('Say')");
      said = true;
    }
    if (!snap.talk && (await pg.locator(".talklist li").count()) >= 2) { await pg.screenshot({ path: `${shots}/talk.png` }); snap.talk = 1; }
  }
  for (const label of ["Start the vote now", "Next speaker", "Go to the final vote"]) {
    const b = pg.locator(`text=${label}`);
    if (await b.count()) await b.click().catch(() => {});
  }
  await pg.waitForTimeout(300);
}
await pg.screenshot({ path: `${shots}/over.png`, fullPage: true });
const before = await pg.evaluate(() => window.__live);
await pg.click("text=Leave room");
await pg.waitForSelector("text=Create a game");
await pg.waitForTimeout(9000);
const after = await pg.evaluate(() => window.__live);
console.log("live audio nodes: while playing", before, "-> after leaving", after);
if (after !== 0) { console.error("AUDIO STILL PLAYING AFTER LEAVING"); process.exitCode = 1; }
console.log(over ? "GAME FINISHED" : "TIMED OUT", "said:", said);
await browser.close();
process.exit(over && !process.exitCode ? 0 : 1);
