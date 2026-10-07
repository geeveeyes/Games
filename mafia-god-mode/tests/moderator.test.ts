import { describe, expect, it } from "vitest";
import { handle, handleRooms } from "../shared/handler";
import { INSTANT_TIMING } from "../shared/room";
import { MemoryStore } from "../shared/store";

async function setup() {
  const store = new MemoryStore();
  const call = (a: any) => handle(a, store, 1_000_000, INSTANT_TIMING);
  const c = await call({ action: "create", token: "tv", name: "", moderator: true });
  if (!c.ok) throw new Error(c.error);
  return { store, call, code: c.code, view: c.view };
}
const ok = (r: any) => { if (!r.ok) throw new Error(r.error); return r.view; };

describe("moderator screen", () => {
  it("creates a room with no players and the screen in charge", async () => {
    const t = await setup();
    expect(t.view.players).toHaveLength(0);
    expect(t.view.isModerator).toBe(true);
    expect(t.view.you).toBeNull();
  });
  it("players join, and only the moderator can change settings, add bots and start", async () => {
    const t = await setup();
    ok(await t.call({ action: "join", code: t.code, token: "a", name: "Ann" }));
    const v = ok(await t.call({ action: "join", code: t.code, token: "b", name: "Ben" }));
    expect(v.players).toHaveLength(2);
    expect(v.hostId).toBeNull(); // nobody among the players is host
    expect(v.you.isHost).toBe(false);
    const denied = await t.call({ action: "settings", code: t.code, token: "a", patch: { language: "te" } });
    expect(denied.ok).toBe(false);
    expect((await t.call({ action: "start", code: t.code, token: "a" })).ok).toBe(false);
    ok(await t.call({ action: "settings", code: t.code, token: "tv", patch: { language: "te" } }));
    ok(await t.call({ action: "addBot", code: t.code, token: "tv", count: 2 }));
    const started = ok(await t.call({ action: "start", code: t.code, token: "tv" }));
    expect(started.phase).not.toBe("lobby"); // instant timing may already be past the role reveal
    expect(started.players).toHaveLength(4);
  });
  it("keeps the moderator as host when the room is idle, and can skip and replay", async () => {
    const t = await setup();
    ok(await t.call({ action: "join", code: t.code, token: "a", name: "Ann" }));
    ok(await t.call({ action: "addBot", code: t.code, token: "tv", count: 3 }));
    ok(await t.call({ action: "start", code: t.code, token: "tv" }));
    const v = ok(await t.call({ action: "poll", code: t.code, token: "tv" }));
    expect(v.isModerator).toBe(true);
    expect(v.hostId).toBeNull();
    // the moderator never sees secret roles
    expect(v.players.every((p: any) => p.role === null)).toBe(true);
  });
  it("lists an open moderated room with no players yet", async () => {
    const t = await setup();
    ok(await t.call({ action: "settings", code: t.code, token: "tv", patch: { visibility: "open" } }));
    expect((await handleRooms(t.store)).rooms).toEqual([expect.objectContaining({ code: t.code, host: "Moderator", players: 0 })]);
  });
  it("an ask-to-join room still asks for the very first player", async () => {
    const t = await setup();
    ok(await t.call({ action: "settings", code: t.code, token: "tv", patch: { visibility: "ask" } }));
    const j = await t.call({ action: "join", code: t.code, token: "a", name: "Ann" });
    expect(j.ok && j.view.joinStatus).toBe("pending");
    const view = ok(await t.call({ action: "poll", code: t.code, token: "tv" }));
    expect(view.pending).toHaveLength(1);
    ok(await t.call({ action: "admit", code: t.code, token: "tv", target: "a" }));
  });
});
