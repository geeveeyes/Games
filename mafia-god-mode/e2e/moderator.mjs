// Browser test: a TV/laptop hosts a room without being a player. A phone joins, the screen adds bots and starts,
// then keeps skipping ahead until the game ends; the vote log appears on the screen along the way.
import { chromium } from "playwright-core";
const BASE = process.env.BASE ?? "http://localhost:5173";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let failed = 0;
const fail = (m) => { console.error("FAIL:", m); failed++; };

const tv = await (await browser.newContext({ viewport: { width: 1280, height: 720 } })).newPage();
await tv.goto(BASE);
await tv.click("text=Host on this TV or laptop");
await tv.waitForSelector(".bigcode");
const code = (await tv.innerText(".bigcode")).trim();
console.log("room", code);
if (!/Players \(0\)/i.test(await tv.innerText("body"))) fail("a moderated room should start with no players");

const phone = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage();
await phone.goto(BASE);
await phone.fill("#name", "Meena");
await phone.fill("#code", code);
await phone.click("text=Join game");
await phone.waitForSelector("text=Waiting for the host to start");
if (await phone.locator("text=Start game").count()) fail("a player must not get the Start button in a moderated room");

await tv.waitForSelector("text=Meena"); // the screen has seen the player before filling seats
await tv.click("text=Fill to 6 players");
await tv.getByText(/players \(6\)/i).waitFor({ timeout: 5000 }).catch(async () => { console.log((await tv.innerText("body")).slice(0, 700)); throw new Error("no 6 players"); });
await tv.click("text=Start game");
await tv.waitForSelector(".tv-screen");

let sawLog = false, over = false;
for (let i = 0; i < 400 && !over; i++) {
  // the phone player confirms their role and plays along by skipping nothing: the screen drives timing
  if (await phone.locator("text=I have seen my role").count()) await phone.click("text=I have seen my role").catch(() => {});
  if (await tv.locator(".tv-votelog").count()) sawLog = true;
  if (await tv.locator("text=Play again").count()) { over = true; break; }
  // the phone player acts when it is their turn (a night pick or a vote); the screen only skips when things sit still
  const pick = phone.locator("[role=option]:not(.dead)").first();
  if (await pick.count()) await pick.click({ timeout: 500 }).catch(() => {});
  const skip = tv.locator("button:has-text('Skip ahead')");
  if (i % 25 === 24 && (await skip.count())) await skip.first().click().catch(() => {});
  await tv.waitForTimeout(150);
}
if (!over) { console.log("TV:", (await tv.innerText(".tv-screen")).replace(/\n+/g, " | ").slice(0, 500)); console.log("PHONE:", (await phone.innerText("body")).replace(/\n+/g, " | ").slice(0, 300)); fail("the game never finished from the moderator screen"); }
if (!sawLog) fail("the vote log never appeared on the screen");
if (await tv.locator("text=I have seen my role").count()) fail("the moderator screen should not show a player's role card");
await browser.close();
if (failed) process.exit(1);
console.log("moderator screen checks passed");
