// Browser test: recorded clips are played when they exist and the device voice covers the rest (names),
// and a game in Hindi narrates in Hindi. Clips are silent stand-ins made by the generator's "silent" provider.
import { chromium } from "playwright-core";
import { execSync } from "node:child_process";
import { existsSync, readFileSync, rmSync } from "node:fs";
import { join } from "node:path";

const BASE = process.env.BASE ?? "http://localhost:5173";
const OUT = "/tmp/mgm-clips";
rmSync(OUT, { recursive: true, force: true });
execSync(`npx tsx scripts/generate-narration.ts --lang=en,hi --provider=silent --out=${OUT}`, { stdio: "inherit" });

const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let failed = 0;
const fail = (m) => { console.error("FAIL:", m); failed++; };

async function game(lang) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => fail("page error " + e.message));
  await pg.route("**/narration/**", async (route) => {
    const file = join(OUT, new URL(route.request().url()).pathname.replace("/narration/", ""));
    if (!existsSync(file)) return route.fulfill({ status: 404, body: "" });
    route.fulfill({ status: 200, contentType: file.endsWith(".json") ? "application/json" : "audio/wav", body: readFileSync(file) });
  });
  await pg.addInitScript(() => {
    window.__spoken = []; window.__clips = [];
    Object.defineProperty(window, "speechSynthesis", { configurable: true, value: {
      getVoices: () => [], cancel() {}, addEventListener() {}, removeEventListener() {},
      speak(u) { window.__spoken.push({ text: u.text, lang: u.lang }); setTimeout(() => u.onend && u.onend(), 20); },
    } });
    window.SpeechSynthesisUtterance = function (t) { this.text = t; };
    const RealAudio = window.Audio;
    window.Audio = function (src) { const a = new RealAudio(src); if (src && !String(src).startsWith("data:")) { window.__clips.push(src); a.play = () => { setTimeout(() => a.onended && a.onended(), 20); return Promise.resolve(); }; } return a; };
  });
  await pg.goto(BASE);
  await pg.fill("#name", "Venkat");
  await pg.click("text=Create a game");
  await pg.waitForSelector("text=Fill to 6 players");
  await pg.selectOption("#lang", lang);
  await pg.click("text=Fill to 6 players");
  await pg.waitForSelector("text=Players (6)");
  await pg.click("button:has-text('Narrator')");           // turn the narrator on in the lobby
  await pg.waitForTimeout(600);                              // let the clip manifest load
  await pg.click("text=Start game");
  await pg.click("text=I have seen my role");
  for (let i = 0; i < 120; i++) {
    if ((await pg.evaluate(() => window.__clips.length)) >= 4) break;
    const opt = pg.locator('button[role="option"]:not([disabled])').first();
    if (await opt.count()) await opt.click().catch(() => {});
    await pg.waitForTimeout(400);
  }
  return { pg, spoken: await pg.evaluate(() => window.__spoken), clips: await pg.evaluate(() => window.__clips) };
}

const en = await game("en");
console.log(`English: ${en.clips.length} clips played, ${en.spoken.length} spoken by the device voice`);
if (en.clips.length < 3) fail("recorded clips were not played");
if (!en.clips.every((c) => /\/narration\/en\/[0-9a-f]{16}\.wav$/.test(c))) fail("unexpected clip URLs: " + en.clips.join(", "));
const staticSpoken = en.spoken.filter((s) => /Night falls|Darkness settles|The sun sets|close your eyes|open your eyes/.test(s.text));
if (staticSpoken.length) fail("a recorded line was also spoken by the device voice: " + JSON.stringify(staticSpoken));
else console.log("recorded lines used clips, not the device voice");

const hi = await game("hi");
const shown = await hi.pg.locator(".narration").first().textContent();
console.log(`Hindi: on screen "${shown?.trim().slice(0, 40)}…", ${hi.clips.length} clips, ${hi.spoken.length} spoken`);
if (!/[ऀ-ॿ]/.test(shown ?? "")) fail("narration on screen is not Hindi");
if (!/\/narration\/hi\//.test(hi.clips.join(" "))) fail("Hindi clips were not used");
for (const s of hi.spoken) if (s.lang && !/^hi/i.test(s.lang)) fail("device voice used the wrong language: " + JSON.stringify(s));

await browser.close();
console.log(failed ? `${failed} FAILURES` : "clip and language checks passed");
process.exit(failed ? 1 : 0);
