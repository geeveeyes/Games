import { load, type RoomData, type Action, type ApiResponse, type RoomSummary, isListed, summarize, DEFAULT_TIMING, HEARTBEAT_MS, type Timing, applyAction, buildView, heartbeat, newRoom, randomCode, tick } from "./room";
import type { Result } from "./game";
import { recordOf } from "./stats";
import type { Store } from "./store";

const err = (error: string, status = 400): ApiResponse => ({ ok: false, error, status });

/** Keep the directory in step with a room: add it when it becomes listed, drop it when it stops. */
async function syncIndex(store: Store, room: RoomData) {
  const listed = isListed(load(room));
  if ((room.listed ?? false) !== listed) {
    room.listed = listed;
    await store.index(room.code, listed);
  }
}

/** When a game ends, save one anonymous record of it (once per game). */
async function syncRecord(store: Store, room: RoomData, now: number) {
  const g = load(room);
  if (g.phase !== "over" || !g.summary || room.recordedGame === g.gameNo) return;
  room.recordedGame = g.gameNo;
  const rec = recordOf(g, now);
  if (rec) await store.pushGame(rec).catch(() => {}); // stats must never break a game
}

/** The open-rooms directory. Stale entries (expired, started, or made private) are cleaned up as they are found. */
export async function handleRooms(store: Store): Promise<{ ok: true; rooms: RoomSummary[] }> {
  const codes = (await store.openCodes()).slice(0, 60);
  const docs = await store.getMany(codes);
  const rooms: RoomSummary[] = [];
  await Promise.all(
    docs.map(async (doc, i) => {
      const s = doc ? summarize(doc) : null;
      if (s) rooms.push(s);
      else await store.index(codes[i], false);
    }),
  );
  rooms.sort((a, b) => b.players - a.players || a.name.localeCompare(b.name));
  return { ok: true, rooms: rooms.slice(0, 25) };
}

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
        const g0 = load(room);
        g0.updateSettings({ roomName: `${g0.players[0].name}'s game` });
        room.game = g0.toJSON();
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
    const needsWrite = (peek.due !== null && now >= peek.due) || (peek.botNext != null && now >= peek.botNext) || (token && now - (peek.seen[token] ?? 0) >= HEARTBEAT_MS);
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
      if (result.ok) tick(room, now, timing, rng); // apply skips and let bots react to what just happened
    }
    if (result.ok) {
      heartbeat(room, token, now);
      if (a.action === "join" && token) room.seen[token] = now;
      await syncIndex(store, room);
      await syncRecord(store, room, now);
      await store.set(code, room);
      return { ok: true, code, view: buildView(room, token, now) };
    }
    await store.set(code, room); // persist any ticks even if the action was rejected
    return err(result.error);
  } finally {
    await release();
  }
}
