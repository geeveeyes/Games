// Browser test: the game-over screen shows awards and a timeline, the game lands in "My games" on this device,
// and the admin Games tab counts it. Needs the dev API started with FEEDBACK_ADMIN_KEY=testkey-1234567.
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:5173";
const KEY = process.env.FEEDBACK_ADMIN_KEY ?? "testkey-1234567";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let failed = 0;
const fail = (m) => { console.error("FAIL:", m); failed++; };
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => fail("page error " + e.message));

await pg.goto(BASE);
await pg.waitForSelector("text=My games"); // no history yet
await pg.fill("#name", "Venkat");
await pg.click("text=Create a game");
await pg.waitForSelector("text=Fill to 6 players");
await pg.click("text=Fill to 6 players");
await pg.waitForSelector("text=Players (6)");
await pg.click("button:has-text('Start game')");

const deadline = Date.now() + 200_000;
let over = false;
while (!over && Date.now() < deadline) {
  if (await pg.locator("text=Winners").count()) { over = true; break; }
  if (await pg.locator("text=I have seen my role").count()) await pg.click("text=I have seen my role", { timeout: 1500 }).catch(() => {});
  const opt = pg.locator('button[role="option"]:not([disabled])').first();
  if (await opt.count()) await opt.click().catch(() => {});
  for (const label of ["Start the vote now", "Next speaker", "Go to the final vote"]) {
    const b = pg.locator(`text=${label}`);
    if (await b.count()) await b.click().catch(() => {});
  }
  await pg.waitForTimeout(250);
}
if (!over) fail("the game did not finish");

// game-over screen: timeline (and awards when earned)
await pg.waitForSelector("details.timeline");
await pg.click("details.timeline summary");
const lines = await pg.locator("details.timeline li").count();
if (lines < 2) fail(`timeline has only ${lines} lines`);
else console.log(`game-over screen shows a ${lines}-line timeline, ${await pg.locator(".award").count()} awards`);
await pg.screenshot({ path: "/tmp/over-summary.png", fullPage: true });

// My games
await pg.click("text=Leave room");
await pg.waitForSelector("text=My games (1)");
await pg.click("text=My games (1)");
await pg.waitForSelector("text=Recent games");
const tiles = await pg.locator(".tiles").first().innerText();
if (!/GAMES\s*1/i.test(tiles)) fail("My games does not show 1 game: " + tiles);
else console.log("my games shows the finished game");
await pg.screenshot({ path: "/tmp/my-games.png" });
await pg.click("text=Clear my history");
await pg.waitForSelector("text=No games yet");
console.log("history can be cleared");
await pg.keyboard.press("Escape");

// Admin Games tab
await pg.goto(`${BASE}/#admin`);
await pg.reload();
await pg.fill("#adminkey", KEY);
await pg.click("button:has-text('Open feedback')");
await pg.click("button.chip:has-text('Games')");
await pg.waitForSelector("text=Games played");
const admin = await pg.locator(".tiles").first().innerText();
if (!/GAMES PLAYED\s*[1-9]/i.test(admin)) fail("admin games tab shows no games: " + admin);
else console.log("admin Games tab counts the game");
await pg.screenshot({ path: "/tmp/admin-games.png", fullPage: true });

await browser.close();
console.log(failed ? `${failed} FAILURES` : "history and stats checks passed");
process.exit(failed ? 1 : 0);
