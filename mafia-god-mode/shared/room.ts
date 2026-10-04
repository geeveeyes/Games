// Room = Game + lazy timers. Vercel functions cannot keep timers alive, so every
// poll or action calls `tick`, which applies whatever transition is due.
import { type BotMem, noteMentions, runBots } from "./bots";
import { Game, type GameView, type Result } from "./game";

export interface Timing {
  revealMs: number;
  revealMaxMs: number;
  nightPaceMs: number; // pause after a step finishes so the narrator can speak
  nightSilentMinMs: number; // fake delay when a role is dead, so death is not leaked
  nightSilentMaxMs: number;
  nightStepMaxMs: number;
  dawnMs: number;
  resultMs: number;
  voteAllInMs: number;
  defenseLeadMs: number; // narration time before a defender's clock really starts
  botRevealMinMs: number; botRevealMaxMs: number;
  botNightMinMs: number; botNightMaxMs: number;
  botVoteMinMs: number; botVoteMaxMs: number;
  botTalkMinMs: number; botTalkMaxMs: number;
  botDefendMinMs: number; botDefendMaxMs: number;
  botReplyMinMs: number; botReplyMaxMs: number;
}

export const DEFAULT_TIMING: Timing = {
  revealMs: 2500,
  revealMaxMs: 90_000,
  nightPaceMs: 5000,
  nightSilentMinMs: 5000,
  nightSilentMaxMs: 9000,
  nightStepMaxMs: 45_000,
  dawnMs: 15_000,
  resultMs: 12_000,
  voteAllInMs: 2500,
  defenseLeadMs: 6000,
  botRevealMinMs: 800, botRevealMaxMs: 4000,
  botNightMinMs: 1500, botNightMaxMs: 6000,
  botVoteMinMs: 4000, botVoteMaxMs: 40_000,
  botTalkMinMs: 5000, botTalkMaxMs: 110_000,
  botDefendMinMs: 4000, botDefendMaxMs: 9000,
  botReplyMinMs: 2500, botReplyMaxMs: 7000,
};

export const INSTANT_TIMING: Timing = Object.fromEntries(
  Object.keys(DEFAULT_TIMING).map((k) => [k, 0]),
) as unknown as Timing;

export interface RoomData {
  code: string;
  game: unknown; // Game JSON
  key: string;
  due: number | null;
  seen: Record<string, number>; // playerId -> last heartbeat (ms)
  bots?: BotMem;
  botNext?: number | null; // earliest time a bot wants to act
  updatedAt: number;
}

export const HEARTBEAT_MS = 20_000; // write-throttle: keeps Redis traffic low
export const CONNECTED_WINDOW_MS = 50_000;

export function newRoom(code: string, now: number): RoomData {
  return { code, game: new Game().toJSON(), key: "lobby", due: null, seen: {}, updatedAt: now };
}

export function load(room: RoomData): Game {
  return Game.fromJSON(room.game);
}

export function save(room: RoomData, game: Game, now: number) {
  room.game = game.toJSON();
  room.updatedAt = now;
}

function keyOf(g: Game): string {
  switch (g.phase) {
    case "reveal":
      return `reveal:${g.revealComplete() ? 1 : 0}`;
    case "night":
      return `night:${g.round}:${g.stepIdx}:${g.stepComplete() ? 1 : 0}`;
    default:
      return `${g.skipToken()}:${g.phase === "vote" && g.voteComplete() ? 1 : 0}`;
  }
}

function delayFor(g: Game, t: Timing, rng: () => number): number | null {
  switch (g.phase) {
    case "reveal":
      return g.revealComplete() ? t.revealMs : t.revealMaxMs;
    case "night":
      if (g.stepComplete()) {
        return g.stepIsEmpty() ? t.nightSilentMinMs + rng() * (t.nightSilentMaxMs - t.nightSilentMinMs) : t.nightPaceMs;
      }
      return t.nightStepMaxMs;
    case "dawn":
      return t.dawnMs;
    case "day":
      return g.settings.dayTimerSec * 1000;
    case "vote":
      return g.voteComplete() ? t.voteAllInMs : g.settings.voteTimerSec * 1000;
    case "defense":
      return g.settings.defenseSec * 1000 + t.defenseLeadMs;
    case "result":
      return t.resultMs;
    default:
      return null;
  }
}

/** Recompute the deadline whenever the game moved to a new waiting state. */
export function schedule(room: RoomData, g: Game, now: number, t: Timing, rng: () => number = Math.random) {
  const key = keyOf(g);
  if (key === room.key) return;
  room.key = key;
  const d = delayFor(g, t, rng);
  room.due = d === null ? null : now + d;
}

function fire(g: Game) {
  switch (g.phase) {
    case "reveal":
      g.players.forEach((p) => (p.seenRole = true));
      g.beginNight();
      break;
    case "night":
      g.advanceNight(true);
      break;
    case "dawn":
      g.startDay();
      break;
    case "day":
      g.startVote();
      break;
    case "vote":
      g.resolveVote();
      break;
    case "defense":
      g.advanceDefense();
      break;
    case "result":
      g.beginNight();
      break;
  }
}

