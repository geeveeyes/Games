import { describe, expect, it } from "vitest";
import { Game } from "../shared/game";
import { handle } from "../shared/handler";
import { AWAY_MS, INSTANT_TIMING } from "../shared/room";
import { MemoryStore } from "../shared/store";

async function startedGame() {
  const store = new MemoryStore();
  let now = 1_000_000;
  const call = (a: any) => handle(a, store, now, INSTANT_TIMING);
  const c = await call({ action: "create", token: "host", name: "Venkat" });
  if (!c.ok) throw new Error(c.error);
  await call({ action: "join", code: c.code, token: "t1", name: "Meena" });
  await call({ action: "addBot", code: c.code, token: "host", count: 2 });
  expect((await call({ action: "start", code: c.code, token: "host" })).ok).toBe(true);
  return { call, code: c.code, advance: (ms: number) => (now += ms), now: () => now };
}

describe("host handover", () => {
  it("passes the host role on when the host goes away", async () => {
    const t = await startedGame();
    t.advance(AWAY_MS + 5_000);
    // Only Meena keeps playing; the host's phone is off.
    const r = await t.call({ action: "poll", code: t.code, token: "t1" });
    if (!r.ok) throw new Error(r.error);
    // the poll refreshes Meena's heartbeat; the next one runs the handover
    t.advance(25_000);
    const r2 = await t.call({ action: "poll", code: t.code, token: "t1" });
    if (!r2.ok) throw new Error(r2.error);
    expect(r2.view.hostId).toBe("t1");
    expect(r2.view.you?.isHost).toBe(true);
  });

  it("does not move the host while they are still around", async () => {
    const t = await startedGame();
    for (let i = 0; i < 6; i++) {
      t.advance(25_000);
      await t.call({ action: "poll", code: t.code, token: "host" });
      await t.call({ action: "poll", code: t.code, token: "t1" });
    }
    const r = await t.call({ action: "poll", code: t.code, token: "t1" });
    if (!r.ok) throw new Error(r.error);
    expect(r.view.hostId).toBe("host");
  });

  it("the host can hand over manually, but only to a person", async () => {
    const t = await startedGame();
    expect((await t.call({ action: "makeHost", code: t.code, token: "t1", target: "t1" })).ok).toBe(false); // not the host
    expect((await t.call({ action: "makeHost", code: t.code, token: "host", target: "bot-maya" })).ok).toBe(false);
    expect((await t.call({ action: "makeHost", code: t.code, token: "host", target: "t1" })).ok).toBe(true);
    const r = await t.call({ action: "poll", code: t.code, token: "t1" });
    if (!r.ok) throw new Error();
    expect(r.view.hostId).toBe("t1");
  });
});

describe("taking your seat back", () => {
  it("a returning person with a new device gets their seat, role and history back", async () => {
    const t = await startedGame();
    const before = await t.call({ action: "poll", code: t.code, token: "t1" });
    if (!before.ok) throw new Error();
    const role = before.view.you!.role;
    t.advance(AWAY_MS + 1_000); // the old phone has been silent for a while
    const back = await t.call({ action: "join", code: t.code, token: "new-phone", name: "meena" }); // any capitalisation
    if (!back.ok) throw new Error(back.error);
    expect(back.view.you?.name).toBe("Meena");
    expect(back.view.you?.role).toBe(role);
    // the old token no longer controls the seat
    const old = await t.call({ action: "poll", code: t.code, token: "t1" });
    if (!old.ok) throw new Error();
    expect(old.view.you).toBeNull();
  });

  it("cannot take a seat that is still in use", async () => {
    const t = await startedGame();
    await t.call({ action: "poll", code: t.code, token: "t1" });
    t.advance(5_000);
    const r = await t.call({ action: "join", code: t.code, token: "thief", name: "Meena" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/still connected/);
  });

  it("strangers are still turned away once the game has started", async () => {
    const t = await startedGame();
    const r = await t.call({ action: "join", code: t.code, token: "x", name: "Stranger" });
    expect(r.ok).toBe(false);
    expect(!r.ok && r.error).toMatch(/already started/);
  });

  it("moves votes, picks and chat to the new token (engine level)", () => {
    const g = new Game();
    ["h", "a", "b", "c"].forEach((id, i) => g.addPlayer(id, ["Host", "Ann", "Ben", "Cy"][i]));
    g.updateSettings({ voteStyle: "quick" });
    g.start();
    g.players.forEach((p) => g.ackRole(p.id));
    g.beginNight();
    g.phase = "vote";
    g.voteStage = "final";
    g.votes = { a: "b", b: "a" };
    g.talk.push({ seq: 1, id: "a", name: "Ann", text: "hi", bot: false });
    g.notes = { a: [{ night: 1, targetId: "b", isMafia: false }] };
    expect(g.reclaimSeat("a", "a2").ok).toBe(true);
    expect(g.votes).toEqual({ a2: "b", b: "a2" });
    expect(g.talk[0].id).toBe("a2");
    expect(Object.keys(g.notes)).toEqual(["a2"]);
    expect(g.player("a")).toBeUndefined();
    expect(g.reclaimSeat("a2", "h").ok).toBe(false); // new id already a player
  });
});
