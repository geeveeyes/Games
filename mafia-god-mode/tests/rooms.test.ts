import { describe, expect, it } from "vitest";
import { handle, handleRooms } from "../shared/handler";
import { INSTANT_TIMING } from "../shared/room";
import { MemoryStore } from "../shared/store";

async function setup() {
  const store = new MemoryStore();
  const now = 1_000_000;
  const call = (a: any) => handle(a, store, now, INSTANT_TIMING);
  const c = await call({ action: "create", token: "host", name: "Venkat" });
  if (!c.ok) throw new Error(c.error);
  return { store, call, code: c.code };
}

describe("open rooms directory", () => {
  it("private rooms are not listed by default", async () => {
    const t = await setup();
    expect((await handleRooms(t.store)).rooms).toEqual([]);
    const v = await t.call({ action: "poll", code: t.code, token: "host" });
    if (!v.ok) throw new Error();
    expect(v.view.settings.visibility).toBe("private");
    expect(v.view.settings.roomName).toBe("Venkat's game");
  });

  it("an open room is listed and anyone can join in one step", async () => {
    const t = await setup();
    await t.call({ action: "settings", code: t.code, token: "host", patch: { visibility: "open", roomName: "Family night" } });
    const { rooms } = await handleRooms(t.store);
    expect(rooms).toEqual([expect.objectContaining({ code: t.code, name: "Family night", host: "Venkat", players: 1, visibility: "open" })]);
    const j = await t.call({ action: "join", code: t.code, token: "guest", name: "Meena" });
    if (!j.ok) throw new Error(j.error);
    expect(j.view.you?.name).toBe("Meena");
    expect((await handleRooms(t.store)).rooms[0].players).toBe(2);
  });

  it("an 'ask to join' room needs the host to admit each person", async () => {
    const t = await setup();
    await t.call({ action: "settings", code: t.code, token: "host", patch: { visibility: "ask" } });
    const j = await t.call({ action: "join", code: t.code, token: "guest", name: "Meena" });
    if (!j.ok) throw new Error(j.error);
    expect(j.view.you).toBeNull();
    expect(j.view.joinStatus).toBe("pending");
    const host = await t.call({ action: "poll", code: t.code, token: "host" });
    if (!host.ok) throw new Error();
    expect(host.view.pending).toEqual([{ id: "guest", name: "Meena" }]);
    // the guest cannot approve themselves
    expect((await t.call({ action: "admit", code: t.code, token: "guest", target: "guest" })).ok).toBe(false);
    const a = await t.call({ action: "admit", code: t.code, token: "host", target: "guest" });
    expect(a.ok).toBe(true);
    const g = await t.call({ action: "poll", code: t.code, token: "guest" });
    if (!g.ok) throw new Error();
    expect(g.view.you?.name).toBe("Meena");
  });

  it("declined people see it, and a removed person cannot return", async () => {
    const t = await setup();
    await t.call({ action: "settings", code: t.code, token: "host", patch: { visibility: "ask" } });
    await t.call({ action: "join", code: t.code, token: "g1", name: "Sam" });
    await t.call({ action: "decline", code: t.code, token: "host", target: "g1" });
    const g1 = await t.call({ action: "poll", code: t.code, token: "g1" });
    if (!g1.ok) throw new Error();
    expect(g1.view.joinStatus).toBe("declined");

    await t.call({ action: "settings", code: t.code, token: "host", patch: { visibility: "open" } });
    await t.call({ action: "join", code: t.code, token: "g2", name: "Troll" });
    expect((await t.call({ action: "kick", code: t.code, token: "host", target: "g2" })).ok).toBe(true);
    const again = await t.call({ action: "join", code: t.code, token: "g2", name: "Troll" });
    expect(again.ok).toBe(false);
    expect((await t.call({ action: "kick", code: t.code, token: "host", target: "host" })).ok).toBe(false);
  });

  it("a room leaves the directory when the game starts or it turns private", async () => {
    const t = await setup();
    await t.call({ action: "settings", code: t.code, token: "host", patch: { visibility: "open" } });
    expect((await handleRooms(t.store)).rooms).toHaveLength(1);
    await t.call({ action: "settings", code: t.code, token: "host", patch: { visibility: "private" } });
    expect((await handleRooms(t.store)).rooms).toHaveLength(0);
    await t.call({ action: "settings", code: t.code, token: "host", patch: { visibility: "open" } });
    await t.call({ action: "addBot", code: t.code, token: "host", count: 3 });
    await t.call({ action: "start", code: t.code, token: "host" });
    expect((await handleRooms(t.store)).rooms).toHaveLength(0);
  });

  it("only the host can change visibility", async () => {
    const t = await setup();
    await t.call({ action: "join", code: t.code, token: "guest", name: "Meena" });
    expect((await t.call({ action: "settings", code: t.code, token: "guest", patch: { visibility: "open" } })).ok).toBe(false);
  });
});
