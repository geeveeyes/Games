import { type Lang, LANG_IDS, roleWord, say, spokenTime, wereWord } from "./script";

// Pure game engine for Mafia God Mode. No timers, no I/O: the server owns time.
// Every secret (roles, night picks, detective results) stays in this object;
// `viewFor` is the only way state leaves it.

export type Role = "mafia" | "godfather" | "doctor" | "detective" | "vigilante" | "bomber" | "jester" | "villager";
/** The Mafia team: regular Mafia and the Godfather. */
export const isMafiaRole = (r: Role | null | undefined): boolean => r === "mafia" || r === "godfather";
export type Phase = "lobby" | "reveal" | "night" | "dawn" | "day" | "vote" | "defense" | "result" | "over";
export type VoteStyle = "trial" | "quick";
/** open: listed, one-click join. ask: listed, the host approves each person. private: not listed, code only. */
export type Visibility = "open" | "ask" | "private";
export type VoteStage = "poll" | "final";
export type Mode = "table" | "phones" | "remote";
export type NightStep = "bomber" | "mafia" | "doctor" | "detective" | "vigilante";
/** Which night step a role acts in. The Mafia step belongs to the whole Mafia team. */
export const actsIn = (role: Role | null | undefined, step: NightStep | null): boolean => step === "mafia" ? isMafiaRole(role) : role === step;
export type Winner = "town" | "mafia" | "jester";

export interface Settings {
  mode: Mode;
  doctorSelfSave: boolean;
  doctorRepeatSave: boolean;
  useDoctor: boolean;
  useDetective: boolean;
  mafiaCount: number | null; // null = automatic
  revealRoleOnDeath: boolean;
  deadSeeRoles: boolean;
  dayTimerSec: number;
  voteTimerSec: number;
  voteStyle: VoteStyle; // trial: first vote, defenses, final vote. quick: one vote.
  defenseSec: number;
  visibility: Visibility;
  roomName: string;
  language: Lang; // language of the narrator
  useGodfather: boolean; // a Mafia member who looks innocent to the Detective
  useJester: boolean; // wins alone if voted out by day
  useVigilante: boolean; // town member with one night shot per game
  useBomber: boolean; // Mafia-side role unknown to the Mafia; may blow itself up with one other player
  detectiveCount: number; // 1 or 2 detectives (each investigates on their own)
  finalVoteScope: "accused" | "anyone"; // trial style: who the final vote may name
}

export const DEFAULT_SETTINGS: Settings = {
  mode: "table",
  doctorSelfSave: true,
  doctorRepeatSave: true,
  useDoctor: true,
  useDetective: true,
  mafiaCount: null,
  revealRoleOnDeath: false,
  deadSeeRoles: false,
  dayTimerSec: 180,
  voteTimerSec: 60,
  voteStyle: "trial",
  defenseSec: 30,
  visibility: "private",
  roomName: "",
  language: "en",
  useGodfather: false,
  useJester: false,
  useVigilante: false,
  useBomber: false,
  detectiveCount: 1,
  finalVoteScope: "accused",
};

const clampN = (n: number, lo: number, hi: number, fallback: number) => (Number.isFinite(n) ? Math.min(hi, Math.max(lo, Math.round(n))) : fallback);

/**
 * Complete, valid settings from anything: missing fields take defaults (rooms saved by older versions),
 * invalid values fall back to defaults, unknown fields are dropped. Never throws.
 */
export function normalizeSettings(input: Partial<Record<keyof Settings, unknown>> | undefined | null): Settings {
  const d = DEFAULT_SETTINGS;
  const raw = (input ?? {}) as Record<string, unknown>;
  const oneOf = <T extends string>(v: unknown, allowed: readonly T[], fallback: T): T => (allowed.includes(v as T) ? (v as T) : fallback);
  const bool = (v: unknown, fallback: boolean) => (typeof v === "boolean" ? v : fallback);
  return {
    mode: oneOf(raw.mode, ["table", "phones", "remote"], d.mode),
    doctorSelfSave: bool(raw.doctorSelfSave, d.doctorSelfSave),
    doctorRepeatSave: bool(raw.doctorRepeatSave, d.doctorRepeatSave),
    useDoctor: bool(raw.useDoctor, d.useDoctor),
    useDetective: bool(raw.useDetective, d.useDetective),
    mafiaCount: raw.mafiaCount == null ? null : clampN(Number(raw.mafiaCount), 1, 9, 1),
    revealRoleOnDeath: bool(raw.revealRoleOnDeath, d.revealRoleOnDeath),
    deadSeeRoles: bool(raw.deadSeeRoles, d.deadSeeRoles),
    dayTimerSec: clampN(Number(raw.dayTimerSec ?? d.dayTimerSec), 30, 900, d.dayTimerSec),
    voteTimerSec: clampN(Number(raw.voteTimerSec ?? d.voteTimerSec), 15, 300, d.voteTimerSec),
    voteStyle: oneOf(raw.voteStyle, ["trial", "quick"], d.voteStyle),
    defenseSec: clampN(Number(raw.defenseSec ?? d.defenseSec), 15, 120, d.defenseSec),
    visibility: oneOf(raw.visibility, ["open", "ask", "private"], d.visibility),
    roomName: String(raw.roomName ?? d.roomName).replace(/\s+/g, " ").trim().slice(0, 30),
    language: oneOf(raw.language, LANG_IDS, d.language),
    useGodfather: bool(raw.useGodfather, d.useGodfather),
    useJester: bool(raw.useJester, d.useJester),
    useVigilante: bool(raw.useVigilante, d.useVigilante),
    useBomber: bool(raw.useBomber, d.useBomber),
    detectiveCount: clampN(Number(raw.detectiveCount ?? d.detectiveCount), 1, 2, d.detectiveCount),
    finalVoteScope: oneOf(raw.finalVoteScope, ["accused", "anyone"], d.finalVoteScope),
  };
}

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 20;

