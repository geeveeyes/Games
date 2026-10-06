// The game must not move on while the narrator is still talking (feedback: "narration and time cut abruptly").
import { describe, expect, it } from "vitest";
import { handle } from "../shared/handler";
import { INSTANT_TIMING } from "../shared/room";
import { estimateSpeechMs, segmentsOf } from "../shared/script";
import { MemoryStore } from "../shared/store";

describe("speech estimate", () => {
  it("grows with the text and counts pauses", () => {
    const short = estimateSpeechMs("Time is up.");
    const long = estimateSpeechMs("Night falls on the village. || Everyone... close your eyes. | Keep them closed. | No peeking.");
    expect(short).toBeGreaterThan(500);
    expect(long).toBeGreaterThan(short * 3);
    expect(estimateSpeechMs("A. || B.")).toBeGreaterThan(estimateSpeechMs("A. B."));
    expect(estimateSpeechMs("नमस्ते दोस्तों", "hi")).toBeGreaterThan(estimateSpeechMs("ab", "en"));
    expect(segmentsOf("A. | B.").length).toBe(2);
  });
});

describe("the game waits for the narrator", () => {
  it("each night line has time to be spoken before the next arrives", async () => {
    const store = new MemoryStore();
    let now = 3_000_000;
    // Zero waits everywhere, so the only thing holding the game back is the narration itself.
    const timing = { ...INSTANT_TIMING, speechPacing: true, nightStepMaxMs: 60_000, revealMaxMs: 60_000 };
    const call = (a: any) => handle(a, store, now, timing);
    const c = await call({ action: "create", token: "me", name: "Venkat" });
    if (!c.ok) throw new Error(c.error);
    await call({ action: "settings", code: c.code, token: "me", patch: { useGodfather: true, useVigilante: true, voteStyle: "quick" } });
    await call({ action: "addBot", code: c.code, token: "me", count: 7 });
    await call({ action: "start", code: c.code, token: "me" });

    const seenAt = new Map<number, { at: number; text: string; cue: string | null; lang?: string }>();
    for (let i = 0; i < 400; i++) {
      const r = await call({ action: "poll", code: c.code, token: "me" });
      if (!r.ok) throw new Error(r.error);
      const v = r.view;
      for (const l of v.lines) if (!seenAt.has(l.seq)) seenAt.set(l.seq, { at: now, text: l.text, cue: l.cue, lang: l.lang });
      if (v.phase === "over") break;
      let acted = false;
      if (v.phase === "reveal") { await call({ action: "ack", code: c.code, token: "me" }); acted = true; }
      if (v.phase === "night" && v.you?.alive && v.night.yourPick === null && v.night.yourTargets.length) {
        acted = true;
        await call({ action: "night", code: c.code, token: "me", target: v.night.step === "vigilante" ? "skip" : v.night.yourTargets[0] });
      }
      if (v.phase === "vote" && v.you?.alive && !v.vote.yourVote) { acted = true; await call({ action: "vote", code: c.code, token: "me", target: "skip" }); }
      // move time to the next deadline (not past it), the way a real clock would
      now = acted ? now + 200 : Math.max(now + 200, (v.due ?? now + 1000));
    }

    // Lines created at the same moment (the night intro and the first step, say) form one group: the narrator speaks
    // them one after another. The game must then leave enough time for the whole group before the next one appears.
    const lines = [...seenAt.entries()].sort((a, b) => a[0] - b[0]).map(([, l]) => l);
    const groups: { at: number; ms: number; cues: (string | null)[] }[] = [];
    for (const l of lines) {
      const g = groups.at(-1);
      const ms = estimateSpeechMs(l.text, (l.lang as any) ?? "en");
      if (g && g.at === l.at) { g.ms += ms; g.cues.push(l.cue); }
      else groups.push({ at: l.at, ms, cues: [l.cue] });
    }
    const nightish = new Set(["night", "mafia", "doctor", "detective", "vigilante", "dawn", "dawn-death", "deal"]);
    let checked = 0;
    for (let i = 0; i < groups.length - 1; i++) {
      const cur = groups[i], next = groups[i + 1];
      if (!cur.cues.every((c) => c && nightish.has(c)) || !next.cues.every((c) => c && nightish.has(c))) continue;
      const gap = next.at - cur.at;
      expect(gap, `a group needing ${cur.ms} ms was followed after only ${gap} ms (cues ${cur.cues.join(",")})`).toBeGreaterThanOrEqual(cur.ms - 400);
      checked++;
    }
    expect(checked).toBeGreaterThan(5);
  }, 60_000);
});
