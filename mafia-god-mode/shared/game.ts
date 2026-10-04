// Pure game engine for Mafia God Mode. No timers, no I/O: the server owns time.
// Every secret (roles, night picks, detective results) stays in this object;
// `viewFor` is the only way state leaves it.

export type Role = "mafia" | "doctor" | "detective" | "villager";
export type Phase = "lobby" | "reveal" | "night" | "dawn" | "day" | "vote" | "result" | "over";
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
};

export const MIN_PLAYERS = 4;
export const MAX_PLAYERS = 20;

export interface Player {
  id: string;
  name: string;
  role: Role | null;
  alive: boolean;
  connected: boolean;
  seenRole: boolean;
}

export interface Line {
  seq: number;
  text: string;
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
  lastResult: { text: string; eliminatedId: string | null } | null = null;
  lastNightDeathId: string | null = null;

  seq = 0;
  constructor(private rng: Rng = Math.random) {}

  static fromJSON(data: unknown, rng: Rng = Math.random): Game {
    return Object.assign(new Game(rng), structuredClone(data));
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
  private narrate(text: string) {
    this.lines.push({ seq: ++this.seq, text });
    if (this.lines.length > 40) this.lines.shift();
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
    if (this.phase !== "lobby") return fail("Players can only leave from the lobby.");
    this.players = this.players.filter((p) => p.id !== id);
    if (this.hostId === id) this.hostId = this.players.find((p) => p.connected)?.id ?? this.players[0]?.id ?? null;
    return ok();
  }

  setConnected(id: string, connected: boolean) {
    const p = this.player(id);
    if (p) p.connected = connected;
    if (!connected && this.hostId === id) {
      const next = this.players.find((q) => q.connected && q.id !== id);
      if (next) this.hostId = next.id;
    }
  }

  updateSettings(patch: Partial<Settings>): Result {
    if (this.phase !== "lobby") return fail("Settings are locked once the game starts.");
    const s = { ...this.settings, ...patch };
    if (!["table", "phones", "remote"].includes(s.mode)) return fail("Unknown mode.");
    s.dayTimerSec = clamp(Math.round(Number(s.dayTimerSec)), 30, 900);
    s.voteTimerSec = clamp(Math.round(Number(s.voteTimerSec)), 15, 300);
    s.mafiaCount = s.mafiaCount == null ? null : clamp(Math.round(Number(s.mafiaCount)), 1, 9);
    for (const k of ["doctorSelfSave", "doctorRepeatSave", "useDoctor", "useDetective", "revealRoleOnDeath", "deadSeeRoles"] as const) {
      s[k] = Boolean(s[k]);
    }
    this.settings = s;
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
    this.narrate("Check your phone to see your secret role. Keep it to yourself.");
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
    this.lastResult = null;
    this.narrate(
      this.classic()
        ? "Night falls. Everyone, close your eyes."
        : "Night falls. Night roles, check your phones.",
    );
    this.announceStep(null);
  }

  private announceStep(prev: NightStep | null) {
    const step = this.steps[this.stepIdx];
    const label = { mafia: "Mafia", doctor: "Doctor", detective: "Detective" } as const;
    const prompt = {
      mafia: "Agree on who to eliminate.",
      doctor: "Choose someone to save.",
      detective: "Choose someone to investigate.",
    } as const;
    const parts: string[] = [];
    if (this.classic()) {
      if (prev) parts.push(`${label[prev]}, close your eyes.`);
      parts.push(`${label[step]}, open your eyes. ${prompt[step]}`);
    } else {
      parts.push(`${label[step]}: ${prompt[step]}`);
    }
    this.narrate(parts.join(" "));
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
      if (this.classic()) this.narrate(`${{ mafia: "Mafia", doctor: "Doctor", detective: "Detective" }[step]}, close your eyes.`);
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
    const open = this.classic() ? "Everyone, open your eyes. Morning has come. " : "Morning has come. ";
    const role = victim && this.settings.revealRoleOnDeath ? ` They were ${article(victim.role!)}.` : "";
    this.narrate(open + (victim ? `${victim.name} was killed in the night.${role}` : "Nobody died last night."));
    this.checkWin();
  }

  // ---------- day ----------
  startDay() {
    if (this.phase !== "dawn") return;
    this.phase = "day";
    this.narrate("Discuss who you think is Mafia. Voting opens when the timer ends.");
  }

  startVote() {
    if (this.phase !== "day") return;
    this.phase = "vote";
    this.votes = {};
    this.narrate("Time to vote. Pick a player, or skip.");
  }

  castVote(playerId: string, targetId: string): Result {
    if (this.phase !== "vote") return fail("Voting is not open.");
    const me = this.player(playerId);
    if (!me?.alive) return fail("Only living players can vote.");
    if (targetId !== "skip") {
      const t = this.player(targetId);
      if (!t?.alive) return fail("Pick a living player.");
      if (t.id === me.id) return fail("You cannot vote for yourself.");
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

  resolveVote() {
    if (this.phase !== "vote") return;
    const counts = this.tally();
    const entries = Object.entries(counts);
    const top = entries.length ? Math.max(...entries.map(([, n]) => n)) : 0;
    const leaders = entries.filter(([, n]) => n === top).map(([id]) => id);
    let eliminated: Player | null = null;
    let text: string;
    if (leaders.length !== 1 || leaders[0] === "skip") {
      text = leaders.length > 1 ? "The vote is tied. Nobody is eliminated." : "Nobody is eliminated.";
    } else {
      eliminated = this.player(leaders[0])!;
      eliminated.alive = false;
      const role = this.settings.revealRoleOnDeath ? ` They were ${article(eliminated.role!)}.` : "";
      text = `${eliminated.name} was eliminated with ${top} vote${top === 1 ? "" : "s"}.${role}`;
    }
    this.lastResult = { text, eliminatedId: eliminated?.id ?? null };
    this.phase = "result";
    this.narrate(text);
    this.checkWin();
  }

  // ---------- end ----------
  private checkWin() {
    const mafia = this.alive("mafia").length;
    const town = this.alive().length - mafia;
    if (mafia === 0) this.finish("town", "The Town wins! Every Mafia member has been caught.");
    else if (mafia >= town) this.finish("mafia", "The Mafia wins! They now outnumber the town.");
  }
  private finish(w: Winner, text: string) {
    this.winner = w;
    this.phase = "over";
    this.narrate(text);
  }

  rematch(): Result {
    if (this.phase !== "over") return fail("The game is not over.");
    this.phase = "lobby";
    this.round = 0;
    this.winner = null;
    this.notes = {};
    this.lines = [];
    this.lastResult = null;
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
    const counts = this.phase === "vote" || this.phase === "result" ? this.tally() : {};
    const step = this.step;
    return {
      phase: this.phase,
      round: this.round,
      settings: this.settings,
      hostId: this.hostId,
      winner: this.winner,
      lines: this.lines.slice(-12),
      players: this.players.map((p) => ({
        id: p.id,
        name: p.name,
        alive: p.alive,
        connected: p.connected,
        seenRole: p.seenRole,
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
        voted: this.phase === "vote" ? Object.keys(this.votes).length : 0,
        eligible: this.alive().length,
      },
      result: this.lastResult,
      minPlayers: MIN_PLAYERS,
      suggested: roleCounts(Math.max(this.players.length, MIN_PLAYERS), this.settings),
    };
  }
}

export type GameView = ReturnType<Game["viewFor"]>;

function clamp(n: number, lo: number, hi: number) {
  return Number.isFinite(n) ? Math.min(hi, Math.max(lo, n)) : lo;
}
function article(role: Role) {
  return role === "mafia" ? "a Mafia member" : role === "villager" ? "a Villager" : `the ${role[0].toUpperCase()}${role.slice(1)}`;
}
