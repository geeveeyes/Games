import { beforeEach, describe, expect, it } from "vitest";
import type { ClientView } from "../shared/room";
import { clearHistory, gameFromView, loadHistory, recordGame, statsOf, teamOf, type PlayedGame } from "../src/history";
import { describeTimeline } from "../src/summaryText";

// A tiny localStorage for the Node test environment.
const store = new Map<string, string>();
(globalThis as any).localStorage = { getItem: (k: string) => store.get(k) ?? null, setItem: (k: string, v: string) => void store.set(k, v), removeItem: (k: string) => void store.delete(k) };

const summary = {
  gameNo: 2, rounds: 3, winner: "town" as const,
  players: [
    { id: "a", name: "Ann", role: "detective" as const, alive: true, bot: false },
    { id: "b", name: "Ben", role: "mafia" as const, alive: false, bot: true },
    { id: "c", name: "Cy", role: "doctor" as const, alive: false, bot: false },
  ],
  timeline: [
    { round: 1, kind: "investigated" as const, by: "a", ids: ["b"], flag: true },
    { round: 1, kind: "eliminated" as const, ids: ["b"] },
    { round: 1, kind: "night-kill" as const, ids: ["c"] },
  ],
  awards: [{ id: "sharp-eye", title: "Sharp eye", detail: "x", winners: ["a"] }],
};
const view = (over: Partial<ClientView> = {}) => ({ phase: "over", code: "ABCD", summary, you: { id: "a", name: "Ann", role: "detective", alive: true, isHost: true, notes: [], bulletUsed: false }, ...over }) as unknown as ClientView;

describe("my games", () => {
  beforeEach(() => store.clear());

  it("builds an entry for the player's own result", () => {
    expect(gameFromView(view())).toMatchObject({ key: "ABCD:2", role: "detective", team: "town", won: true, survived: true, rounds: 3, players: 3, awards: ["Sharp eye"] });
    const loser = gameFromView(view({ you: { id: "b", name: "Ben", role: "mafia", alive: false, isHost: false, notes: [], bulletUsed: false } as never }))!;
    expect(loser).toMatchObject({ team: "mafia", won: false, survived: false, awards: [] });
  });
  it("the Jester counts as winning only when the Jester wins", () => {
    expect(teamOf("jester")).toBe("jester");
    expect(teamOf("godfather")).toBe("mafia");
    expect(teamOf("vigilante")).toBe("town");
  });
  it("saves each game once and ignores unfinished ones", () => {
    expect(recordGame(view())).toBe(true);
    expect(recordGame(view())).toBe(false);
    expect(recordGame(view({ phase: "day" } as never))).toBe(false);
    expect(loadHistory()).toHaveLength(1);
    clearHistory();
    expect(loadHistory()).toEqual([]);
  });
  it("survives corrupt storage", () => {
    store.set("mgm.history", "{not json");
    expect(loadHistory()).toEqual([]);
  });
  it("computes totals, streaks and a favourite role", () => {
    const g = (key: string, won: boolean, role: PlayedGame["role"] = "villager"): PlayedGame => ({ key, at: 1, role, team: teamOf(role), winner: won ? teamOf(role) : "mafia", won, survived: won, rounds: 3, players: 6, awards: won ? ["Sharp eye"] : [] });
    const s = statsOf([g("1", true), g("2", true), g("3", false), g("4", true), g("5", true), g("6", true, "mafia")]);
    expect(s).toMatchObject({ played: 6, won: 5, winRate: 83, streak: 3, bestStreak: 3, favoriteRole: "villager", awardsEarned: 5 });
    expect(s.mafia).toEqual({ played: 1, won: 1 });
    expect(statsOf([])).toMatchObject({ played: 0, winRate: 0, favoriteRole: null });
  });
});

describe("timeline text", () => {
  it("reads in the order things happened", () => {
    expect(describeTimeline(summary)).toEqual([
      "Night 1: the Detective Ann checked Ben and found a Mafia member.",
      "Night 1: the Mafia killed Cy (Doctor).",
      "Day 1: Ben was voted out (Mafia).",
    ]);
  });
});
