import type { VercelRequest, VercelResponse } from "@vercel/node";
import { isAdmin } from "../shared/feedback";
import { aggregate } from "../shared/stats";
import { defaultStore } from "../shared/store";

// GET (admin key in the Authorization header): usage numbers from finished games.
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  if (req.method !== "GET") return res.status(405).json({ ok: false, error: "Use GET." });
  if (!isAdmin(req.headers.authorization, process.env.FEEDBACK_ADMIN_KEY)) return res.status(403).json({ ok: false, error: "Not allowed." });
  try {
    const records = await defaultStore().listGames(5000);
    return res.status(200).json({ ok: true, stats: aggregate(records), recent: records.slice(-20).reverse() });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Server error." });
  }
}
