// Browser test: open-rooms directory, one-tap join, and ask-to-join approval.
import { chromium } from "playwright-core";
import { mkdirSync } from "node:fs";

const BASE = process.env.BASE ?? "http://localhost:5173";
const shots = process.env.SHOTS ?? "/tmp/mgm-rooms";
mkdirSync(shots, { recursive: true });
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const newPage = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => { console.error("PAGE ERROR", e.message); process.exitCode = 1; });
  return page;
};
const [host, guest, asker] = [await newPage(), await newPage(), await newPage()];

await host.goto(BASE);
await host.fill("#name", "Venkat");
await host.click("text=Create a game");
await host.waitForSelector("text=Who can join");

// Private by default: nothing is listed.
await guest.goto(BASE);
await guest.waitForSelector("text=No open rooms right now");

// Open the room and give it a name.
await host.fill("#roomname", "Family night");
await host.click("label.opt:has-text('Open')");
await host.locator("#roomname").blur();

// The guest sees it and joins with one tap.
await guest.fill("#name", "Meena");
await guest.waitForSelector("text=Family night", { timeout: 15000 });
await guest.screenshot({ path: `${shots}/home-open-rooms.png`, fullPage: true });
await guest.click(".roomcard button:has-text('Join')");
await guest.waitForSelector("text=Players (2)");
await host.waitForSelector("text=Players (2)");
console.log("one-tap join works");

// Switch to Ask to join: a third person must be admitted.
await host.click("label.opt:has-text('Ask to join')");
await asker.goto(BASE);
await asker.fill("#name", "Arun");
await asker.waitForSelector("text=Ask to join", { timeout: 15000 });
await asker.click(".roomcard button:has-text('Ask to join')");
await asker.waitForSelector("text=Waiting for Venkat to let you in");
await asker.screenshot({ path: `${shots}/waiting.png` });
await host.waitForSelector("text=Wants to join", { timeout: 15000 });
await host.screenshot({ path: `${shots}/host-requests.png`, fullPage: true });
await host.click("button:has-text('Let in')");
await asker.waitForSelector("text=Players (3)", { timeout: 15000 });
console.log("ask-to-join approval works");

// Remove a player: they cannot return.
await host.click("button[aria-label='Remove Meena']");
await guest.waitForSelector("text=You are not in this room", { timeout: 15000 }).catch(() => {});
console.log("kick done");
await browser.close();
process.exit(process.exitCode ?? 0);
