// Rooms live in Redis for hours, so a deploy can load a room saved by OLDER code. These tests build rooms
// in each historical shape and check they still work. Add a new fixture whenever the saved shape changes.
import { describe, expect, it } from "vitest";
import { Game } from "../shared/game";
import { handle } from "../shared/handler";
import { INSTANT_TIMING, type RoomData } from "../shared/room";
import { NEWER_SETTINGS, NEWER_TOP_LEVEL, V1_SETTINGS, V2_SETTINGS, V3_SETTINGS, V4_SETTINGS, oldLobby } from "../shared/legacyFixtures";
import { MemoryStore } from "../shared/store";

async function storeWith(game: unknown) {
  const store = new MemoryStore();
  const room: RoomData = { code: "OLDX", game, key: "lobby", due: null, seen: { host: 1, g1: 1 }, updatedAt: 1 };
  await store.set("OLDX", room);
  return { store, call: (a: any) => handle(a, store, 5_000, INSTANT_TIMING) };
}

const EVERY_SETTING_CHANGE: Record<string, unknown>[] = [
  { mode: "phones" }, { mode: "remote" }, { mode: "table" },
  { voteStyle: "quick" }, { voteStyle: "trial" },
  { visibility: "open" }, { visibility: "ask" }, { visibility: "private" },
  { roomName: "Family night" },
  { useDoctor: false }, { useDetective: false }, { doctorSelfSave: false }, { doctorRepeatSave: false },
  { revealRoleOnDeath: true }, { deadSeeRoles: true },
  { language: "hi" }, { language: "ta" }, { useGodfather: true }, { useJester: true }, { useVigilante: true },
  { mafiaCount: 2 }, { mafiaCount: null }, { dayTimerSec: 60 }, { voteTimerSec: 30 }, { defenseSec: 45 },
];

describe("rooms saved by older versions", () => {
  const shapes: [string, Record<string, unknown>, boolean][] = [
    ["v1 (first deploy)", V1_SETTINGS, false],
    ["v2 (trial vote)", V2_SETTINGS, false],
    ["v3 (rooms directory)", V3_SETTINGS, true],
    ["v4 (narrator languages)", V4_SETTINGS, true],
  ];

  for (const [name, settings, newer] of shapes) {
    it(`${name}: every lobby setting can still be changed`, async () => {
      const { call } = await storeWith(oldLobby(settings, newer));
      for (const patch of EVERY_SETTING_CHANGE) {
        const r = await call({ action: "settings", code: "OLDX", token: "host", patch });
        expect(r.ok, `${name} ${JSON.stringify(patch)} -> ${!r.ok && r.error}`).toBe(true);
      }
    });

    it(`${name}: the room view has complete settings and the room can be played`, async () => {
      const { call } = await storeWith(oldLobby(settings, newer));
      const v = await call({ action: "poll", code: "OLDX", token: "host" });
      if (!v.ok) throw new Error(v.error);
      for (const key of ["mode", "voteStyle", "defenseSec", "visibility", "roomName", "dayTimerSec", "voteTimerSec", "language", "useGodfather", "useJester", "useVigilante"]) {
        expect(v.view.settings, `missing ${key}`).toHaveProperty(key);
      }
      expect(v.view.settings.language).toBe("en"); // settings saved before narrator languages existed
      expect(v.view.talk).toEqual([]);
      expect(v.view.pending).toEqual([]);
      await call({ action: "addBot", code: "OLDX", token: "host", count: 2 });
      expect((await call({ action: "start", code: "OLDX", token: "host" })).ok).toBe(true);
    });
  }

  it("a game already in progress under an older shape keeps working", async () => {
    // Build a real mid-game state with today's code, then strip everything newer code added.
    const g = new Game();
    ["Venkat", "Meena", "Priya", "Arun"].forEach((n, i) => g.addPlayer(i === 0 ? "host" : `p${i}`, n));
    g.updateSettings({ voteStyle: "quick" });
    g.start();
    g.players.forEach((p) => g.ackRole(p.id));
    g.beginNight();
    const json = JSON.parse(JSON.stringify(g.toJSON())) as Record<string, any>;
    for (const k of NEWER_TOP_LEVEL) delete json[k];
    for (const k of NEWER_SETTINGS) delete json.settings[k];
    for (const l of json.lines) delete l.cue;
    const { call } = await storeWith(json);
    const v = await call({ action: "poll", code: "OLDX", token: "host" });
    if (!v.ok) throw new Error(v.error);
    expect(v.view.phase).toBe("night");
    expect(v.view.settings.voteStyle).toBeDefined();
    // time passes: timers fire and the game moves on without errors
    const later = await handle({ action: "poll", code: "OLDX", token: "host" }, (await storeWith(json)).store, 999_999_999, INSTANT_TIMING);
    expect(later.ok).toBe(true);
  });
});
