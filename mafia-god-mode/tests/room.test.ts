import { describe, expect, it } from "vitest";
import { handle } from "../shared/handler";
import { INSTANT_TIMING } from "../shared/room";
import { MemoryStore } from "../shared/store";
import { Game } from "../shared/game";

describe("full game through the API", () => {
  it("plays to a winner with lazy timers", async () => {
    const store = new MemoryStore();
    let now = 1_000_000;
    const call = (a: any) => handle(a, store, now, INSTANT_TIMING);

    const created = await call({ action: "create", token: "t0", name: "Host" });
    if (!created.ok) throw new Error(created.error);
    const code = created.code;
    for (let i = 1; i < 6; i++) {
      const r = await call({ action: "join", code, token: `t${i}`, name: `P${i}` });
      expect(r.ok).toBe(true);
    }
    expect((await call({ action: "start", code, token: "t1" })).ok).toBe(false); // not host
    expect((await call({ action: "start", code, token: "t0" })).ok).toBe(true);

    // Every player sees only their own role.
    const views = await Promise.all(Array.from({ length: 6 }, (_, i) => call({ action: "poll", code, token: `t${i}` })));
    for (const [i, v] of views.entries()) {
      if (!v.ok) throw new Error();
      expect(v.view.players.filter((p) => p.role && p.id !== `t${i}`).length).toBeLessThanOrEqual(1);
    }

    // Drive the game with the real rules, picking targets from each player's own view.
    for (let step = 0; step < 200; step++) {
      now += 1;
      const room = await store.get(code);
      const g = Game.fromJSON(room!.game);
      if (g.phase === "over") break;
      for (const p of g.alive()) {
        const v = await call({ action: "poll", code, token: p.id });
        if (!v.ok) throw new Error(v.error);
        const { phase, night, you } = v.view;
        if (phase === "reveal") await call({ action: "ack", code, token: p.id });
        if (phase === "night" && night.yourTargets.length && night.yourPick === null) {
          // Mafia always pick the first non-mafia; others pick the first option.
          await call({ action: "night", code, token: p.id, target: night.yourTargets[0] });
        }
        if (phase === "vote" && you && !v.view.vote.yourVote) {
          const mafiaAlive = g.alive("mafia");
          const target = p.role === "mafia" ? g.alive().find((x) => x.role !== "mafia")!.id : mafiaAlive[0].id;
          await call({ action: "vote", code, token: p.id, target });
        }
      }
      now += 100_000; // jump past every timer
      await call({ action: "poll", code });
    }
    const final = await call({ action: "watch", code });
    if (!final.ok) throw new Error(final.error);
    expect(final.view.phase).toBe("over");
    expect(final.view.winner).not.toBeNull();
    expect(final.view.players.every((p) => p.role)).toBe(true); // roles revealed at the end
  });

  it("a stale or double skip never skips a second phase", async () => {
    const store = new MemoryStore();
    const now = 5_000_000;
    const T = { ...INSTANT_TIMING, revealMaxMs: 60_000, nightStepMaxMs: 60_000 }; // waits stay real
    const call = (a: any) => handle(a, store, now, T);
    const c = await call({ action: "create", token: "h", name: "Host" });
    if (!c.ok) throw new Error(c.error);
    const code = c.code;
    for (let i = 1; i < 4; i++) await call({ action: "join", code, token: `t${i}`, name: `P${i}` });
    await call({ action: "start", code, token: "h" });
    const first = await call({ action: "skip", code, token: "h", phase: "reveal", round: 0 });
    if (!first.ok) throw new Error(first.error);
    expect(first.view.phase).toBe("night");
    const second = await call({ action: "skip", code, token: "h", phase: "reveal", round: 0 });
    if (!second.ok) throw new Error(second.error);
    expect(second.view.phase).toBe("night");
    expect(second.view.night.step).toBe("mafia");
    expect((await call({ action: "skip", code, token: "t1", phase: "night", round: 1 })).ok).toBe(false); // not host
  });

  it("rejects bad codes and missing rooms", async () => {
    const store = new MemoryStore();
    expect((await handle({ action: "poll", code: "x" }, store)).ok).toBe(false);
    expect((await handle({ action: "poll", code: "ZZZZ" }, store)).ok).toBe(false);
  });
});
