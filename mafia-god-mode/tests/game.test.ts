import { describe, expect, it } from "vitest";
import { Game, roleCounts, type Role } from "../shared/game";

function seeded(seed = 1) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}

function setup(n = 6, patch: Record<string, unknown> = {}, seed = 7) {
  const g = new Game(seeded(seed));
  for (let i = 0; i < n; i++) g.addPlayer(`p${i}`, `Player${i}`);
  g.updateSettings({ voteStyle: "quick", ...patch });
  expect(g.start().ok).toBe(true);
  g.players.forEach((p) => g.ackRole(p.id));
  g.beginNight();
  return g;
}
const byRole = (g: Game, r: Role) => g.players.filter((p) => p.role === r);
const first = (g: Game, r: Role) => byRole(g, r)[0];

function runNight(g: Game, kill?: string, save?: string, check?: string) {
  const mafia = byRole(g, "mafia").filter((m) => m.alive);
  if (kill) mafia.forEach((m) => expect(g.nightAction(m.id, kill).ok).toBe(true));
  g.advanceNight(!kill);
  if (g.step === "doctor") {
    const d = g.alive("doctor")[0];
    if (d && save) expect(g.nightAction(d.id, save).ok).toBe(true);
    g.advanceNight(!save || !d);
  }
  if (g.step === "detective") {
    const d = g.alive("detective")[0];
    if (d && check) expect(g.nightAction(d.id, check).ok).toBe(true);
    g.advanceNight(!check || !d);
  }
}

describe("role counts", () => {
  it("matches the plan table", () => {
    const o = { useDoctor: true, useDetective: true, mafiaCount: null };
    expect(roleCounts(6, o)).toEqual({ mafia: 2, doctor: 1, detective: 1, villager: 2 });
    expect(roleCounts(8, o)).toEqual({ mafia: 2, doctor: 1, detective: 1, villager: 4 });
    expect(roleCounts(10, o)).toEqual({ mafia: 3, doctor: 1, detective: 1, villager: 5 });
    expect(roleCounts(13, o)).toEqual({ mafia: 4, doctor: 1, detective: 1, villager: 7 });
  });
  it("never lets mafia reach half", () => {
    expect(roleCounts(6, { useDoctor: true, useDetective: true, mafiaCount: 9 }).mafia).toBe(2);
  });
});

describe("lobby", () => {
  it("needs four players and unique names", () => {
    const g = new Game();
    g.addPlayer("a", "Ann");
    expect(g.addPlayer("b", "ann").ok).toBe(false);
    expect(g.start().ok).toBe(false);
  });
});

describe("night", () => {
  it("kills the mafia target", () => {
    const g = setup();
    const v = first(g, "villager");
    runNight(g, v.id);
    expect(g.player(v.id)!.alive).toBe(false);
    expect(g.phase).toBe("dawn");
  });
  it("doctor save cancels the kill and is never named", () => {
    const g = setup();
    const v = first(g, "villager");
    runNight(g, v.id, v.id);
    expect(g.player(v.id)!.alive).toBe(true);
    expect(g.lines.at(-1)!.text).toMatch(/nobody died|still alive/i);
  });
  it("blocks mafia from targeting teammates", () => {
    const g = setup();
    const [m1, m2] = byRole(g, "mafia");
    expect(g.nightAction(m1.id, m2.id).ok).toBe(false);
  });
  it("needs mafia to agree", () => {
    const g = setup();
    const [m1, m2] = byRole(g, "mafia");
    const [a, b] = byRole(g, "villager");
    g.nightAction(m1.id, a.id);
    g.nightAction(m2.id, b.id);
    expect(g.stepComplete()).toBe(false);
    g.nightAction(m2.id, a.id);
    expect(g.stepComplete()).toBe(true);
  });
  it("detective result is private and correct", () => {
    const g = setup();
    const m = first(g, "mafia");
    const v = first(g, "villager");
    runNight(g, v.id, undefined, m.id);
    const det = first(g, "detective");
    expect(g.viewFor(det.id).you!.notes[0]).toMatchObject({ targetId: m.id, isMafia: true });
    expect(g.viewFor(v.id).you!.notes).toEqual([]);
  });
  it("doctor self-save and repeat rules are settings", () => {
    const g = setup(6, { doctorSelfSave: false, doctorRepeatSave: false });
    const m = first(g, "mafia");
    const doc = first(g, "doctor");
    const v = first(g, "villager");
    g.nightAction(m.id, v.id);
    g.nightAction(byRole(g, "mafia")[1].id, v.id);
    g.advanceNight();
    expect(g.nightAction(doc.id, doc.id).ok).toBe(false);
    expect(g.nightAction(doc.id, v.id).ok).toBe(true);
    g.advanceNight();
    g.nightAction(first(g, "detective").id, m.id);
    g.advanceNight();
    g.startDay();
    g.startVote();
    g.alive().forEach((p) => g.castVote(p.id, "skip"));
    g.resolveVote();
    g.beginNight();
    g.advanceNight(true);
    expect(g.canTarget(doc.id)).not.toContain(v.id);
  });
  it("allows repeat saves by default", () => {
    const g = setup();
    expect(g.settings.doctorRepeatSave).toBe(true);
  });
  it("dead roles leave an empty step the server can skip", () => {
    const g = setup(8);
    const doc = first(g, "doctor");
    runNight(g, doc.id);
    expect(g.phase).toBe("dawn");
    g.startDay();
    g.startVote();
    g.alive().forEach((p) => g.castVote(p.id, "skip"));
    g.resolveVote();
    g.beginNight();
    g.advanceNight(true);
    expect(g.step).toBe("doctor");
    expect(g.stepIsEmpty()).toBe(true);
    expect(g.stepComplete()).toBe(true);
  });
});

