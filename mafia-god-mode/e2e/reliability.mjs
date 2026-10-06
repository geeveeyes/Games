// Browser test: offline banner and recovery, host handover, and taking a seat back on a new device.
// Needs the dev API started with MGM_HEARTBEAT_MS=1000 MGM_AWAY_MS=4000.
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:5173";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let failed = 0;
const fail = (m) => { console.error("FAIL:", m); failed++; };
const phone = async () => {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => fail("page error " + e.message));
  return { ctx, page };
};

// --- a lobby with a host and a guest
const host = await phone();
await host.page.goto(BASE);
await host.page.fill("#name", "Venkat");
await host.page.click("text=Create a game");
const code = (await host.page.locator(".bigcode").innerText()).trim();
const guest = await phone();
await guest.page.goto(BASE);
await guest.page.fill("#name", "Meena");
await guest.page.fill("#code", code);
await guest.page.click("text=Join game");
await host.page.waitForSelector("text=Players (2)");
// connection dots show both people as connected
await host.page.waitForSelector(".dot.on");

// --- 1. offline banner appears, then clears when the connection returns
await guest.ctx.setOffline(true);
await guest.page.waitForSelector("text=Reconnecting", { timeout: 15000 });
console.log("offline banner shown");
await guest.ctx.setOffline(false);
await guest.page.waitForSelector("text=Reconnecting", { state: "detached", timeout: 20000 });
await guest.page.waitForSelector("text=Players (2)");
console.log("reconnected without losing the room");

// --- 2. the host's phone dies; the guest becomes host so the game can continue
await host.ctx.close();
try {
  await guest.page.waitForSelector("button:has-text('Start game')", { timeout: 30000 });
  console.log("host role moved to the remaining player");
} catch { fail("host role did not move"); }

// --- 3. a returning person takes their seat back on a new device
const bots = guest.page.locator("text=Fill to 6 players");
await bots.click();
await guest.page.waitForSelector("text=Players (6)");
await guest.page.click("text=Start game");
await guest.page.waitForSelector("text=I have seen my role");
// Ask the server who Meena is (the role card disappears quickly in fast test mode).
const whoAmI = (page) => page.evaluate(async (code) => {
  const token = localStorage.getItem("mgm.token");
  const r = await (await fetch("/api/room", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "poll", code, token }) })).json();
  return r.ok ? { role: r.view.you?.role ?? null, id: r.view.you?.id ?? null } : { error: r.error };
}, code);
const before = await whoAmI(guest.page);
await guest.ctx.close(); // Meena's phone is gone
const fresh = await phone(); // new browser, new token
await fresh.page.goto(BASE);
await fresh.page.fill("#name", "Meena");
await fresh.page.fill("#code", code);
await fresh.page.waitForTimeout(5500); // longer than the shortened away time
await fresh.page.click("text=Join game");
try {
  await fresh.page.waitForSelector("text=Create a game", { state: "detached", timeout: 15000 });
  const after = await whoAmI(fresh.page);
  if (!after.role || after.role !== before.role) fail(`role changed: ${JSON.stringify(before)} -> ${JSON.stringify(after)}`);
  else console.log(`seat taken back with the same role (${after.role})`);
} catch { fail("could not take the seat back"); }

// a stranger cannot join a started game
const stranger = await phone();
await stranger.page.goto(BASE);
await stranger.page.fill("#name", "Stranger");
await stranger.page.fill("#code", code);
await stranger.page.click("text=Join game");
try { await stranger.page.waitForSelector("text=Were you playing", { timeout: 8000 }); console.log("stranger turned away with a helpful hint"); }
catch { fail("stranger was not turned away"); }

await browser.close();
console.log(failed ? `${failed} FAILURES` : "reliability checks passed");
process.exit(failed ? 1 : 0);
