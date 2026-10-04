// Local API server (in-memory rooms). Vite proxies /api to it.
import { createServer } from "node:http";
import { type FeedbackInput, isAdmin, listFeedback, submitFeedback, toCsv } from "./shared/feedback";
import { handle, handleRooms } from "./shared/handler";
import { DEFAULT_TIMING, type Timing } from "./shared/room";
import { defaultStore } from "./shared/store";

// MGM_FAST=1 shrinks every pause so a whole game runs in seconds (used by the browser test).
const timing: Timing = process.env.MGM_FAST
  ? (Object.fromEntries(Object.entries(DEFAULT_TIMING).map(([k, v]) => [k, Math.min(v, 400)])) as unknown as Timing)
  : DEFAULT_TIMING;

createServer(async (req, res) => {
  if (req.url?.startsWith("/api/feedback")) {
    const json = (code: number, o: unknown) => res.writeHead(code, { "Content-Type": "application/json" }).end(JSON.stringify(o));
    if (req.method === "GET") {
      if (!isAdmin(req.headers.authorization, process.env.FEEDBACK_ADMIN_KEY)) return json(403, { ok: false, error: "Not allowed." });
      const items = await listFeedback(defaultStore());
      if (new URL(req.url, "http://x").searchParams.get("format") === "csv") return void res.writeHead(200, { "Content-Type": "text/csv" }).end(toCsv(items));
      return json(200, { ok: true, items });
    }
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const out = await submitFeedback(defaultStore(), JSON.parse(raw) as FeedbackInput);
    return json(out.ok ? 200 : out.status, out);
  }
  if (req.method !== "POST" || !req.url?.startsWith("/api/room")) {
    res.writeHead(404).end();
    return;
  }
  let body = "";
  for await (const chunk of req) body += chunk;
  try {
    const parsed = JSON.parse(body);
    if (parsed.action === "rooms") {
      res.writeHead(200, { "Content-Type": "application/json", "Cache-Control": "no-store" }).end(JSON.stringify(await handleRooms(defaultStore())));
      return;
    }
    const out = await handle(parsed, defaultStore(), Date.now(), timing);
    if (process.env.MGM_LOG && parsed.action !== "poll" && parsed.action !== "watch") console.log(parsed.action, parsed.token?.slice(0, 4), parsed.target ?? "", out.ok ? "ok" : out.error);
    res.writeHead(out.ok ? 200 : (out.status ?? 400), { "Content-Type": "application/json", "Cache-Control": "no-store" });
    res.end(JSON.stringify(out));
  } catch (e) {
    res.writeHead(500).end(JSON.stringify({ ok: false, error: String(e) }));
  }
}).listen(3001, () => console.log("API on http://localhost:3001"));