/** Apply every due transition. Returns true when the room changed. */
export function tick(room: RoomData, now: number, t: Timing = DEFAULT_TIMING, rng: () => number = Math.random): boolean {
  const g = load(room);
  let changed = false;
  if (runBots(room, g, now, t, rng)) {
    changed = true;
    schedule(room, g, now, t, rng);
  }
  for (let i = 0; i < 12 && room.due !== null && now >= room.due; i++) {
    const before = g.phase;
    fire(g);
    changed = true;
    room.key = "";
    schedule(room, g, Math.max(now, room.due ?? now), t, rng);
    if (g.phase === before && room.due !== null && room.due <= now) room.due = now + 1; // safety
    if (runBots(room, g, now, t, rng)) schedule(room, g, now, t, rng);
  }
  if (changed) save(room, g, now);
  return changed;
}

// ---------- API ----------
export type Action =
  | { action: "create"; token: string; name: string }
  | { action: "join"; code: string; token: string; name: string }
  | { action: "watch"; code: string }
  | { action: "poll"; code: string; token?: string }
  | { action: "settings"; code: string; token: string; patch: Record<string, unknown> }
  | { action: "start"; code: string; token: string }
  | { action: "ack"; code: string; token: string }
  | { action: "night"; code: string; token: string; target: string }
  | { action: "vote"; code: string; token: string; target: string }
  | { action: "skip"; code: string; token: string; at: string }
  | { action: "rematch"; code: string; token: string }
  | { action: "leave"; code: string; token: string }
  | { action: "addBot"; code: string; token: string; count?: number }
  | { action: "removeBot"; code: string; token: string; target: string }
  | { action: "say"; code: string; token: string; text: string };

export type ApiResponse =
  | { ok: true; code: string; view: ClientView }
  | { ok: false; error: string; status?: number };

export interface ClientView extends GameView {
  code: string;
  now: number;
  due: number | null;
}

const ALPHABET = "ABCDEFGHJKLMNPQRSTUVWXYZ";
export function randomCode(rng: () => number = Math.random) {
  return Array.from({ length: 4 }, () => ALPHABET[Math.floor(rng() * ALPHABET.length)]).join("");
}

export function buildView(room: RoomData, token: string | undefined, now: number): ClientView {
  const g = load(room);
  for (const p of g.players) p.connected = !!p.bot || now - (room.seen[p.id] ?? 0) < CONNECTED_WINDOW_MS;
  const view = g.viewFor(token ?? null);
  return { ...view, code: room.code, now, due: room.due };
}

/** Apply a mutating action to a room. Returns an error string on rejection. */
export function applyAction(room: RoomData, a: Action, now: number, t: Timing, rng: () => number = Math.random): Result {
  const g = load(room);
  let r: Result = { ok: true };
  const token: string = ("token" in a && a.token) || "";
  switch (a.action) {
    case "join":
      r = g.addPlayer(a.token, a.name);
      break;
    case "settings":
      r = hostOnly(g, token) ?? g.updateSettings(a.patch as never);
      break;
    case "start":
      r = hostOnly(g, token) ?? g.start();
      break;
    case "ack":
      r = g.ackRole(token);
      break;
    case "night":
      r = g.nightAction(token, a.target);
      break;
    case "vote":
      r = g.castVote(token, a.target);
      break;
    case "skip":
      r = hostOnly(g, token) ?? skipPhase(room, g, a.at);
      break;
    case "rematch":
      r = hostOnly(g, token) ?? g.rematch();
      break;
    case "leave":
      r = g.removePlayer(token);
      break;
    case "addBot": {
      r = hostOnly(g, token) ?? { ok: true };
      for (let i = 0; r.ok && i < Math.min(Math.max(a.count ?? 1, 1), 10); i++) r = g.addBot();
      break;
    }
    case "removeBot":
      r = hostOnly(g, token) ?? (g.player(a.target)?.bot ? g.removePlayer(a.target) : { ok: false, error: "That is not a bot." });
      break;
    case "say":
      r = g.say(token, a.text);
      if (r.ok) {
        save(room, g, now);
        noteMentions(room, g, token, a.text);
      }
      break;
    default:
      return { ok: false, error: "Unknown action." };
  }
  if (!r.ok) return r;
  if (a.action === "rematch" || a.action === "start") room.key = "";
  save(room, g, now);
  schedule(room, g, now, t, rng);
  return r;
}

function hostOnly(g: Game, id: string): Result | null {
  return g.hostId === id ? null : { ok: false, error: "Only the host can do that." };
}
/** Fast-forward the current wait. A stale or double tap names an old phase and does nothing. */
function skipPhase(room: RoomData, g: Game, at: string): Result {
  if (g.skipToken() === at && room.due !== null) room.due = 0;
  return { ok: true };
}

export function heartbeat(room: RoomData, id: string | undefined, now: number): boolean {
  if (!id || !room.seen || now - (room.seen[id] ?? 0) < HEARTBEAT_MS) return false;
  room.seen[id] = now;
  return true;
}