export type Persona = "warm" | "blunt" | "playful";

export interface Talk {
  seq: number;
  id: string;
  name: string;
  text: string;
  bot: boolean;
  ghost?: boolean; // said by an eliminated player; only eliminated players see it
}

export const BOT_NAMES = [
  "Maya", "Theo", "Isla", "Dev", "Nora", "Sam", "Zoe", "Kai", "Lila", "Omar",
  "Ruby", "Finn", "Anika", "Leo", "June", "Marco", "Tess", "Ali", "Cleo", "Jules",
];
const PERSONAS: Persona[] = ["warm", "blunt", "playful"];

export interface Player {
  id: string;
  name: string;
  bot?: boolean;
  persona?: Persona;
  role: Role | null;
  alive: boolean;
  connected: boolean;
  seenRole: boolean;
}

/** Narration text uses "|" for a short pause and "||" for a long one; the cue drives music and sound effects. */
export type Cue =
  | "deal" | "night" | "mafia" | "doctor" | "detective" | "vigilante" | "bomber" | "dawn" | "dawn-death"
  | "day" | "vote" | "defense" | "final" | "elim" | "noelim" | "win-town" | "win-mafia" | "win-jester";

export interface Line {
  seq: number;
  text: string;
  cue: Cue | null;
  lang?: Lang; // language the line was written in (older saved rooms have none: English)
}

/** What happened, recorded as the game goes and revealed at the end. */
export interface HistoryEvent {
  round: number;
  kind: "night-kill" | "vigilante-shot" | "bomb" | "saved" | "investigated" | "accused" | "eliminated" | "no-elimination" | "vote";
  ids?: string[];
  by?: string;
  flag?: boolean; // investigated: is Mafia. vigilante-shot: the target died.
  stage?: VoteStage;
  votes?: Record<string, string>;
}

export interface Award {
  id: string;
  title: string;
  detail: string;
  winners: string[]; // player ids
}

export interface GameSummary {
  gameNo: number;
  rounds: number;
  winner: Winner;
  players: { id: string; name: string; role: Role; alive: boolean; bot: boolean }[];
  timeline: HistoryEvent[];
  awards: Award[];
}

export interface Note {
  night: number;
  targetId: string;
  isMafia: boolean;
}

