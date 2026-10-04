import type { VercelRequest, VercelResponse } from "@vercel/node";
import { type FeedbackInput, isAdmin, listFeedback, submitFeedback, toCsv } from "../shared/feedback";
import { defaultStore } from "../shared/store";

// POST: send feedback (anyone). GET: read it back (admin key in the Authorization header).
export default async function handler(req: VercelRequest, res: VercelResponse) {
  res.setHeader("Cache-Control", "no-store");
  try {
    const store = defaultStore();
    if (req.method === "POST") {
      const out = await submitFeedback(store, req.body as FeedbackInput);
      return res.status(out.ok ? 200 : out.status).json(out);
    }
    if (req.method === "GET") {
      if (!isAdmin(req.headers.authorization, process.env.FEEDBACK_ADMIN_KEY)) return res.status(403).json({ ok: false, error: "Not allowed." });
      const items = await listFeedback(store, Number(req.query.limit) || 500);
      if (req.query.format === "csv") {
        res.setHeader("Content-Type", "text/csv; charset=utf-8");
        return res.status(200).send(toCsv(items));
      }
      return res.status(200).json({ ok: true, items });
    }
    return res.status(405).json({ ok: false, error: "Use POST or GET." });
  } catch (e) {
    return res.status(500).json({ ok: false, error: e instanceof Error ? e.message : "Server error." });
  }
}
