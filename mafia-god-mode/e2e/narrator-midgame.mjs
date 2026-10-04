// Regression test: turning the narrator on in the middle of a game must speak right away (catching up on
// the current moment) and start the music, then keep narrating new lines. Speech is stubbed so we can see what it says.
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:5173";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => { console.error("PAGE ERROR", e.message); process.exitCode = 1; });
await pg.addInitScript(() => {
  window.__spoken = [];
  window.__live = 0;
  const synth = {
    speaking: false, getVoices: () => [], cancel() {}, addEventListener() {}, removeEventListener() {},
    speak(u) { window.__spoken.push(u.text); setTimeout(() => u.onend && u.onend(), 30); },
  };
  Object.defineProperty(window, "speechSynthesis", { value: synth, configurable: true });
  window.SpeechSynthesisUtterance = function (t) { this.text = t; };
  for (const m of ["createOscillator", "createBufferSource"]) {
    const orig = AudioContext.prototype[m];
    AudioContext.prototype[m] = function (...a) { const n = orig.apply(this, a); window.__live++; n.addEventListener("ended", () => window.__live--); return n; };
  }
});

await pg.goto(BASE);
await pg.fill("#name", "Venkat");
await pg.click("text=Create a game");
await pg.waitForSelector("text=Fill to 6 players");
await pg.click("text=Fill to 6 players");
await pg.waitForSelector("text=Players (6)");
await pg.click("text=Start game");           // narrator stays OFF while the game begins
await pg.click("text=I have seen my role");

// Let the game run (narrator OFF) until the daytime discussion, which waits for minutes with no new narration.
// The human may be picked at night, so answer the night prompt if it shows up.
for (let i = 0; i < 120; i++) {
  if (await pg.locator("text=The village gathers").count()) break;
  const opt = pg.locator('button[role="option"]:not([disabled])').first();
  if (await opt.count()) await opt.click().catch(() => {});
  await pg.waitForTimeout(500);
}
await pg.waitForSelector("text=The village gathers", { timeout: 5000 });
await pg.waitForTimeout(1500);
console.log("spoken while narrator was off:", await pg.evaluate(() => window.__spoken.length));

// Now turn the narrator on mid-game.
const shown = (await pg.locator(".narration").first().innerText()).trim();
await pg.click("button:has-text('Narrator off')");
await pg.waitForTimeout(1500);
const spoken = await pg.evaluate(() => window.__spoken);
const live = await pg.evaluate(() => window.__live);
console.log("on screen:", JSON.stringify(shown));
console.log("spoken after turning on:", JSON.stringify(spoken));
console.log("live audio nodes (music):", live);
let ok = true;
if (!spoken.length) { console.error("FAIL: narrator said nothing after being turned on mid-game"); ok = false; }
if (live === 0) { console.error("FAIL: no background music started"); ok = false; }
await browser.close();
process.exit(ok && !process.exitCode ? 0 : 1);
