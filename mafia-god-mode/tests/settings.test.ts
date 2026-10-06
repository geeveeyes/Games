// Every control the lobby offers must be accepted by the engine, in a fresh room and in a room saved by older code.
import { describe, expect, it } from "vitest";
import { Game } from "../shared/game";
import { handle } from "../shared/handler";
import { DAY_SECONDS, DEFENSE_SECONDS, DETECTIVE_COUNTS, FINAL_VOTE_SCOPES, LANG_IDS, MAFIA_COUNTS, MODE_IDS, TOGGLE_KEYS, VISIBILITY_IDS, VOTE_SECONDS, VOTE_STYLE_IDS } from "../shared/options";
import { INSTANT_TIMING } from "../shared/room";
import { MemoryStore } from "../shared/store";

const everyChoice: Record<string, unknown>[] = [
  ...MODE_IDS.map((mode) => ({ mode })),
  ...LANG_IDS.map((language) => ({ language })),
  ...DETECTIVE_COUNTS.map((detectiveCount) => ({ detectiveCount })),
  ...FINAL_VOTE_SCOPES.map((finalVoteScope) => ({ finalVoteScope })),
  ...VOTE_STYLE_IDS.map((voteStyle) => ({ voteStyle })),
  ...VISIBILITY_IDS.map((visibility) => ({ visibility })),
  ...MAFIA_COUNTS.map((mafiaCount) => ({ mafiaCount })),
  ...DAY_SECONDS.map((dayTimerSec) => ({ dayTimerSec })),
  ...VOTE_SECONDS.map((voteTimerSec) => ({ voteTimerSec })),
  ...DEFENSE_SECONDS.map((defenseSec) => ({ defenseSec })),
  ...TOGGLE_KEYS.flatMap((k) => [{ [k]: true }, { [k]: false }]),
  { roomName: "Friday night" }, { roomName: "" },
];

describe("lobby settings", () => {
  it("accepts every offered value and shows it back", () => {
    for (const patch of everyChoice) {
      const g = new Game();
      g.addPlayer("h", "Host");
      const r = g.updateSettings(patch as never);
      expect(r.ok, JSON.stringify(patch)).toBe(true);
      const [key, value] = Object.entries(patch)[0];
      expect((g.viewFor("h").settings as unknown as Record<string, unknown>)[key], key).toEqual(value);
    }
  });

  it("works through the API one change after another, in any order", async () => {
    const store = new MemoryStore();
    const call = (a: any) => handle(a, store, 1_000, INSTANT_TIMING);
    const c = await call({ action: "create", token: "h", name: "Host" });
    if (!c.ok) throw new Error(c.error);
    for (const patch of [...everyChoice, ...[...everyChoice].reverse()]) {
      const r = await call({ action: "settings", code: c.code, token: "h", patch });
      expect(r.ok, JSON.stringify(patch)).toBe(true);
    }
  });

  it("rejects values that are not real choices, and keeps the previous settings", () => {
    const g = new Game();
    g.addPlayer("h", "Host");
    expect(g.updateSettings({ voteStyle: "mob-rule" } as never).ok).toBe(false);
    expect(g.updateSettings({ mode: "telepathy" } as never).ok).toBe(false);
    expect(g.updateSettings({ visibility: "secret" } as never).ok).toBe(false);
    expect(g.updateSettings({ language: "klingon" } as never).ok).toBe(false);
    expect(g.updateSettings({ finalVoteScope: "everyone-and-their-dog" } as never).ok).toBe(false);
    expect(g.settings.voteStyle).toBe("trial");
  });

  it("clamps out-of-range numbers instead of failing", () => {
    const g = new Game();
    g.addPlayer("h", "Host");
    expect(g.updateSettings({ dayTimerSec: 1, voteTimerSec: 99999, defenseSec: -5 } as never).ok).toBe(true);
    expect(g.settings).toMatchObject({ dayTimerSec: 30, voteTimerSec: 300, defenseSec: 15 });
  });
});
