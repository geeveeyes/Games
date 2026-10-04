import type { VercelRequest, VercelResponse } from "@vercel/node";
import { handle } from "../shared/handler";
import { defaultStore } from "../shared/store";

export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "POST") return res.status(405).json({ ok: false, error: "Use POST." });
  try {
    const out = await handle(req.body, defaultStore());
    return res.status(out.ok ? 200 : (out.status ?? 400)).json(out);
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Server error." });
  }
}
