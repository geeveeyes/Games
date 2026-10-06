import { describe, expect, it } from "vitest";
import { handle } from "../shared/handler";
import { INSTANT_TIMING } from "../shared/room";
import { aggregate, type GameRecord } from "../shared/stats";
import { MemoryStore } from "../shared/store";

const rec = (over: Partial<GameRecord> = {}): GameRecord => ({ at: Date.now(), rounds: 3, winner: "town", players: 6, bots: 2, roles: [], language: "en", mode: "table", voteStyle: "trial", ...over });

describe("usage stats", () => {
  it("aggregates records", () => {
    const now = Date.now();
    const a = aggregate([rec(), rec({ winner: "mafia", players: 8, bots: 0, roles: ["jester"], language: "hi" }), rec({ at: now - 20 * 24 * 3600 * 1000 })], now);
    expect(a.games).toBe(3);
    expect(a.last7days).toBe(2);
    expect(a.winners).toEqual({ town: 2, mafia: 1 });
    expect(a.languages).toEqual({ en: 2, hi: 1 });
    expect(a.gamesWithBots).toBe(2);
    expect(a.optionalRoles).toEqual({ jester: 1 });
    expect(a.perDay).toHaveLength(14);
  });

  it("records each finished game once, anonymously", async () => {
    const store = new MemoryStore();
    let now = 7_000_000;
    const call = (a: any) => handle(a, store, now, INSTANT_TIMING);
    const c = await call({ action: "create", token: "secret-token", name: "Venkat" });
    if (!c.ok) throw new Error(c.error);
    await call({ action: "settings", code: c.code, token: "secret-token", patch: { voteStyle: "quick" } });
    await call({ action: "addBot", code: c.code, token: "secret-token", count: 4 });
    await call({ action: "start", code: c.code, token: "secret-token" });
    for (let i = 0; i < 300; i++) {
      now += 1000;
      const r = await call({ action: "poll", code: c.code, token: "secret-token" });
      if (!r.ok) throw new Error(r.error);
      const v = r.view;
      if (v.phase === "over") break;
      if (v.phase === "reveal") await call({ action: "ack", code: c.code, token: "secret-token" });
      if (v.phase === "night" && v.you?.alive && v.night.yourPick === null && v.night.yourTargets.length) await call({ action: "night", code: c.code, token: "secret-token", target: v.night.yourTargets[0] });
      if (v.phase === "vote" && v.you?.alive && !v.vote.yourVote) await call({ action: "vote", code: c.code, token: "secret-token", target: "skip" });
      now += 70_000;
    }
    await call({ action: "poll", code: c.code, token: "secret-token" });
    await call({ action: "poll", code: c.code, token: "secret-token" }); // polling again must not record twice
    const games = await store.listGames(10);
    expect(games).toHaveLength(1);
    expect(games[0]).toMatchObject({ players: 5, bots: 4, voteStyle: "quick", language: "en" });
    expect(JSON.stringify(games)).not.toMatch(/secret-token|Venkat|"code"/); // nothing identifying
    // a rematch and another game records a second entry
    await call({ action: "rematch", code: c.code, token: "secret-token" });
    await call({ action: "start", code: c.code, token: "secret-token" });
    for (let i = 0; i < 300; i++) {
      now += 1000;
      const r = await call({ action: "poll", code: c.code, token: "secret-token" });
      if (!r.ok) throw new Error(r.error);
      const v = r.view;
      if (v.phase === "over") break;
      if (v.phase === "reveal") await call({ action: "ack", code: c.code, token: "secret-token" });
      if (v.phase === "night" && v.you?.alive && v.night.yourPick === null && v.night.yourTargets.length) await call({ action: "night", code: c.code, token: "secret-token", target: v.night.yourTargets[0] });
      if (v.phase === "vote" && v.you?.alive && !v.vote.yourVote) await call({ action: "vote", code: c.code, token: "secret-token", target: "skip" });
      now += 70_000;
    }
    await call({ action: "poll", code: c.code, token: "secret-token" });
    expect(await store.listGames(10)).toHaveLength(2);
  }, 30_000);
});
