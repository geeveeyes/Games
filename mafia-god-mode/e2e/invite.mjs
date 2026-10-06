// Browser test: QR code decodes to the invite link, the link joins the room, TV link opens the shared screen,
// and the installable-app files are served. Needs the dev API on :3001, vite on :5173 and (for PWA checks) `vite preview` on :4173.
import { chromium } from "playwright-core";
import jsQR from "jsqr";

const BASE = process.env.BASE ?? "http://localhost:5173";
const PREVIEW = process.env.PREVIEW ?? "http://localhost:4173";
const browser = await chromium.launch({ executablePath: process.env.CHROMIUM ?? "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
let failed = 0;
const fail = (m) => { console.error("FAIL:", m); failed++; };
const phone = async () => { const p = await (await browser.newContext({ viewport: { width: 390, height: 780 } })).newPage(); p.on("pageerror", (e) => fail("page error " + e.message)); return p; };

const host = await phone();
await host.goto(BASE);
await host.fill("#name", "Venkat");
await host.click("text=Create a game");
const code = (await host.locator(".bigcode").innerText()).trim();
await host.fill("#roomname", `Quiz night ${code}`);
await host.locator("#roomname").blur();

// 1. The QR code decodes to the invite link shown next to it.
await host.waitForSelector("img.qr");
const link = await host.inputValue("#invite-link");
if (!link.endsWith(`/?room=${code}`)) fail(`link looks wrong: ${link}`);
const pixels = await host.evaluate(async () => {
  const img = document.querySelector("img.qr");
  await img.decode();
  const c = document.createElement("canvas");
  c.width = img.naturalWidth; c.height = img.naturalHeight;
  const ctx = c.getContext("2d");
  ctx.drawImage(img, 0, 0);
  const d = ctx.getImageData(0, 0, c.width, c.height);
  return { w: d.width, h: d.height, data: Array.from(d.data) };
});
const decoded = jsQR(new Uint8ClampedArray(pixels.data), pixels.w, pixels.h);
if (decoded?.data !== link) fail(`QR decodes to ${decoded?.data} instead of ${link}`);
else console.log("QR code decodes to the invite link");

// 2. Opening the link shows the invite and joins in one step.
const guest = await phone();
await guest.goto(link);
await guest.waitForSelector(".invitecard");
const card = await guest.locator(".invitecard").textContent();
if (!card.includes("Quiz night")) fail("invite card does not show the room name: " + card);
await guest.fill("#name", "Meena");
if ((await guest.inputValue("#code")) !== code) fail("room code was not prefilled");
await guest.click("button:has-text('Join game')");
await host.waitForSelector("text=Players (2)");
if ((await guest.evaluate(() => location.search)) !== "") fail("invite query was left in the address bar");
else console.log("invite link joined the room and cleaned the address bar");

// 3. A dead link says so.
const lost = await phone();
await lost.goto(`${BASE}/?room=ZZZZ`);
try { await lost.waitForSelector("text=not open any more", { timeout: 8000 }); console.log("unknown room handled"); } catch { fail("dead invite gave no message"); }

// 4. The TV link opens the shared screen with a QR code.
const tv = await phone();
await tv.setViewportSize({ width: 1280, height: 720 });
await tv.goto(`${BASE}/?tv=${code}`);
try { await tv.waitForSelector(".tvjoin img.qr", { timeout: 10000 }); console.log("TV link shows the shared screen with a QR code"); } catch { fail("TV link did not open the shared screen"); }

// 5. Installable app files (production build).
try {
  const api = await browser.newContext();
  const res = await api.request.get(`${PREVIEW}/manifest.webmanifest`);
  const m = await res.json();
  if (!(m.name && m.icons?.length >= 3 && m.display === "standalone")) fail("manifest incomplete");
  for (const icon of m.icons) {
    const r = await api.request.get(`${PREVIEW}${icon.src}`);
    if (r.status() !== 200) fail(`icon missing: ${icon.src}`);
  }
  const page = await api.newPage();
  await page.goto(PREVIEW);
  await page.waitForSelector("text=Create a game");
  const registered = await page.evaluate(async () => { const r = await navigator.serviceWorker.ready; return !!r.active; });
  if (!registered) fail("service worker not active"); else console.log("manifest, icons and service worker are in place");
} catch (e) { fail("could not check the installable app files (is `vite preview` running on :4173?) " + e.message); }

await browser.close();
console.log(failed ? `${failed} FAILURES` : "invite and install checks passed");
process.exit(failed ? 1 : 0);
