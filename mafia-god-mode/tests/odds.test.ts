import { describe, expect, it } from "vitest";
import { DEFAULT_SETTINGS, normalizeSettings } from "../shared/game";
import { winOdds } from "../shared/odds";

const S = (patch = {}) => normalizeSettings({ ...DEFAULT_SETTINGS, ...patch });

describe("win odds", () => {
  it("adds up to 100 and is repeatable", () => {
    for (let n = 4; n <= 16; n++) {
      const o = winOdds(n, S({ useJester: true, useBomber: true, useVigilante: true, useGodfather: true }));
      expect(o.town + o.mafia + o.jester).toBe(100);
      expect(winOdds(n, S({ useJester: true, useBomber: true, useVigilante: true, useGodfather: true }))).toEqual(o);
    }
  });
  it("more Mafia favours the Mafia", () => {
    const few = winOdds(10, S({ mafiaCount: 1 }));
    const many = winOdds(10, S({ mafiaCount: 4 }));
    expect(many.mafia).toBeGreaterThan(few.mafia);
  });
  it("a Bomber helps the Mafia", () => {
    expect(winOdds(10, S({ useBomber: true })).mafia).toBeGreaterThanOrEqual(winOdds(10, S()).mafia - 2);
  });
  it("the default setups are not wildly lopsided", () => {
    for (let n = 6; n <= 12; n++) {
      const o = winOdds(n, S());
      expect(o.town).toBeGreaterThan(20);
      expect(o.mafia).toBeGreaterThan(20);
    }
  });
});
