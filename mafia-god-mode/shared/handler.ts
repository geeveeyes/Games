import { type Action, type ApiResponse, DEFAULT_TIMING, HEARTBEAT_MS, type Timing, applyAction, buildView, heartbeat, newRoom, randomCode, tick } from "./room";
import type { Result } from "./game";
import type { Store } from "./store";

const err = (error: string, status = 400): ApiResponse => ({ ok: false, error, status });

/** Framework-agnostic request handler used by the Vercel function and the dev server. */
export async function handle(
  a: Action,
  store: Store,
  now = Date.now(),
  timing: Timing = DEFAULT_TIMING,
  rng: () => number = Math.random,
): Promise<ApiResponse> {
  if (!a || typeof a !== "object" || typeof a.action !== "string") return err("Bad request.");

  if (a.action === "create") {
    if (!a.token || !a.name) return err("Enter your name.");
    for (let i = 0; i < 20; i++) {
      const code = randomCode(rng);
      const release = await store.lock(code);
      try {
        if (await store.get(code)) continue;
        const room = newRoom(code, now);
        const r = applyAction(room, { action: "join", code, token: a.token, name: a.name }, now, timing, rng);
        if (!r.ok) return err(r.error);
        room.seen[a.token] = now;
        await store.set(code, room);
        return { ok: true, code, view: buildView(room, a.token, now) };
      } finally {
        await release();
      }
    }
    return err("Could not create a room. Try again.", 503);
  }

  const code = String((a as { code?: string }).code ?? "").toUpperCase().trim();
  if (!/^[A-Z]{4}$/.test(code)) return err("Enter the 4-letter room code.");
  const token = (a as { token?: string }).token;

  // Cheap read path: only take the lock when something has to be written.
  if (a.action === "poll" || a.action === "watch") {
    const peek = await store.get(code);
    if (!peek) return err("Room not found.", 404);
    const needsWrite = (peek.due !== null && now >= peek.due) || (token && now - (peek.seen[token] ?? 0) >= HEARTBEAT_MS);
    if (!needsWrite) return { ok: true, code, view: buildView(peek, token, now) };
  }

  const release = await store.lock(code);
  try {
    const room = await store.get(code);
    if (!room) return err("Room not found.", 404);
    tick(room, now, timing, rng);
    let result: Result = { ok: true };
    if (a.action !== "poll" && a.action !== "watch") {
      result = applyAction(room, a, now, timing, rng);
      if (result.ok && a.action === "skip") tick(room, now, timing, rng);
    }
    if (result.ok) {
      heartbeat(room, token, now);
      if (a.action === "join" && token) room.seen[token] = now;
      await store.set(code, room);
      return { ok: true, code, view: buildView(room, token, now) };
    }
    await store.set(code, room); // persist any ticks even if the action was rejected
    return err(result.error);
  } finally {
    await release();
  }
}