export type Result<T = unknown> = { ok: true; value?: T } | { ok: false; error: string };
const ok = <T>(value?: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

export type Rng = () => number;

/**
 * Suggested role mix for a player count. Optional roles only appear when enough ordinary villagers remain,
 * so the game never turns into all special roles.
 */
export function roleCounts(n: number, s: Pick<Settings, "useDoctor" | "useDetective" | "mafiaCount"> & Partial<Pick<Settings, "useGodfather" | "useJester" | "useVigilante" | "useBomber" | "detectiveCount">>) {
  const maxMafia = Math.max(1, Math.ceil(n / 2) - 1);
  const auto = Math.max(1, Math.floor(n / 3));
  const mafiaTotal = Math.min(maxMafia, Math.max(1, s.mafiaCount ?? auto));
  const godfather = s.useGodfather && mafiaTotal >= 2 ? 1 : 0;
  const mafia = mafiaTotal - godfather;
  let rest = n - mafiaTotal;
  const doctor = s.useDoctor && rest >= 2 ? 1 : 0;
  rest -= doctor;
  // A second Detective only when at least two ordinary villagers would remain.
  const detective = !s.useDetective ? 0 : (s.detectiveCount ?? 1) >= 2 && rest >= 4 ? 2 : rest >= 1 ? 1 : 0;
  rest -= detective;
  const vigilante = s.useVigilante && rest >= 3 ? 1 : 0;
  rest -= vigilante;
  const bomber = s.useBomber && rest >= 4 ? 1 : 0;
  rest -= bomber;
  const jester = s.useJester && rest >= 3 ? 1 : 0;
  rest -= jester;
  return { mafia, godfather, doctor, detective, vigilante, bomber, jester, villager: rest, mafiaTotal };
}

export function shuffle<T>(items: T[], rng: Rng): T[] {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export class Game {
  phase: Phase = "lobby";
  round = 0;
  settings: Settings = { ...DEFAULT_SETTINGS };
  players: Player[] = [];
  hostId: string | null = null;
  winner: Winner | null = null;
  lines: Line[] = [];
  talk: Talk[] = [];
  talkSeq = 0;
  pending: { id: string; name: string }[] = [];
  declined: string[] = [];
  blocked: string[] = [];
  notes: Record<string, Note[]> = {};

  // night
  steps: NightStep[] = [];
  stepIdx = 0;
  mafiaPicks: Record<string, string> = {};
  doctorPick: string | null = null;
  detectivePicks: Record<string, string> = {}; // each Detective investigates on their own
  vigilantePick: string | null = null; // a player id, or "skip" for holding fire
  vigilanteUsed = false;
  bomberPick: string | null = null; // a player id, or "skip" for waiting
  bombed: string[] = []; // who died in tonight's bomb: [bomber, victim]
  lastNightDeathIds: string[] = [];
  gameNo = 0;
  history: HistoryEvent[] = [];
  talkCounts: Record<string, number> = {};
  summary: GameSummary | null = null;
  lastSaved: string | null = null;

  // day
  votes: Record<string, string> = {}; // voterId -> targetId | "skip"
  voteStage: VoteStage = "final";
  defendants: string[] = [];
  defenseIdx = 0;
  lastResult: { text: string; eliminatedId: string | null } | null = null;
  lastVoteReveal: { stage: VoteStage; votes: Record<string, string> } | null = null; // who voted for whom, shown to everyone after each vote
  lastNightDeathId: string | null = null;

  seq = 0;
  constructor(private rng: Rng = Math.random) {}

  /** Load a saved game. Rooms outlive deploys, so anything saved by older code is upgraded to the current shape. */
  static fromJSON(data: unknown, rng: Rng = Math.random): Game {
    const g = Object.assign(new Game(rng), structuredClone(data));
    g.settings = normalizeSettings(g.settings);
    for (const k of ["players", "lines", "talk", "pending", "declined", "blocked", "defendants", "steps"] as const) {
      if (!Array.isArray(g[k])) (g as unknown as Record<string, unknown>)[k] = [];
    }
    for (const k of ["notes", "votes", "mafiaPicks"] as const) {
      if (!g[k] || typeof g[k] !== "object") (g as unknown as Record<string, unknown>)[k] = {};
    }
    if (g.voteStage !== "poll" && g.voteStage !== "final") g.voteStage = "final";
    return g;
  }
  toJSON() {
    const { rng: _rng, ...state } = this as unknown as Record<string, unknown>;
    return state;
  }

  // ---------- helpers ----------
  player(id: string | null | undefined): Player | undefined {
    return this.players.find((p) => p.id === id);
  }
  aliveMafia(): Player[] {
    return this.players.filter((p) => p.alive && isMafiaRole(p.role));
  }
  alive(role?: Role): Player[] {
    return this.players.filter((p) => p.alive && (!role || p.role === role));
  }
  private narrate(text: string, cue: Cue | null = null) {
    this.lines.push({ seq: ++this.seq, text, cue, lang: this.settings.language });
    if (this.lines.length > 40) this.lines.shift();
  }
  private log(e: HistoryEvent) {
    this.history.push(e);
    if (this.history.length > 400) this.history.shift();
  }
  /** One line of narration in the room's language. */
  private t(key: string, vars: Record<string, string | number> = {}): string {
    return say(this.settings.language, key, vars, (xs) => this.pick(xs));
  }
  private pick<T>(options: T[]): T {
    return options[Math.floor(this.rng() * options.length)];
  }
  private classic() {
    return this.settings.mode !== "remote";
  }
  get step(): NightStep | null {
    return this.phase === "night" ? (this.steps[this.stepIdx] ?? null) : null;
  }

  // ---------- lobby ----------
  addPlayer(id: string, name: string): Result {
    const existing = this.player(id);
    if (existing) {
      existing.connected = true;
      return ok();
    }
    if (this.blocked.includes(id)) return fail("You were removed from this room.");
    if (this.phase !== "lobby") return fail("The game has already started.");
    const clean = name.trim().slice(0, 16);
    if (!clean) return fail("Enter a name.");
    if (this.players.length >= MAX_PLAYERS) return fail("The room is full.");
    if (this.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) return fail("That name is taken.");
    this.players.push({ id, name: clean, role: null, alive: true, connected: true, seenRole: false });
    this.hostId ??= id;
    return ok();
  }

  removePlayer(id: string): Result {
    this.pending = this.pending.filter((p) => p.id !== id);
    if (!this.player(id)) return ok();
    if (this.phase !== "lobby") return fail("Players can only leave from the lobby.");
    this.players = this.players.filter((p) => p.id !== id);
    if (this.hostId === id) this.hostId = this.players.find((p) => p.connected && !p.bot)?.id ?? this.players.find((p) => !p.bot)?.id ?? null;
    return ok();
  }

  /** Ask to join (rooms set to "Ask to join"). The host answers with admit or decline. */
  requestJoin(id: string, name: string): Result {
    if (this.player(id)) return ok();
    if (this.blocked.includes(id)) return fail("You were removed from this room.");
    if (this.phase !== "lobby") return fail("The game has already started.");
    const clean = name.trim().slice(0, 16);
    if (!clean) return fail("Enter a name.");
    if (this.players.some((p) => p.name.toLowerCase() === clean.toLowerCase())) return fail("That name is taken.");
    this.declined = this.declined.filter((d) => d !== id);
    this.pending = this.pending.filter((p) => p.id !== id);
    if (this.pending.length >= 10) return fail("Too many people are waiting. Try again soon.");
    this.pending.push({ id, name: clean });
    return ok();
  }

  admit(id: string): Result {
    const req = this.pending.find((p) => p.id === id);
    if (!req) return fail("That request is gone.");
    this.pending = this.pending.filter((p) => p.id !== id);
    return this.addPlayer(req.id, req.name);
  }

  decline(id: string): Result {
    this.pending = this.pending.filter((p) => p.id !== id);
    if (!this.declined.includes(id)) this.declined.push(id);
    return ok();
  }

  /** Remove a person and stop them rejoining this room. */
  kick(id: string): Result {
    if (this.phase !== "lobby") return fail("People can only be removed from the lobby.");
    const p = this.player(id);
    if (!p || p.bot) return fail("That player cannot be removed.");
    if (id === this.hostId) return fail("The host cannot be removed.");
    this.players = this.players.filter((q) => q.id !== id);
    if (!this.blocked.includes(id)) this.blocked.push(id);
    return ok();
  }

  addBot(): Result {
    if (this.phase !== "lobby") return fail("Bots can only join from the lobby.");
    if (this.players.length >= MAX_PLAYERS) return fail("The room is full.");
    const taken = new Set(this.players.map((p) => p.name.toLowerCase()));
    const free = BOT_NAMES.filter((n) => !taken.has(n.toLowerCase()));
    if (!free.length) return fail("No bot names left.");
    const name = this.pick(free);
    const bots = this.players.filter((p) => p.bot).length;
    this.players.push({
      id: `bot-${name.toLowerCase()}`, name, bot: true, persona: PERSONAS[bots % PERSONAS.length],
      role: null, alive: true, connected: true, seenRole: false,
    });
    return ok();
  }

  /** A line in the table-talk feed, from a person or a bot. Eliminated players talk in a ghost channel only they can see. */
  say(playerId: string, text: string): Result {
    const me = this.player(playerId);
    if (!me) return fail("You are not in this game.");
    const ghost = !me.alive && this.phase !== "over";
    if (ghost) {
      if (this.phase === "lobby" || this.phase === "reveal") return fail("Wait for the game to start.");
    } else if (!["day", "vote", "defense", "dawn", "over"].includes(this.phase)) {
      return fail("Wait for the day to talk.");
    }
    const clean = text.replace(/\s+/g, " ").trim().slice(0, 140);
    if (!clean) return fail("Type something to say.");
    this.talk.push({ seq: ++this.talkSeq, id: me.id, name: me.name, text: clean, bot: !!me.bot, ghost });
    if (!ghost) this.talkCounts[me.id] = (this.talkCounts[me.id] ?? 0) + 1;
    if (this.talk.length > 40) this.talk.shift();
    return ok();
  }

  /** Hand the host role to another person (never a bot). */
  setHost(id: string): Result {
    const p = this.player(id);
    if (!p || p.bot) return fail("Only a person can be the host.");
    this.hostId = id;
    return ok();
  }

  /**
   * Give an existing seat to a returning person on a new browser token (lost phone, cleared storage).
   * Every place that remembers the old id is updated, so votes, picks, notes and chat stay with the seat.
   */
  reclaimSeat(oldId: string, newId: string): Result {
    const p = this.player(oldId);
    if (!p || p.bot) return fail("That seat cannot be taken.");
    if (this.player(newId)) return fail("You are already in this game.");
    const swap = (id: string) => (id === oldId ? newId : id);
    const rekey = <T,>(rec: Record<string, T>) => Object.fromEntries(Object.entries(rec).map(([k, v]) => [swap(k), v]));
    p.id = newId;
    p.connected = true;
    if (this.hostId === oldId) this.hostId = newId;
    this.notes = rekey(this.notes);
    this.mafiaPicks = Object.fromEntries(Object.entries(this.mafiaPicks).map(([k, v]) => [swap(k), swap(v)]));
    this.votes = Object.fromEntries(Object.entries(this.votes).map(([k, v]) => [swap(k), swap(v)]));
    this.doctorPick = this.doctorPick ? swap(this.doctorPick) : null;
    this.detectivePicks = Object.fromEntries(Object.entries(this.detectivePicks).map(([k, v]) => [swap(k), swap(v)]));
    this.lastSaved = this.lastSaved ? swap(this.lastSaved) : null;
    this.lastNightDeathId = this.lastNightDeathId ? swap(this.lastNightDeathId) : null;
    this.defendants = this.defendants.map(swap);
    this.blocked = this.blocked.map(swap);
    for (const t of this.talk) if (t.id === oldId) t.id = newId;
    if (this.lastResult?.eliminatedId) this.lastResult.eliminatedId = swap(this.lastResult.eliminatedId);
    return ok();
  }

  setConnected(id: string, connected: boolean) {
    const p = this.player(id);
    if (p) p.connected = connected;
    if (!connected && this.hostId === id) {
      const next = this.players.find((q) => q.connected && !q.bot && q.id !== id);
      if (next) this.hostId = next.id;
    }
  }

  updateSettings(patch: Partial<Settings>): Result {
    if (this.phase !== "lobby") return fail("Settings are locked once the game starts.");
    // Reject clearly invalid choices in the patch; everything else is normalized, so a room saved by an
    // older version (missing newer fields) can still change any setting.
    const bad = <T extends string>(v: unknown, allowed: readonly T[]) => v !== undefined && !allowed.includes(v as T);
    if (bad(patch.mode, ["table", "phones", "remote"])) return fail("Unknown mode.");
    if (bad(patch.voteStyle, ["trial", "quick"])) return fail("Unknown voting style.");
    if (bad(patch.visibility, ["open", "ask", "private"])) return fail("Unknown room visibility.");
    if (bad(patch.language, LANG_IDS)) return fail("Unknown narrator language.");
    if (bad(patch.finalVoteScope, ["accused", "anyone"])) return fail("Unknown final vote setting.");
    this.settings = normalizeSettings({ ...this.settings, ...patch });
    return ok();
  }

  start(): Result {
    if (this.phase !== "lobby") return fail("The game has already started.");
    const n = this.players.length;
    if (n < MIN_PLAYERS) return fail(`You need at least ${MIN_PLAYERS} players.`);
    const c = roleCounts(n, this.settings);
    const deck: Role[] = [
      ...Array<Role>(c.mafia).fill("mafia"),
      ...Array<Role>(c.godfather).fill("godfather"),
      ...Array<Role>(c.doctor).fill("doctor"),
      ...Array<Role>(c.detective).fill("detective"),
      ...Array<Role>(c.vigilante).fill("vigilante"),
      ...Array<Role>(c.bomber).fill("bomber"),
      ...Array<Role>(c.jester).fill("jester"),
      ...Array<Role>(c.villager).fill("villager"),
    ];
    shuffle(deck, this.rng).forEach((role, i) => {
      const p = this.players[i];
      p.role = role;
      p.alive = true;
      p.seenRole = false;
    });
    this.notes = {};
    this.winner = null;
    this.round = 0;
    this.lastSaved = null;
    this.vigilanteUsed = false;
    this.bomberPick = null;
    this.bombed = [];
    this.lastNightDeathIds = [];
    this.gameNo += 1;
    this.history = [];
    this.talkCounts = {};
    this.summary = null;
    this.lines = [];
    this.phase = "reveal";
    this.narrate(this.t("deal"), "deal");
    return ok();
  }

  // ---------- role reveal ----------
  ackRole(id: string): Result {
    if (this.phase !== "reveal") return fail("Not time to confirm roles.");
    const p = this.player(id);
    if (!p) return fail("Unknown player.");
    p.seenRole = true;
    return ok();
  }
  revealComplete(): boolean {
    return this.phase === "reveal" && this.players.every((p) => p.seenRole || !p.connected);
  }

  // ---------- night ----------
  beginNight() {
    this.round += 1;
    this.phase = "night";
    this.steps = [];
    if (this.players.some((p) => p.role === "bomber")) this.steps.push("bomber");
    this.steps.push("mafia");
    if (this.players.some((p) => p.role === "doctor")) this.steps.push("doctor");
    if (this.players.some((p) => p.role === "detective")) this.steps.push("detective");
    if (this.players.some((p) => p.role === "vigilante")) this.steps.push("vigilante");
    this.stepIdx = 0;
    this.mafiaPicks = {};
    this.doctorPick = null;
    this.detectivePicks = {};
    this.vigilantePick = null;
    this.bomberPick = null;
    this.bombed = [];
    this.votes = {};
    this.talk = [];
    this.lastResult = null;
    this.lastVoteReveal = null;
    this.narrate(this.t(this.classic() ? "night.classic" : "night.remote"), "night");
    this.announceStep(null);
  }

  private announceStep(prev: NightStep | null) {
    const step = this.steps[this.stepIdx];
    const lang = this.settings.language;
    if (this.classic()) {
      const close = prev ? this.t("close", { role: roleWord(lang, prev) }) + " || " : "";
      this.narrate(close + this.t(`open.${step}`), step);
    } else {
      this.narrate(this.t(`remote.${step}`), step);
    }
  }

  /** Players who must act in the current night step. */
  actors(): Player[] {
    const step = this.step;
    if (!step) return [];
    return this.players.filter((p) => p.alive && actsIn(p.role, step) && !(step === "vigilante" && this.vigilanteUsed));
  }

  canTarget(playerId: string): string[] {
    const step = this.step;
    const me = this.player(playerId);
    if (!step || !me || !me.alive || !actsIn(me.role, step) || !this.actors().some((p) => p.id === playerId)) return [];
    let pool = this.alive();
    if (step === "mafia") pool = pool.filter((p) => !isMafiaRole(p.role));
    if (step === "bomber") pool = pool.filter((p) => p.id !== me.id && !isMafiaRole(p.role));
    if (step === "detective" || step === "vigilante") pool = pool.filter((p) => p.id !== me.id);
    if (step === "doctor") {
      if (!this.settings.doctorSelfSave) pool = pool.filter((p) => p.id !== me.id);
      if (!this.settings.doctorRepeatSave && this.lastSaved) pool = pool.filter((p) => p.id !== this.lastSaved);
    }
    return pool.map((p) => p.id);
  }

  nightAction(playerId: string, targetId: string): Result {
    const step = this.step;
    if (!step) return fail("It is not night.");
    const me = this.player(playerId);
    if (!me?.alive || !actsIn(me.role, step)) return fail("It is not your turn.");
    if (step === "bomber") {
      if (targetId !== "skip" && !this.canTarget(playerId).includes(targetId)) return fail("You cannot choose that player.");
      this.bomberPick = targetId; // "skip" waits
      return ok();
    }
    if (step === "vigilante") {
      if (this.vigilanteUsed) return fail("You have already used your bullet.");
      if (targetId !== "skip" && !this.canTarget(playerId).includes(targetId)) return fail("You cannot choose that player.");
      this.vigilantePick = targetId; // "skip" holds fire
      return ok();
    }
    if (!this.canTarget(playerId).includes(targetId)) return fail("You cannot choose that player.");
    if (step === "mafia") this.mafiaPicks[playerId] = targetId;
    if (step === "doctor") this.doctorPick = targetId;
    if (step === "detective") {
      if (this.detectivePicks[playerId]) return fail("You already investigated tonight.");
      this.detectivePicks[playerId] = targetId;
      const target = this.player(targetId)!;
      // The Godfather is a different role from "mafia", so the Detective sees him as innocent.
      (this.notes[playerId] ??= []).push({ night: this.round, targetId, isMafia: target.role === "mafia" });
      this.log({ round: this.round, kind: "investigated", by: playerId, ids: [targetId], flag: target.role === "mafia" });
    }
    return ok();
  }

  /** True when no one is left to act, so the server should skip the step quietly. */
  stepIsEmpty(): boolean {
    return this.step !== null && this.actors().length === 0;
  }

  stepComplete(): boolean {
    const step = this.step;
    if (!step) return false;
    if (this.stepIsEmpty()) return true;
    if (step === "mafia") {
      const mafia = this.actors();
      const picks = mafia.map((m) => this.mafiaPicks[m.id]);
      return picks.every(Boolean) && new Set(picks).size === 1;
    }
    if (step === "doctor") return this.doctorPick !== null;
    if (step === "bomber") return this.bomberPick !== null;
    if (step === "vigilante") return this.vigilantePick !== null;
    return this.actors().every((d) => !!this.detectivePicks[d.id]);
  }

  /** Move to the next night step, or resolve the night. `force` settles missing picks. */
  advanceNight(force = false) {
    const step = this.step;
    if (!step) return;
    if (!force && !this.stepComplete()) return;
    if (step === "bomber") this.detonate();
    this.stepIdx += 1;
    if (this.stepIdx < this.steps.length) {
      this.announceStep(step);
    } else {
      if (this.classic()) this.narrate(this.t("close", { role: roleWord(this.settings.language, step) }), "night");
      this.resolveNight();
    }
  }

  /** The Bomber blows up at once, before the Mafia, Doctor and Detective act: a dead Doctor cannot save anyone. */
  private detonate() {
    const bomber = this.players.find((p) => p.role === "bomber" && p.alive);
    const victim = this.bomberPick && this.bomberPick !== "skip" ? this.player(this.bomberPick) : undefined;
    if (!bomber || !victim?.alive) return;
    bomber.alive = false;
    victim.alive = false;
    this.bombed = [bomber.id, victim.id];
    this.log({ round: this.round, kind: "bomb", ids: [bomber.id, victim.id], by: bomber.id });
  }

  private mafiaTarget(): string | null {
    const tally = new Map<string, number>();
    for (const m of this.aliveMafia()) {
      const t = this.mafiaPicks[m.id];
      if (t) tally.set(t, (tally.get(t) ?? 0) + 1);
    }
    if (!tally.size) return null;
    const top = Math.max(...tally.values());
    const tied = [...tally].filter(([, n]) => n === top).map(([id]) => id).sort();
    return tied[Math.floor(this.rng() * tied.length)];
  }

  private resolveNight() {
    const target = this.mafiaTarget();
    const lang = this.settings.language;
    const shot = this.vigilantePick && this.vigilantePick !== "skip" ? this.vigilantePick : null;
    if (shot) this.vigilanteUsed = true; // one bullet per game
    // The Doctor's save protects against any one attack.
    const attacked = [...new Set([target, shot].filter((x): x is string => !!x))];
    const bombDead = this.bombed.map((id) => this.player(id)!);
    const dead = [...bombDead, ...attacked.filter((id) => id !== this.doctorPick && !this.bombed.includes(id)).map((id) => this.player(id)!)];
    this.lastSaved = this.doctorPick;
    for (const id of attacked) if (id === this.doctorPick) this.log({ round: this.round, kind: "saved", ids: [id], by: this.players.find((p) => p.role === "doctor")?.id });
    if (target && target !== this.doctorPick && !this.bombed.includes(target)) this.log({ round: this.round, kind: "night-kill", ids: [target] });
    if (shot) this.log({ round: this.round, kind: "vigilante-shot", ids: [shot], by: this.players.find((p) => p.role === "vigilante")?.id, flag: shot !== this.doctorPick });
    for (const v of dead) v.alive = false;
    this.lastNightDeathIds = dead.map((d) => d.id);
    this.lastNightDeathId = dead[0]?.id ?? null;
    this.phase = "dawn";
    const open = this.t(this.classic() ? "dawn.open.classic" : "dawn.open.remote");
    const reveal = this.settings.revealRoleOnDeath;
    let body: string;
    if (dead.length === 0) {
      body = this.t("dawn.none");
    } else if (bombDead.length) {
      const extra = dead.slice(2);
      body = this.t("dawn.bomb", { a: bombDead[0].name, b: bombDead[1].name }) + (extra.length ? this.t("dawn.also", { names: extra.map((d) => d.name).join(", ") }) : "");
      if (reveal) body += this.t("dawn.role.named", { name: bombDead[1].name, were: wereWord(lang, bombDead[1].role!) }) + extra.map((d) => this.t("dawn.role.named", { name: d.name, were: wereWord(lang, d.role!) })).join("");
    } else if (dead.length === 1) {
      body = this.t("dawn.death", { name: dead[0].name }) + (reveal ? this.t("dawn.role", { were: wereWord(lang, dead[0].role!) }) : "");
    } else {
      body = this.t("dawn.two", { a: dead[0].name, b: dead[1].name }) + (reveal ? dead.map((d) => this.t("dawn.role.named", { name: d.name, were: wereWord(lang, d.role!) })).join("") : "");
    }
    this.narrate(open + body, dead.length ? "dawn-death" : "dawn");
    this.checkWin();
  }

  // ---------- day ----------
  startDay() {
    if (this.phase !== "dawn") return;
    this.phase = "day";
    this.narrate(this.t("day", { time: spokenTime(this.settings.language, this.settings.dayTimerSec) }), "day");
  }

  startVote() {
    if (this.phase !== "day") return;
    this.phase = "vote";
    this.votes = {};
    this.defendants = [];
    this.defenseIdx = 0;
    if (this.settings.voteStyle === "trial") {
      this.voteStage = "poll";
      this.narrate(this.t("vote.trial"), "vote");
    } else {
      this.voteStage = "final";
      this.narrate(this.t("vote.quick"), "vote");
    }
  }

  castVote(playerId: string, targetId: string): Result {
    if (this.phase !== "vote") return fail("Voting is not open.");
    const me = this.player(playerId);
    if (!me?.alive) return fail("Only living players can vote.");
    if (targetId !== "skip") {
      const t = this.player(targetId);
      if (!t?.alive) return fail("Pick a living player.");
      if (t.id === me.id) return fail("You cannot vote for yourself.");
      if (this.voteStage === "final" && this.defendants.length && this.settings.finalVoteScope === "accused" && !this.defendants.includes(t.id)) {
        return fail("Vote for one of the accused, or skip.");
      }
    }
    this.votes[playerId] = targetId;
    return ok();
  }

  voteComplete(): boolean {
    return this.phase === "vote" && this.alive().every((p) => this.votes[p.id]);
  }

  tally(): Record<string, number> {
    const counts: Record<string, number> = {};
    for (const t of Object.values(this.votes)) counts[t] = (counts[t] ?? 0) + 1;
    return counts;
  }

  /** Token for the current wait. A stale tap on "skip" names an old token and does nothing. */
  skipToken(): string {
    return `${this.phase}:${this.round}:${this.voteStage}:${this.defenseIdx}`;
  }

  /** Close the current vote. In trial style the first vote picks defendants; the final vote eliminates. */
  resolveVote() {
    if (this.phase !== "vote") return;
    this.log({ round: this.round, kind: "vote", stage: this.voteStage, votes: { ...this.votes } });
    this.lastVoteReveal = { stage: this.voteStage, votes: { ...this.votes } };
    if (this.voteStage === "poll") return this.resolvePoll();
    const counts = this.tally();
    const entries = Object.entries(counts);
    const top = entries.length ? Math.max(...entries.map(([, n]) => n)) : 0;
    const leaders = entries.filter(([, n]) => n === top).map(([id]) => id);
    let eliminated: Player | null = null;
    let text: string;
    if (leaders.length !== 1 || leaders[0] === "skip") {
      text = this.t(leaders.length > 1 ? "tie.divided" : "tie.wait");
    } else {
      eliminated = this.player(leaders[0])!;
      eliminated.alive = false;
      const role = this.settings.revealRoleOnDeath ? this.t("elim.role", { were: wereWord(this.settings.language, eliminated.role!) }) : "";
      text = this.t("elim", { name: eliminated.name, votes: this.t(top === 1 ? "votes.one" : "votes.many", { n: top }) }) + role;
    }
    this.lastResult = { text, eliminatedId: eliminated?.id ?? null };
    this.log(eliminated ? { round: this.round, kind: "eliminated", ids: [eliminated.id] } : { round: this.round, kind: "no-elimination" });
    this.phase = "result";
    this.narrate(text, eliminated ? "elim" : "noelim");
    if (eliminated?.role === "jester") {
      this.finish("jester", this.t("win.jester"), "win-jester"); // the Jester wanted exactly this
      return;
    }
    this.checkWin();
  }

  private resolvePoll() {
    const counts = this.tally();
    const skips = counts.skip ?? 0;
    const ranked = Object.entries(counts).filter(([id]) => id !== "skip").sort((a, b) => b[1] - a[1]);
    if (!ranked.length || ranked[0][1] <= skips) {
      this.lastResult = { text: this.t("noaccuse"), eliminatedId: null };
      this.log({ round: this.round, kind: "no-elimination" });
      this.phase = "result";
      this.narrate(this.lastResult.text, "noelim");
      return;
    }
    // Two slots. Players tied at the cut-off are drawn at random.
    const chosen: string[] = [];
    const groups = new Map<number, string[]>();
    for (const [id, n] of ranked) groups.set(n, [...(groups.get(n) ?? []), id]);
    for (const n of [...groups.keys()].sort((a, b) => b - a)) {
      const ids = shuffle(groups.get(n)!, this.rng);
      for (const id of ids) if (chosen.length < 2) chosen.push(id);
      if (chosen.length >= 2) break;
    }
    this.defendants = chosen;
    this.defenseIdx = 0;
    this.log({ round: this.round, kind: "accused", ids: [...chosen] });
    this.phase = "defense";
    const names = chosen.map((id) => this.player(id)!.name);
    const intro = names.length === 2 ? this.t("defense.two", { a: names[0], b: names[1] }) : this.t("defense.one", { a: names[0] });
    this.narrate(this.t("defense.start", { intro, call: this.defenseCall(0) }), "defense");
  }

  private defenseCall(i: number) {
    const name = this.player(this.defendants[i])!.name;
    return this.t(i === 0 ? "defense.first" : "defense.next", { name, time: spokenTime(this.settings.language, this.settings.defenseSec) });
  }

  /** Move to the next defender, or to the final vote after the last one. */
  advanceDefense() {
    if (this.phase !== "defense") return;
    if (this.defenseIdx + 1 < this.defendants.length) {
      this.defenseIdx += 1;
      this.narrate(this.defenseCall(this.defenseIdx), "defense");
      return;
    }
    this.phase = "vote";
    this.voteStage = "final";
    this.votes = {};
    this.narrate(this.t("final"), "final");
  }

  // ---------- end ----------
  private checkWin() {
    const mafia = this.aliveMafia().length;
    // A live Bomber counts toward the Mafia's numbers, but cannot keep the Mafia alive on its own.
    const side = mafia + this.players.filter((p) => p.alive && p.role === "bomber").length;
    const town = this.alive().length - side;
    if (mafia === 0) this.finish("town", this.t("win.town"), "win-town");
    else if (side >= town) this.finish("mafia", this.t("win.mafia"), "win-mafia");
  }
  private finish(w: Winner, text: string, cue: Cue) {
    this.winner = w;
    this.phase = "over";
    this.narrate(text, cue);
    this.summary = this.buildSummary(w);
  }

  /** Who did what, plus a few fun awards. Built once, when the game ends. */
  private buildSummary(winner: Winner): GameSummary {
    const name = (id: string) => this.player(id)?.name ?? "someone";
    const awards: Award[] = [];
    const add = (a: Award) => a.winners.length && awards.push(a);

    // votes received across every vote
    const received: Record<string, number> = {};
    for (const e of this.history) if (e.kind === "vote") for (const t of Object.values(e.votes ?? {})) if (t !== "skip") received[t] = (received[t] ?? 0) + 1;

    if (winner === "jester") {
      add({ id: "perfect-fool", title: "Perfect fool", detail: "Fooled the whole village into voting them out.", winners: this.players.filter((p) => p.role === "jester").map((p) => p.id) });
    }
    const found = this.history.filter((e) => e.kind === "investigated" && e.flag);
    if (found.length) {
      const first = found[0];
      add({ id: "sharp-eye", title: "Sharp eye", detail: `Found a Mafia member on night ${first.round}.`, winners: [...new Set(found.map((e) => e.by!).filter(Boolean))] });
    }
    const saves = this.history.filter((e) => e.kind === "saved");
    if (saves.length) {
      add({ id: "guardian-angel", title: "Guardian angel", detail: `Saved ${saves.length === 1 ? "someone" : `${saves.length} lives`} from a certain death.`, winners: [...new Set(saves.map((e) => e.by!).filter(Boolean))] });
    }
    const shots = this.history.filter((e) => e.kind === "vigilante-shot");
    for (const sh of shots) {
      const target = this.player(sh.ids![0]);
      if (!sh.by || !target) continue;
      add(isMafiaRole(target.role)
        ? { id: "dead-eye", title: "Dead eye", detail: `Shot a Mafia member (${target.name}) on night ${sh.round}.`, winners: [sh.by] }
        : { id: "friendly-fire", title: "Friendly fire", detail: `Shot an innocent (${target.name}) on night ${sh.round}.`, winners: [sh.by] });
    }
    const bomb = this.history.find((e) => e.kind === "bomb");
    if (bomb?.by) {
      const victim = this.player(bomb.ids![1]);
      add({ id: "kamikaze", title: "Kamikaze", detail: `Blew up with ${victim?.name ?? "someone"} on night ${bomb.round}.`, winners: [bomb.by] });
    }
    const totalVotes = Object.values(received).reduce((a, b) => a + b, 0);
    const team = this.players.filter((p) => isMafiaRole(p.role));
    if (team.length && totalVotes >= 4) {
      const least = Math.min(...team.map((p) => received[p.id] ?? 0));
      const liars = team.filter((p) => (received[p.id] ?? 0) === least);
      add({ id: "best-liar", title: "Best liar", detail: least === 0 ? "Never received a single vote." : `Only ${least} vote${least === 1 ? "" : "s"} against them all game.`, winners: liars.map((p) => p.id) });
    }
    const most = Math.max(0, ...Object.values(received));
    if (most >= 3) {
      add({ id: "most-suspected", title: "Most suspected", detail: `${most} votes against them across the game.`, winners: Object.entries(received).filter(([, n]) => n === most).map(([id]) => id) });
    }
    const humanTalk = Object.entries(this.talkCounts).filter(([id]) => !this.player(id)?.bot);
    const topTalk = Math.max(0, ...humanTalk.map(([, n]) => n));
    if (topTalk >= 3) {
      add({ id: "chatterbox", title: "Chatterbox", detail: `${topTalk} messages at the table.`, winners: humanTalk.filter(([, n]) => n === topTalk).map(([id]) => id) });
    }
    const standing = this.alive();
    if (standing.length === 1) add({ id: "last-standing", title: "Last one standing", detail: "The only player left alive.", winners: [standing[0].id] });
    void name;

    return {
      gameNo: this.gameNo,
      rounds: this.round,
      winner,
      players: this.players.map((p) => ({ id: p.id, name: p.name, role: p.role!, alive: p.alive, bot: !!p.bot })),
      timeline: this.history.filter((e) => e.kind !== "vote"),
      awards: awards.slice(0, 6),
    };
  }

  rematch(): Result {
    if (this.phase !== "over") return fail("The game is not over.");
    this.phase = "lobby";
    this.round = 0;
    this.winner = null;
    this.notes = {};
    this.lines = [];
    this.talk = [];
    this.lastResult = null;
    this.defendants = [];
    this.defenseIdx = 0;
    this.voteStage = "final";
    this.vigilanteUsed = false;
    this.vigilantePick = null;
    this.lastNightDeathIds = [];
    this.summary = null;
    for (const p of this.players) {
      p.role = null;
      p.alive = true;
      p.seenRole = false;
    }
    this.players = this.players.filter((p) => p.connected);
    return ok();
  }

  // ---------- views ----------
  /** What a given player (or the shared table screen, when null) may know. */
  viewFor(playerId: string | null) {
    const me = this.player(playerId);
    const over = this.phase === "over";
    const seeAll = over || (me && !me.alive && this.settings.deadSeeRoles);
    const showRole = (p: Player) =>
      seeAll || (p.id === me?.id) || (isMafiaRole(me?.role) && isMafiaRole(p.role)) || (me?.role === "bomber" && isMafiaRole(p.role)) ||
      (!p.alive && this.settings.revealRoleOnDeath);
    const counts = this.phase === "vote" || this.phase === "defense" || this.phase === "result" ? this.tally() : {};
    const step = this.step;
    return {
      phase: this.phase,
      round: this.round,
      settings: this.settings,
      hostId: this.hostId,
      winner: this.winner,
      lines: this.lines.slice(-12),
      talk: this.talk.filter((t) => !t.ghost || (me && !me.alive) || this.phase === "over").slice(-14),
      joinStatus: me ? null : playerId ? (this.blocked.includes(playerId) ? "blocked" : this.pending.some((p) => p.id === playerId) ? "pending" : this.declined.includes(playerId) ? "declined" : null) : null,
      pending: playerId && playerId === this.hostId ? this.pending : [],
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
        connected: p.connected,
        seenRole: p.seenRole,
        bot: !!p.bot,
        role: this.phase === "lobby" ? null : showRole(p) ? p.role : null,
      })),
      you: me
        ? {
            id: me.id,
            name: me.name,
            role: me.role,
            alive: me.alive,
            isHost: me.id === this.hostId,
            notes: this.notes[me.id] ?? [],
            bulletUsed: me.role === "vigilante" ? this.vigilanteUsed : false,
          }
        : null,
      night: {
        step: this.phase === "night" ? step : null,
        yourTargets: me ? this.canTarget(me.id) : [],
        yourPick:
          isMafiaRole(me?.role) ? (this.mafiaPicks[me!.id] ?? null)
          : me?.role === "doctor" ? this.doctorPick
          : me?.role === "detective" ? (this.detectivePicks[me.id] ?? null)
          : me?.role === "vigilante" ? this.vigilantePick
          : me?.role === "bomber" ? this.bomberPick
          : null,
        mafiaPicks: isMafiaRole(me?.role) && this.step === "mafia" ? this.mafiaPicks : {},
      },
      vote: {
        counts,
        yourVote: me ? (this.votes[me.id] ?? null) : null,
        stage: this.voteStage,
        voted: this.phase === "vote" ? Object.keys(this.votes).length : 0,
        byWho: me && !me.alive && this.phase === "vote" ? this.votes : {},
        reveal: this.lastVoteReveal,
        eligible: this.alive().length,
      },
      result: this.lastResult,
      summary: this.phase === "over" ? this.summary : null,
      gameNo: this.gameNo,
      defendants: this.defendants,
      defenseIdx: this.defenseIdx,
      skipToken: this.skipToken(),
      minPlayers: MIN_PLAYERS,
      suggested: roleCounts(Math.max(this.players.length, MIN_PLAYERS), this.settings),
    };
  }
}

export type GameView = ReturnType<Game["viewFor"]>;

function clamp(n: number, lo: number, hi: number) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}
