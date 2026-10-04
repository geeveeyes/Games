// Player feedback: free-text plus an optional rating and themes, with a little game context.
// Stored as JSON items in Redis for now. The shape maps 1:1 to docs/feedback.sql for a later move to SQL.
import { createHash, timingSafeEqual } from "node:crypto";
import type { Store } from "./store";

export const FEEDBACK_TAGS = ["narrator", "voting", "bots", "rooms", "looks", "bugs", "ideas"] as const;
export type FeedbackTag = (typeof FEEDBACK_TAGS)[number];

export interface FeedbackInput {
  text?: unknown;
  rating?: unknown;
  tags?: unknown;
  token?: unknown;
  context?: unknown;
  website?: unknown; // honeypot: real people leave it empty
}

export interface FeedbackItem {
  id: string;
  at: number; // ms since epoch
  text: string;
  rating: number | null; // 1 to 5
  tags: FeedbackTag[];
  who: string; // short hash of the browser token, so repeat feedback can be grouped without storing the token
  context: Record<string, string | number | boolean>;
}

export type FeedbackResult = { ok: true; id: string } | { ok: false; error: string; status: number };

const CONTEXT_KEYS = ["room", "phase", "round", "mode", "voteStyle", "visibility", "players", "bots", "isHost", "narrator", "screen", "viewport", "touch", "version"];
const MAX_TEXT = 2000;
const PER_PERSON_PER_HOUR = 6;
const ALL_PER_HOUR = 800;

const hash = (s: string) => createHash("sha256").update(s).digest("hex").slice(0, 10);

function cleanContext(raw: unknown): FeedbackItem["context"] {
  const out: FeedbackItem["context"] = {};
  if (!raw || typeof raw !== "object") return out;
  for (const k of CONTEXT_KEYS) {
    const v = (raw as Record<string, unknown>)[k];
    if (typeof v === "string") out[k] = v.slice(0, 40);
    else if (typeof v === "number" && Number.isFinite(v)) out[k] = v;
    else if (typeof v === "boolean") out[k] = v;
  }
  return out;
}

export async function submitFeedback(store: Store, input: FeedbackInput, now = Date.now()): Promise<FeedbackResult> {
  if (!input || typeof input !== "object") return { ok: false, error: "Bad request.", status: 400 };
  if (input.website) return { ok: true, id: "ignored" }; // bots fill hidden fields; pretend it worked
  const text = typeof input.text === "string" ? input.text.replace(/\r\n/g, "\n").trim().slice(0, MAX_TEXT) : "";
  const ratingRaw = Number(input.rating);
  const rating = Number.isInteger(ratingRaw) && ratingRaw >= 1 && ratingRaw <= 5 ? ratingRaw : null;
  if (!text && rating === null) return { ok: false, error: "Write a few words or pick a rating.", status: 400 };
  const tags = Array.isArray(input.tags) ? [...new Set(input.tags)].filter((t): t is FeedbackTag => (FEEDBACK_TAGS as readonly string[]).includes(t as string)) : [];
  const who = hash(typeof input.token === "string" && input.token ? input.token : "anonymous");

  if ((await store.hit(`fb:who:${who}`, 3600)) > PER_PERSON_PER_HOUR) {
    return { ok: false, error: "Thanks, you have sent a lot already. Please try again in a while.", status: 429 };
  }
  if ((await store.hit("fb:all", 3600)) > ALL_PER_HOUR) return { ok: false, error: "Feedback is busy right now. Please try again later.", status: 429 };

  const item: FeedbackItem = {
    id: `${now.toString(36)}-${hash(`${who}${now}${Math.random()}`).slice(0, 6)}`,
    at: now,
    text,
    rating,
    tags,
    who,
    context: cleanContext(input.context),
  };
  await store.pushFeedback(item);
  return { ok: true, id: item.id };
}

/** Constant-time check of the admin key from the Authorization header. Disabled when no key is configured. */
export function isAdmin(authHeader: string | undefined, adminKey: string | undefined): boolean {
  if (!adminKey || adminKey.length < 12) return false;
  const given = (authHeader ?? "").replace(/^Bearer\s+/i, "");
  const a = Buffer.from(hash(given));
  const b = Buffer.from(hash(adminKey));
  return a.length === b.length && timingSafeEqual(a, b);
}

export async function listFeedback(store: Store, limit = 500): Promise<FeedbackItem[]> {
  return (await store.listFeedback(Math.min(Math.max(limit, 1), 2000))).sort((a, b) => b.at - a.at);
}

const csvCell = (v: unknown) => `"${String(v ?? "").replace(/"/g, '""')}"`;
export function toCsv(items: FeedbackItem[]): string {
  const head = ["id", "at_iso", "rating", "tags", "text", "who", "context_json"];
  const rows = items.map((i) => [i.id, new Date(i.at).toISOString(), i.rating ?? "", i.tags.join("|"), i.text, i.who, JSON.stringify(i.context)].map(csvCell).join(","));
  return [head.join(","), ...rows].join("\n");
}
