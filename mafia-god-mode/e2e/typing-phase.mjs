// Regression test: a half-typed chat message must survive the game moving to the next phase (day -> vote -> defense...),
// and the keyboard must stay open (focus stays in the box).
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:5173";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let failed = 0;
const fail = (m) => { console.error("FAIL:", m); failed++; };
let tested = false;

for (let attempt = 1; attempt <= 5 && !tested; attempt++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => fail("page error " + e.message));
  await pg.goto(BASE);
  await pg.fill("#name", "Venkat");
  await pg.click("text=Create a game");
  await pg.waitForSelector("text=Fill to 6 players");
  await pg.click("text=Fill to 6 players");
  await pg.waitForSelector("text=Players (6)");
  await pg.click("button:has-text('Start game')");
  // play until the daytime discussion, with the person still alive
  let ready = false;
  for (let i = 0; i < 160 && !ready; i++) {
    if (await pg.locator("text=I have seen my role").count()) await pg.click("text=I have seen my role", { timeout: 1500 }).catch(() => {});
    const opt = pg.locator('button[role="option"]:not([disabled])').first();
    if (await opt.count()) await opt.click().catch(() => {});
    ready = (await pg.locator("#say").count()) > 0 && (await pg.locator("text=The village gathers").count()) > 0;
    await pg.waitForTimeout(250);
  }
  if (!ready) { await ctx.close(); continue; }   // the person was eliminated at night; try a fresh game
  tested = true;
  await pg.click("#say");
  const phrase = "I think we should look at who stayed quiet";
  let lost = 0;
  for (let i = 0; i < phrase.length; i++) {
    await pg.keyboard.type(phrase[i]);
    await pg.waitForTimeout(120);
    if (i === 10) {
      // the host (this person) moves the game on mid-sentence, as the timer would
      await pg.evaluate(async () => {
        const token = localStorage.getItem("mgm.token");
        const code = JSON.parse(localStorage.getItem("mgm.session")).code;
        const call = (a) => fetch("/api/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ ...a, code, token }) }).then((r) => r.json());
        const v = (await call({ action: "poll" })).view;
        await call({ action: "skip", at: v.skipToken });
      });
    }
    if ((await pg.evaluate(() => document.activeElement?.id)) !== "say") lost++;
  }
  await pg.waitForTimeout(500);
  const value = await pg.inputValue("#say").catch(() => "");
  const phase = await pg.locator(".timer .tag").first().innerText().catch(() => "?");
  console.log(`typed ${value.length}/${phrase.length} characters across a phase change (${phase}), focus lost ${lost}x`);
  if (value !== phrase) fail(`message was lost or changed: "${value}"`);
  if (lost) fail("focus left the chat box");
  await ctx.close();
}
if (!tested) fail("never reached a daytime discussion with the person alive");
await browser.close();
console.log(failed ? `${failed} FAILURES` : "typing across phase changes works");
process.exit(failed ? 1 : 0);
