// Regression test: typing in the feedback form while in a room (where the app refreshes every second or two)
// must keep focus in the text box, or a phone's keyboard closes.
import { chromium } from "playwright-core";

const BASE = process.env.BASE ?? "http://localhost:5173";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 390, height: 780 } });
const pg = await ctx.newPage();
pg.on("pageerror", (e) => { console.error("PAGE ERROR", e.message); process.exitCode = 1; });

await pg.goto(BASE);
await pg.fill("#name", "Venkat");
await pg.click("text=Create a game");
await pg.waitForSelector("text=Players (1)");

for (const [label, open, field] of [
  ["Feedback", "button:has-text('Feedback')", "#fb-text"],
  ["Room name", null, "#roomname"],
]) {
  if (open) await pg.click(open);
  await pg.waitForSelector(field);
  if (field === "#roomname") await pg.fill(field, "");
  await pg.click(field);
  let lost = 0;
  const phrase = field === "#roomname" ? "Family night" : "The narrator was great at night";
  for (const ch of phrase) {
    await pg.keyboard.type(ch);
    await pg.waitForTimeout(250); // ~8 seconds in total, spanning several room refreshes
    const focused = await pg.evaluate(() => document.activeElement?.id);
    if (focused !== field.slice(1)) lost++;
  }
  const value = await pg.inputValue(field);
  console.log(`${label}: typed ${value.length}/${phrase.length} characters, focus lost on ${lost} keystrokes`);
  if (value !== phrase || lost) process.exitCode = 1;
  if (open) await pg.keyboard.press("Escape");
}
await browser.close();
process.exit(process.exitCode ?? 0);
