// Browser test: send feedback from the portal, then read it in the admin view.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:5173";
const KEY = process.env.FEEDBACK_ADMIN_KEY ?? "testkey-1234567";
const shots = process.env.SHOTS ?? "/tmp/mgm-fb";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => { console.error("PAGE ERROR", e.message); process.exitCode = 1; });

await pg.goto(BASE);
await pg.click("button:has-text('Feedback')");
await pg.waitForSelector("text=Tell us how it went");
await pg.fill("#fb-text", "The narrator was great, but I lost track of whose turn it was during the defense.");
await pg.click("button[role=radio]:has-text('Good')");
await pg.click("button:has-text('Narrator and music')");
await pg.click("button:has-text('Voting and rules')");
await pg.screenshot({ path: `${shots}/form.png` });
await pg.click("button:has-text('Send feedback')");
await pg.waitForSelector("text=Thank you");
await pg.screenshot({ path: `${shots}/thanks.png` });
console.log("feedback sent");

// Empty feedback is refused politely.
await pg.click("text=Back to the game");
await pg.click("button:has-text('Feedback')");
await pg.click("button:has-text('Send feedback')");
await pg.waitForSelector("text=Write a few words or pick a rating");

// Admin view needs the key.
await pg.goto(`${BASE}/#admin`);
await pg.reload();
await pg.fill("#adminkey", "wrong-key-000000");
await pg.click("button:has-text('Open feedback')");
await pg.waitForSelector("text=That key was not accepted");
await pg.fill("#adminkey", KEY);
await pg.click("button:has-text('Open feedback')");
await pg.waitForSelector("text=lost track of whose turn");
await pg.screenshot({ path: `${shots}/admin.png`, fullPage: true });
console.log("admin view shows the entry");
await browser.close();
process.exit(process.exitCode ?? 0);
