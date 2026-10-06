// "My games": a private record of the games this person played, kept only in this browser. No accounts, nothing is sent anywhere.
import { type Role, type Winner, isMafiaRole } from "../shared/game";
import type { ClientView } from "../shared/room";

export type Team = "town" | "mafia" | "jester";
export interface PlayedGame {
  key: string; // room code + game number, so a game is saved once
  at: number;
  role: Role;
  team: Team;
  winner: Winner;
  won: boolean;
  survived: boolean;
  rounds: number;
  players: number;
  awards: string[]; // titles of awards this person earned
}

const KEY = "mgm.history";
const MAX = 200;

export const teamOf = (role: Role): Team => (isMafiaRole(role) || role === "bomber" ? "mafia" : role === "jester" ? "jester" : "town");

export function loadHistory(): PlayedGame[] {
  try {
    const list = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}
function save(list: PlayedGame[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(list.slice(-MAX)));
  } catch {
    /* private mode: history just is not kept */
  }
}
export const clearHistory = () => save([]);

/** Build the entry for a finished game as seen by this player. */
export function gameFromView(view: ClientView, now = Date.now()): PlayedGame | null {
  const s = view.summary;
  const me = view.you;
  if (view.phase !== "over" || !s || !me) return null;
  const mine = s.players.find((p) => p.id === me.id);
  if (!mine) return null;
  const team = teamOf(mine.role);
  return {
    key: `${view.code}:${s.gameNo}`,
    at: now,
    role: mine.role,
    team,
    winner: s.winner,
    won: s.winner === team,
    survived: mine.alive,
    rounds: s.rounds,
    players: s.players.length,
    awards: s.awards.filter((a) => a.winners.includes(me.id)).map((a) => a.title),
  };
}

/** Save the game once; calling again for the same game does nothing. */
export function recordGame(view: ClientView): boolean {
  const game = gameFromView(view);
  if (!game) return false;
  const list = loadHistory();
  if (list.some((g) => g.key === game.key)) return false;
  save([...list, game]);
  return true;
}

export function statsOf(list: PlayedGame[]) {
  const played = list.length;
  const won = list.filter((g) => g.won).length;
  const byTeam = (t: Team) => ({ played: list.filter((g) => g.team === t).length, won: list.filter((g) => g.team === t && g.won).length });
  const roleCounts: Record<string, number> = {};
  for (const g of list) roleCounts[g.role] = (roleCounts[g.role] ?? 0) + 1;
  const favoriteRole = Object.entries(roleCounts).sort((a, b) => b[1] - a[1])[0]?.[0] ?? null;
  let streak = 0;
  for (let i = list.length - 1; i >= 0 && list[i].won; i--) streak++;
  let best = 0, run = 0;
  for (const g of list) best = Math.max(best, (run = g.won ? run + 1 : 0));
  return {
    played,
    won,
    winRate: played ? Math.round((won / played) * 100) : 0,
    town: byTeam("town"),
    mafia: byTeam("mafia"),
    jester: byTeam("jester"),
    favoriteRole,
    streak,
    bestStreak: best,
    awardsEarned: list.reduce((n, g) => n + g.awards.length, 0),
    survivedRate: played ? Math.round((list.filter((g) => g.survived).length / played) * 100) : 0,
  };
}
