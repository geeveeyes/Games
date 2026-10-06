// Anonymous records of finished games, so we can see how the game is really used (how many games, how big, which
// options). No names, no room codes, no browser ids. Stored in Redis next to the feedback.
import type { Game, Winner } from "./game";

export interface GameRecord {
  at: number;
  rounds: number;
  winner: Winner;
  players: number;
  bots: number;
  roles: string[]; // the optional roles that were in play
  language: string;
  mode: string;
  voteStyle: string;
}

export function recordOf(g: Game, now: number): GameRecord | null {
  if (!g.summary) return null;
  const roles = [...new Set(g.summary.players.map((p) => p.role))].filter((r) => ["godfather", "jester", "vigilante"].includes(r));
  return {
    at: now,
    rounds: g.summary.rounds,
    winner: g.summary.winner,
    players: g.players.length,
    bots: g.players.filter((p) => p.bot).length,
    roles,
    language: g.settings.language,
    mode: g.settings.mode,
    voteStyle: g.settings.voteStyle,
  };
}

const count = (xs: string[]) => xs.reduce<Record<string, number>>((m, x) => ((m[x] = (m[x] ?? 0) + 1), m), {});
const avg = (xs: number[]) => (xs.length ? Math.round((xs.reduce((a, b) => a + b, 0) / xs.length) * 10) / 10 : 0);

export function aggregate(records: GameRecord[], now = Date.now()) {
  const day = 24 * 3600 * 1000;
  const perDay: { day: string; games: number }[] = [];
  for (let i = 13; i >= 0; i--) {
    const start = new Date(now - i * day);
    const label = start.toISOString().slice(0, 10);
    perDay.push({ day: label, games: records.filter((r) => new Date(r.at).toISOString().slice(0, 10) === label).length });
  }
  return {
    games: records.length,
    last7days: records.filter((r) => now - r.at < 7 * day).length,
    avgPlayers: avg(records.map((r) => r.players)),
    avgBots: avg(records.map((r) => r.bots)),
    avgRounds: avg(records.map((r) => r.rounds)),
    gamesWithBots: records.filter((r) => r.bots > 0).length,
    winners: count(records.map((r) => r.winner)),
    languages: count(records.map((r) => r.language)),
    modes: count(records.map((r) => r.mode)),
    voteStyles: count(records.map((r) => r.voteStyle)),
    optionalRoles: count(records.flatMap((r) => r.roles)),
    perDay,
  };
}
