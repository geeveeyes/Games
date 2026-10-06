// Pure game engine for Mafia God Mode. No timers, no I/O: the server owns time.
// Every secret (roles, night picks, detective results) stays in this object;
// `viewFor` is the only way state leaves it.

export type Role = "mafia" | "doctor" | "detective" | "villager";
export type Phase = "lobby" | "reveal" | "night" | "dawn" | "day" | "vote" | "defense" | "result" | "over";
export type VoteStyle = "trial" | "quick";
/** open: listed, one-click join. ask: listed, the host approves each person. private: not listed, code only. */
export type Visibility = "open" | "ask" | "private";
export type VoteStage = "poll" | "final";
export type Mode = "table" | "phones" | "remote";
export type NightStep = "mafia" | "doctor" | "detective";
export type Winner = "town" | "mafia";

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
  | "deal" | "night" | "mafia" | "doctor" | "detective" | "dawn" | "dawn-death"
  | "day" | "vote" | "defense" | "final" | "elim" | "noelim" | "win-town" | "win-mafia";

export interface Line {
  seq: number;
  text: string;
  cue: Cue | null;
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

/** Suggested role mix for a player count. */
export function roleCounts(n: number, s: Pick<Settings, "useDoctor" | "useDetective" | "mafiaCount">) {
  const maxMafia = Math.max(1, Math.ceil(n / 2) - 1);
  const auto = Math.max(1, Math.floor(n / 3));
  const mafia = Math.min(maxMafia, Math.max(1, s.mafiaCount ?? auto));
  const doctor = s.useDoctor && n - mafia >= 2 ? 1 : 0;
  const detective = s.useDetective && n - mafia - doctor >= 1 ? 1 : 0;
  const villager = n - mafia - doctor - detective;
  return { mafia, doctor, detective, villager };
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
  detectivePick: string | null = null;
  lastSaved: string | null = null;

  // day
  votes: Record<string, string> = {}; // voterId -> targetId | "skip"
  voteStage: VoteStage = "final";
  defendants: string[] = [];
  defenseIdx = 0;
  lastResult: { text: string; eliminatedId: string | null } | null = null;
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
  alive(role?: Role): Player[] {
    return this.players.filter((p) => p.alive && (!role || p.role === role));
  }
  private narrate(text: string, cue: Cue | null = null) {
    this.lines.push({ seq: ++this.seq, text, cue });
    if (this.lines.length > 40) this.lines.shift();
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

  /** A line in the table-talk feed, from a person or a bot. */
  say(playerId: string, text: string): Result {
    const me = this.player(playerId);
    if (!me?.alive) return fail("Only living players can talk.");
    if (!["day", "vote", "defense", "dawn"].includes(this.phase)) return fail("Wait for the day to talk.");
    const clean = text.replace(/\s+/g, " ").trim().slice(0, 140);
    if (!clean) return fail("Type something to say.");
    this.talk.push({ seq: ++this.talkSeq, id: me.id, name: me.name, text: clean, bot: !!me.bot });
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
    this.detectivePick = this.detectivePick ? swap(this.detectivePick) : null;
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
      ...Array<Role>(c.doctor).fill("doctor"),
      ...Array<Role>(c.detective).fill("detective"),
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
    this.lines = [];
    this.phase = "reveal";
    this.narrate("Look at your phone. | Your role is for your eyes only. || Keep it secret.", "deal");
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
    this.steps = ["mafia"];
    if (this.players.some((p) => p.role === "doctor")) this.steps.push("doctor");
    if (this.players.some((p) => p.role === "detective")) this.steps.push("detective");
    this.stepIdx = 0;
    this.mafiaPicks = {};
    this.doctorPick = null;
    this.detectivePick = null;
    this.votes = {};
    this.talk = [];
    this.lastResult = null;
    this.narrate(
      this.classic()
        ? this.pick([
            "Night falls on the village. || Everyone... close your eyes. | Keep them closed. | No peeking.",
            "The sun sets... | and the village falls silent. || Everyone, close your eyes.",
            "Darkness settles over the village. || Close your eyes, everyone. | Do not open them until I say so.",
          ])
        : "Night falls on the village. | Night roles, check your phones.",
      "night",
    );
    this.announceStep(null);
  }

  private announceStep(prev: NightStep | null) {
    const step = this.steps[this.stepIdx];
    const label = { mafia: "Mafia", doctor: "Doctor", detective: "Detective" } as const;
    const open = {
      mafia: [
        "Mafia... open your eyes. | Find your partners in the dark. || Choose... who will not see the morning.",
        "Mafia... wake up. | Silently agree on your victim.",
      ],
      doctor: [
        "Doctor... open your eyes. | Who will you protect tonight?",
        "Doctor... wake up. | Choose someone to save from the dark.",
      ],
      detective: [
        "Detective... open your eyes. | Whose secret do you wish to uncover?",
        "Detective... wake up. | Choose someone to investigate.",
      ],
    } as const;
    const remote = {
      mafia: "Mafia, it is your turn. | Agree on a victim.",
      doctor: "Doctor, it is your turn. | Choose someone to save.",
      detective: "Detective, it is your turn. | Choose someone to investigate.",
    } as const;
    if (this.classic()) {
      const close = prev ? `${label[prev]}... close your eyes. || ` : "";
      this.narrate(close + this.pick([...open[step]]), step);
    } else {
      this.narrate(remote[step], step);
    }
  }

  /** Players who must act in the current night step. */
  actors(): Player[] {
    const step = this.step;
    return step ? this.alive(step) : [];
  }

  canTarget(playerId: string): string[] {
    const step = this.step;
    const me = this.player(playerId);
    if (!step || !me || !me.alive || me.role !== step) return [];
    let pool = this.alive();
    if (step === "mafia") pool = pool.filter((p) => p.role !== "mafia");
    if (step === "detective") pool = pool.filter((p) => p.id !== me.id);
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
    if (!me?.alive || me.role !== step) return fail("It is not your turn.");
    if (!this.canTarget(playerId).includes(targetId)) return fail("You cannot choose that player.");
    if (step === "mafia") this.mafiaPicks[playerId] = targetId;
    if (step === "doctor") this.doctorPick = targetId;
    if (step === "detective") {
      if (this.detectivePick) return fail("You already investigated tonight.");
      this.detectivePick = targetId;
      const target = this.player(targetId)!;
      (this.notes[playerId] ??= []).push({ night: this.round, targetId, isMafia: target.role === "mafia" });
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
    return this.detectivePick !== null;
  }

  /** Move to the next night step, or resolve the night. `force` settles missing picks. */
  advanceNight(force = false) {
    const step = this.step;
    if (!step) return;
    if (!force && !this.stepComplete()) return;
    this.stepIdx += 1;
    if (this.stepIdx < this.steps.length) {
      this.announceStep(step);
    } else {
      if (this.classic()) this.narrate(`${{ mafia: "Mafia", doctor: "Doctor", detective: "Detective" }[step]}... close your eyes.`, "night");
      this.resolveNight();
    }
  }

  private mafiaTarget(): string | null {
    const tally = new Map<string, number>();
    for (const m of this.alive("mafia")) {
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
    const saved = target !== null && target === this.doctorPick;
    this.lastSaved = this.doctorPick;
    const victim = target && !saved ? this.player(target)! : null;
    if (victim) victim.alive = false;
    this.lastNightDeathId = victim?.id ?? null;
    this.phase = "dawn";
    const open = this.classic() ? "The sun rises. || Everyone... open your eyes. || " : "The sun rises. || ";
    const role = victim && this.settings.revealRoleOnDeath ? ` | They were ${article(victim.role!)}.` : "";
    this.narrate(
      open +
        (victim
          ? `Sadly... | ${victim.name} | was killed in the night.${role}`
          : this.pick(["And miraculously... | nobody died tonight.", "The village wakes... | and everyone is still alive."])),
      victim ? "dawn-death" : "dawn",
    );
    this.checkWin();
  }

  // ---------- day ----------
  startDay() {
    if (this.phase !== "dawn") return;
    this.phase = "day";
    this.narrate(`The village gathers. | Someone among you is lying. || Discuss. | You have ${spoken(this.settings.dayTimerSec)}.`, "day");
  }

  startVote() {
    if (this.phase !== "day") return;
    this.phase = "vote";
    this.votes = {};
    this.defendants = [];
    this.defenseIdx = 0;
    if (this.settings.voteStyle === "trial") {
      this.voteStage = "poll";
      this.narrate("Time is up. || Who do you suspect? | Cast your first vote. | It only decides who must defend themselves.", "vote");
    } else {
      this.voteStage = "final";
      this.narrate("Time is up. || Point at the one you suspect... | and cast your vote.", "vote");
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
      if (this.voteStage === "final" && this.defendants.length && !this.defendants.includes(t.id)) {
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
    if (this.voteStage === "poll") return this.resolvePoll();
    const counts = this.tally();
    const entries = Object.entries(counts);
    const top = entries.length ? Math.max(...entries.map(([, n]) => n)) : 0;
    const leaders = entries.filter(([, n]) => n === top).map(([id]) => id);
    let eliminated: Player | null = null;
    let text: string;
    if (leaders.length !== 1 || leaders[0] === "skip") {
      text = leaders.length > 1 ? "The village is divided. | Nobody is eliminated." : "The village chooses to wait. | Nobody is eliminated.";
    } else {
      eliminated = this.player(leaders[0])!;
      eliminated.alive = false;
      const role = this.settings.revealRoleOnDeath ? ` || They were ${article(eliminated.role!)}.` : "";
      text = `${eliminated.name}... | the village has spoken. || You are eliminated, with ${top} vote${top === 1 ? "" : "s"}.${role}`;
    }
    this.lastResult = { text, eliminatedId: eliminated?.id ?? null };
    this.phase = "result";
    this.narrate(text, eliminated ? "elim" : "noelim");
    this.checkWin();
  }

  private resolvePoll() {
    const counts = this.tally();
    const skips = counts.skip ?? 0;
    const ranked = Object.entries(counts).filter(([id]) => id !== "skip").sort((a, b) => b[1] - a[1]);
    if (!ranked.length || ranked[0][1] <= skips) {
      this.lastResult = { text: "The village cannot agree on anyone. | Nobody is accused.", eliminatedId: null };
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
    this.phase = "defense";
    const names = chosen.map((id) => this.player(id)!.name);
    const intro = names.length === 2 ? `${names[0]}... | and ${names[1]}. || You stand accused.` : `${names[0]}... | you stand accused.`;
    this.narrate(`The first votes are in. || ${intro} || ${this.defenseCall(0)}`, "defense");
  }

  private defenseCall(i: number) {
    const name = this.player(this.defendants[i])!.name;
    const t = spoken(this.settings.defenseSec);
    return i === 0
      ? `${name}... | the floor is yours. | You have ${t} to defend yourself.`
      : `Now... | ${name}. | Your turn. | You have ${t} to defend yourself.`;
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
    this.narrate("The defenses are done. || Now... | cast your final vote. | Who will be eliminated?", "final");
  }

  // ---------- end ----------
  private checkWin() {
    const mafia = this.alive("mafia").length;
    const town = this.alive().length - mafia;
    if (mafia === 0) this.finish("town", "The last Mafia is gone. || The Town wins!", "win-town");
    else if (mafia >= town) this.finish("mafia", "Darkness settles over the village for good. || The Mafia wins.", "win-mafia");
  }
  private finish(w: Winner, text: string, cue: Cue) {
    this.winner = w;
    this.phase = "over";
    this.narrate(text, cue);
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
      seeAll || (p.id === me?.id) || (me?.role === "mafia" && p.role === "mafia") ||
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
      talk: this.talk.slice(-14),
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
          }
        : null,
      night: {
        step: this.phase === "night" ? step : null,
        yourTargets: me ? this.canTarget(me.id) : [],
        yourPick:
          me?.role === "mafia" ? (this.mafiaPicks[me.id] ?? null)
          : me?.role === "doctor" ? this.doctorPick
          : me?.role === "detective" ? this.detectivePick
          : null,
        mafiaPicks: me?.role === "mafia" && this.step === "mafia" ? this.mafiaPicks : {},
      },
      vote: {
        counts,
        yourVote: me ? (this.votes[me.id] ?? null) : null,
        stage: this.voteStage,
        voted: this.phase === "vote" ? Object.keys(this.votes).length : 0,
        eligible: this.alive().length,
      },
      result: this.lastResult,
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
function spoken(sec: number) {
  if (sec < 60) return `${sec} seconds`;
  const m = Math.round(sec / 60);
  return `${m} minute${m === 1 ? "" : "s"}`;
}
function article(role: Role) {
  return role === "mafia" ? "a Mafia member" : role === "villager" ? "a Villager" : `the ${role[0].toUpperCase()}${role.slice(1)}`;
}
