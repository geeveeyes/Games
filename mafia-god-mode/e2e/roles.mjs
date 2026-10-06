// Browser test: switch on every optional role, play whole games as one person among bots, and when the person is
// eliminated use the ghost chat. Repeats until the ghost chat has been exercised.
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:5173";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let failed = 0;
const fail = (m) => { console.error("FAIL:", m); failed++; };
let ghostTested = false, finished = 0, optionalSeen = new Set();

for (let attempt = 1; attempt <= 6 && !(ghostTested && finished >= 2); attempt++) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => fail("page error " + e.message));
  await pg.goto(BASE);
  await pg.fill("#name", "Venkat");
  await pg.click("text=Create a game");
  await pg.waitForSelector("text=Roles in this game");
  await pg.click("text=Fill to 6 players");
  await pg.click("text=Add a bot");
  await pg.click("text=Add a bot");
  await pg.waitForSelector("text=Players (8)");
  for (const label of ["Godfather", "Vigilante", "Jester"]) {
    const box = pg.locator(".check", { hasText: label }).locator("input");
    await box.click(); // the box only changes once the server has answered
    for (let i = 0; i < 20 && !(await box.isChecked()); i++) await pg.waitForTimeout(150);
    if (!(await box.isChecked())) fail(`${label} did not switch on`);
  }
  const mix = await pg.locator(".mix").innerText();
  for (const r of ["Godfather", "Vigilante", "Jester"]) if (!mix.includes(r)) fail(`role mix does not list ${r}: ${mix}`);
  await pg.click("button:has-text('Start game')");

  const deadline = Date.now() + 150_000;
  let over = false;
  while (!over && Date.now() < deadline) {
    if (await pg.locator("text=Winners").count()) { over = true; break; }
    if (await pg.locator("text=I have seen my role").count()) {
      const role = (await pg.locator("button.card").evaluate(async (el) => { el.dispatchEvent(new PointerEvent("pointerdown")); await new Promise((r) => setTimeout(r, 50)); return el.querySelector(".big")?.textContent ?? ""; })).trim();
      if (role) optionalSeen.add(role);
      await pg.click("text=I have seen my role", { timeout: 1500 }).catch(() => {});
    }
    // vigilante: hold fire most nights
    const hold = pg.locator("button:has-text('Hold fire')");
    if (await hold.count()) { await hold.click().catch(() => {}); }
    const opt = pg.locator('button[role="option"]:not([disabled])').first();
    if (await opt.count() && !(await hold.count())) await opt.click().catch(() => {});
    // ghost chat once eliminated
    if (!ghostTested && (await pg.locator("section[aria-label='Ghost chat']").count())) {
      await pg.fill("#say", "I was robbed!");
      await pg.click("button:has-text('Say')");
      try {
        await pg.waitForSelector(".talklist li:has-text('I was robbed')", { timeout: 6000 });
        ghostTested = true;
        console.log("ghost chat works for an eliminated player");
      } catch { fail("ghost message did not appear"); }
    }
    for (const label of ["Start the vote now", "Next speaker", "Go to the final vote"]) {
      const b = pg.locator(`text=${label}`);
      if (await b.count()) await b.click().catch(() => {});
    }
    await pg.waitForTimeout(250);
  }
  if (over) {
    finished++;
    const winner = (await pg.locator(".card.revealed .big").first().innerText()).trim();
    console.log(`game ${attempt}: finished, winner ${winner}`);
  } else fail(`game ${attempt} did not finish`);
  await ctx.close();
}
console.log("roles seen by the player:", [...optionalSeen].join(", "));
if (!ghostTested) fail("the player was never eliminated, so ghost chat was not exercised");
await browser.close();
console.log(failed ? `${failed} FAILURES` : "roles and ghost chat checks passed");
process.exit(failed ? 1 : 0);
