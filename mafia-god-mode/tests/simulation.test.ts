// Plays many whole games (one person plus bots) with every role switched on, in every language, to find games
// that stall, crash or end without a valid winner.
import { describe, expect, it } from "vitest";
import { handle } from "../shared/handler";
import { INSTANT_TIMING } from "../shared/room";
import { MemoryStore } from "../shared/store";

async function play(players: number, settings: Record<string, unknown>) {
  const store = new MemoryStore();
  let now = 5_000_000;
  // Bots answer instantly, but the one person needs the real waits (an instant night step would expire before they pick).
  const timing = { ...INSTANT_TIMING, nightStepMaxMs: 60_000, revealMaxMs: 60_000 };
  const call = (a: any) => handle(a, store, now, timing);
  const c = await call({ action: "create", token: "me", name: "Venkat" });
  if (!c.ok) throw new Error(c.error);
  await call({ action: "settings", code: c.code, token: "me", patch: settings });
  await call({ action: "addBot", code: c.code, token: "me", count: players - 1 });
  const s = await call({ action: "start", code: c.code, token: "me" });
  if (!s.ok) throw new Error(s.error);
  let last: any = null;
  for (let i = 0; i < 400; i++) {
    now += 1000;
    const r = await call({ action: "poll", code: c.code, token: "me" });
    if (!r.ok) throw new Error(r.error);
    const v = r.view;
    last = v;
    if (v.phase === "over") return v;
    let acted = false;
    if (v.phase === "reveal") { await call({ action: "ack", code: c.code, token: "me" }); acted = true; }
    if (v.phase === "night" && v.you?.alive && v.night.yourPick === null) {
      acted = true;
      if (v.night.step === "vigilante") await call({ action: "night", code: c.code, token: "me", target: "skip" });
      else if (v.night.yourTargets.length) await call({ action: "night", code: c.code, token: "me", target: v.night.yourTargets[0] });
      else acted = false;
    }
    if (v.phase === "vote" && v.you?.alive && !v.vote.yourVote) {
      const options = v.players.filter((p: any) => p.alive && p.id !== "me" && (v.vote.stage === "poll" || v.defendants.includes(p.id)));
      acted = true;
      await call({ action: "vote", code: c.code, token: "me", target: options[0]?.id ?? "skip" });
    }
    if (!acted) now += 70_000; // nothing for the person to do: jump past the timers
  }
  throw new Error(`game did not finish; last phase ${last?.phase}, round ${last?.round}`);
}

describe("whole games", () => {
  const all = { useDoctor: true, useDetective: true, useGodfather: true, useJester: true, useVigilante: true, useBomber: true, revealRoleOnDeath: true };
  for (const lang of ["en", "hi", "ta"]) {
    for (const [n, style] of [[5, "quick"], [6, "trial"], [8, "trial"], [10, "quick"], [10, "trial"]] as const) {
      it(`${n} players, ${style} vote, ${lang}: finishes with a winner`, async () => {
        for (let round = 0; round < 3; round++) {
          const v = await play(n, { ...all, voteStyle: style, language: lang });
          expect(["town", "mafia", "jester"]).toContain(v.winner);
          expect(v.players.every((p: any) => p.role)).toBe(true); // everyone's role is revealed at the end
          for (const l of v.lines) {
            expect(l.text).not.toMatch(/\{\w+\}|undefined|NaN/);
            expect(l.lang).toBe(lang);
          }
        }
      }, 60_000);
    }
  }
});
