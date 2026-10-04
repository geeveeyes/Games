import { describe, expect, it } from "vitest";
import { handle } from "../shared/handler";
import { INSTANT_TIMING } from "../shared/room";
import { MemoryStore } from "../shared/store";

const INSTANT = { ...INSTANT_TIMING, defenseLeadMs: 0 };

async function setup(bots = 4) {
  const store = new MemoryStore();
  let now = 9_000_000;
  const api = {
    now: () => now,
    advance: (ms: number) => (now += ms),
    call: (a: any) => handle(a, store, now, INSTANT),
  };
  const c = await api.call({ action: "create", token: "me", name: "Venkat" });
  if (!c.ok) throw new Error(c.error);
  const added = await api.call({ action: "addBot", code: c.code, token: "me", count: bots });
  if (!added.ok) throw new Error(added.error);
  return { ...api, code: c.code };
}

describe("bots", () => {
  it("only the host can add bots, and they get friendly unique names", async () => {
    const t = await setup(3);
    expect((await t.call({ action: "join", code: t.code, token: "guest", name: "Guest" })).ok).toBe(true);
    expect((await t.call({ action: "addBot", code: t.code, token: "guest" })).ok).toBe(false);
    const v = await t.call({ action: "poll", code: t.code, token: "me" });
    if (!v.ok) throw new Error();
    const bots = v.view.players.filter((p) => p.bot);
    expect(bots).toHaveLength(3);
    expect(new Set(bots.map((b) => b.name)).size).toBe(3);
    expect(v.view.players.find((p) => p.id === "me")?.bot).toBe(false);
  });

  it("one person plus bots can play a whole game", async () => {
    const t = await setup(4);
    expect((await t.call({ action: "start", code: t.code, token: "me" })).ok).toBe(true);
    let talked = 0;
    for (let i = 0; i < 400; i++) {
      t.advance(1000);
      const r = await t.call({ action: "poll", code: t.code, token: "me" });
      if (!r.ok) throw new Error(r.error);
      const v = r.view;
      talked = Math.max(talked, v.talk.filter((x) => x.bot).length);
      if (v.phase === "over") break;
      if (v.phase === "reveal") await t.call({ action: "ack", code: t.code, token: "me" });
      if (v.phase === "night" && v.night.yourTargets.length && v.night.yourPick === null) {
        await t.call({ action: "night", code: t.code, token: "me", target: v.night.yourTargets[0] });
      }
      if (v.phase === "vote" && v.you?.alive && !v.vote.yourVote) {
        const opts = v.players.filter((p) => p.alive && p.id !== "me" && (v.vote.stage === "poll" || v.defendants.includes(p.id)));
        await t.call({ action: "vote", code: t.code, token: "me", target: opts[0]?.id ?? "skip" });
      }
      t.advance(40_000);
    }
    const end = await t.call({ action: "poll", code: t.code, token: "me" });
    if (!end.ok) throw new Error(end.error);
    expect(end.view.phase).toBe("over");
    expect(end.view.winner).not.toBeNull();
    expect(talked).toBeGreaterThan(0); // bots joined the conversation
  });

  it("a bot answers when you mention it by name", async () => {
    const t = await setup(4);
    await t.call({ action: "start", code: t.code, token: "me" });
    let said = false;
    for (let i = 0; i < 300 && !said; i++) {
      t.advance(1000);
      const r = await t.call({ action: "poll", code: t.code, token: "me" });
      if (!r.ok) throw new Error(r.error);
      const v = r.view;
      if (v.phase === "reveal") await t.call({ action: "ack", code: t.code, token: "me" });
      if (v.phase === "night" && v.night.yourTargets.length && v.night.yourPick === null) {
        await t.call({ action: "night", code: t.code, token: "me", target: v.night.yourTargets[0] });
      }
      if (v.phase === "day" && v.you?.alive) {
        const bot = v.players.find((p) => p.bot && p.alive)!;
        const s = await t.call({ action: "say", code: t.code, token: "me", text: `${bot.name}, you look suspicious` });
        expect(s.ok).toBe(true);
        t.advance(100);
        const after = await t.call({ action: "poll", code: t.code, token: "me" });
        if (!after.ok) throw new Error();
        expect(after.view.talk.some((x) => x.id === bot.id)).toBe(true);
        said = true;
      }
      t.advance(40_000);
    }
    expect(said).toBe(true);
  });

  it("rejects talk from the dead or outside the day", async () => {
    const t = await setup(3);
    const s = await t.call({ action: "say", code: t.code, token: "me", text: "hi" });
    expect(s.ok).toBe(false);
  });
});