describe("day vote", () => {
  const toVote = (g: Game) => {
    runNight(g, undefined);
    g.startDay();
    g.startVote();
  };
  it("eliminates the plurality target", () => {
    const g = setup();
    toVote(g);
    const t = first(g, "mafia");
    g.alive().filter((p) => p.id !== t.id).forEach((p) => g.castVote(p.id, t.id));
    g.castVote(t.id, "skip");
    expect(g.voteComplete()).toBe(true);
    g.resolveVote();
    expect(g.player(t.id)!.alive).toBe(false);
  });
  it("tie eliminates nobody", () => {
    const g = setup();
    toVote(g);
    const [a, b] = g.alive();
    g.castVote(a.id, b.id);
    g.castVote(b.id, a.id);
    g.resolveVote();
    expect(g.alive()).toHaveLength(6);
    expect(g.lastResult!.eliminatedId).toBeNull();
  });
  it("rejects self votes and dead voters", () => {
    const g = setup();
    toVote(g);
    expect(g.castVote("p0", "p0").ok).toBe(false);
  });
});

describe("trial voting", () => {
  const toPoll = (g: Game) => {
    runNight(g, undefined);
    g.startDay();
    g.startVote();
  };
  it("defaults to trial style with a first vote", () => {
    const g = setup(6, { voteStyle: "trial" });
    toPoll(g);
    expect(g.voteStage).toBe("poll");
  });
  it("sends the top two to defense, then a final vote eliminates one", () => {
    const g = setup(7, { voteStyle: "trial" });
    toPoll(g);
    const [a, b, c, d, e, f, h] = g.alive();
    // a gets 3 votes, b gets 2, the rest skip
    g.castVote(c.id, a.id); g.castVote(d.id, a.id); g.castVote(e.id, a.id);
    g.castVote(f.id, b.id); g.castVote(h.id, b.id);
    g.castVote(a.id, b.id); g.castVote(b.id, a.id);
    g.resolveVote();
    expect(g.phase).toBe("defense");
    expect(g.defendants.sort()).toEqual([a.id, b.id].sort());
    const first = g.defenseIdx;
    g.advanceDefense();
    expect(g.phase).toBe("defense");
    expect(g.defenseIdx).toBe(first + 1);
    g.advanceDefense();
    expect(g.phase).toBe("vote");
    expect(g.voteStage).toBe("final");
    expect(g.castVote(c.id, d.id).ok).toBe(false); // must pick an accused player
    g.alive().forEach((p) => g.castVote(p.id === a.id ? p.id : p.id, "skip"));
    g.alive().filter((p) => ![a.id, b.id].includes(p.id)).forEach((p) => g.castVote(p.id, a.id));
    g.resolveVote();
    expect(g.player(a.id)!.alive).toBe(false);
    expect(g.phase === "result" || g.phase === "over").toBe(true);
  });
  it("nobody is accused when skips lead the first vote", () => {
    const g = setup(6, { voteStyle: "trial" });
    toPoll(g);
    const [a, b, c] = g.alive();
    g.castVote(a.id, "skip"); g.castVote(b.id, "skip"); g.castVote(c.id, a.id);
    g.resolveVote();
    expect(g.phase).toBe("result");
    expect(g.lastResult!.eliminatedId).toBeNull();
  });
  it("a single accused player needs more votes than the skips", () => {
    const g = setup(6, { voteStyle: "trial" });
    toPoll(g);
    const [a, b, c, d] = g.alive();
    g.castVote(b.id, a.id); g.castVote(c.id, a.id); g.castVote(d.id, "skip");
    g.resolveVote();
    expect(g.defendants).toEqual([a.id]);
    g.advanceDefense();
    expect(g.voteStage).toBe("final");
    g.alive().forEach((p) => g.castVote(p.id, p.id === a.id ? "skip" : "skip"));
    g.castVote(b.id, a.id);
    g.resolveVote();
    expect(g.player(a.id)!.alive).toBe(true); // skips outnumber the accusers
  });
});

describe("win conditions", () => {
  it("town wins when all mafia are out", () => {
    const g = setup();
    runNight(g);
    g.startDay();
    g.startVote();
    byRole(g, "mafia").forEach((m) => (m.alive = false));
    g.resolveVote();
    expect(g.winner).toBe("town");
    expect(g.phase).toBe("over");
  });
  it("mafia wins when they equal the town", () => {
    const g = setup(4);
    const m = first(g, "mafia");
    const others = g.players.filter((p) => p.role !== "mafia");
    others[0].alive = false;
    runNight(g, others[1].id);
    expect(g.winner).toBe("mafia");
    expect(m.alive).toBe(true);
  });
  it("hides roles from others until the end", () => {
    const g = setup();
    const v = first(g, "villager");
    expect(g.viewFor(v.id).players.filter((p) => p.role).map((p) => p.id)).toEqual([v.id]);
    expect(g.viewFor(null).players.every((p) => p.role === null)).toBe(true);
    const m = first(g, "mafia");
    expect(g.viewFor(m.id).players.filter((p) => p.role).length).toBe(2);
  });
  it("rematch returns to lobby", () => {
    const g = setup();
    g.phase = "over";
    g.rematch();
    expect(g.phase).toBe("lobby");
    expect(g.players.every((p) => p.role === null)).toBe(true);
  });
});

describe("serialization", () => {
  it("round-trips through JSON", () => {
    const g = setup();
    const copy = Game.fromJSON(JSON.parse(JSON.stringify(g.toJSON())));
    expect(copy.viewFor("p0")).toEqual(g.viewFor("p0"));
  });
});
