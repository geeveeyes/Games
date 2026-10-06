// Behaviour requested in player feedback: two Detectives, a final vote that can name anyone, and seeing how everyone voted.
import { describe, expect, it } from "vitest";
import { Game, type Role, roleCounts } from "../shared/game";

function seeded(seed = 9) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
const NAMES = ["Host", "Ann", "Ben", "Cy", "Di", "Ed", "Fay", "Gus", "Hal"];
function game(n: number, settings: Record<string, unknown>, roles: Record<string, Role> = {}) {
  const g = new Game(seeded());
  for (let i = 0; i < n; i++) g.addPlayer(i === 0 ? "h" : `p${i}`, NAMES[i]);
  g.updateSettings(settings);
  g.start();
  for (const [id, r] of Object.entries(roles)) g.player(id)!.role = r;
  g.players.forEach((p) => g.ackRole(p.id));
  return g;
}
const through = (g: Game, step: string) => {
  while (g.step && (g.step as string) !== step) g.advanceNight(true);
};

describe("two Detectives", () => {
  it("only when there are enough villagers, and only if the host asks", () => {
    const base = { useDoctor: true, useDetective: true, mafiaCount: null as number | null };
    expect(roleCounts(8, { ...base, detectiveCount: 2 }).detective).toBe(2);
    expect(roleCounts(8, { ...base, detectiveCount: 1 }).detective).toBe(1);
    expect(roleCounts(6, { ...base, detectiveCount: 2 }).detective).toBe(1); // too few players for two
    expect(roleCounts(8, { ...base, useDetective: false, detectiveCount: 2 }).detective).toBe(0);
    const c = roleCounts(8, { ...base, detectiveCount: 2 });
    expect(c.mafia + c.godfather + c.doctor + c.detective + c.vigilante + c.jester + c.villager).toBe(8);
    expect(c.villager).toBeGreaterThanOrEqual(2);
  });

  it("each Detective investigates on their own, and the night waits for both", () => {
    const g = game(8, { voteStyle: "quick", detectiveCount: 2 }, { h: "mafia", p1: "mafia", p2: "detective", p3: "detective", p4: "doctor", p5: "villager", p6: "villager", p7: "villager" });
    g.beginNight();
    through(g, "detective");
    expect(g.actors().map((p) => p.id).sort()).toEqual(["p2", "p3"]);
    expect(g.nightAction("p2", "h").ok).toBe(true);
    expect(g.stepComplete()).toBe(false); // the other Detective has not chosen yet
    expect(g.nightAction("p2", "p5").ok).toBe(false); // one check each per night
    expect(g.nightAction("p3", "p5").ok).toBe(true);
    expect(g.stepComplete()).toBe(true);
    expect(g.notes.p2[0]).toMatchObject({ targetId: "h", isMafia: true });
    expect(g.notes.p3[0]).toMatchObject({ targetId: "p5", isMafia: false });
    // each sees only their own pick
    expect(g.viewFor("p2").night.yourPick).toBe("h");
    expect(g.viewFor("p3").night.yourPick).toBe("p5");
  });

  it("a Detective who is gone no longer holds up the night", () => {
    const g = game(8, { voteStyle: "quick", detectiveCount: 2 }, { h: "mafia", p1: "mafia", p2: "detective", p3: "detective", p4: "doctor", p5: "villager", p6: "villager", p7: "villager" });
    g.player("p3")!.alive = false;
    g.beginNight();
    through(g, "detective");
    g.nightAction("p2", "h");
    expect(g.stepComplete()).toBe(true);
  });

  it("keeps a Detective's pick when their seat moves to a new device", () => {
    const g = game(8, { voteStyle: "quick", detectiveCount: 2 }, { h: "mafia", p1: "mafia", p2: "detective", p3: "detective", p4: "doctor", p5: "villager", p6: "villager", p7: "villager" });
    g.beginNight();
    through(g, "detective");
    g.nightAction("p2", "h");
    g.reclaimSeat("p2", "new");
    expect(g.detectivePicks).toEqual({ new: "h" });
    expect(g.nightAction("new", "p5").ok).toBe(false); // already investigated tonight
  });
});

describe("final vote can name anyone (host option)", () => {
  const toFinal = (scope: "accused" | "anyone") => {
    const g = game(7, { voteStyle: "trial", finalVoteScope: scope }, { h: "mafia", p1: "villager", p2: "villager", p3: "villager", p4: "villager", p5: "villager", p6: "doctor" });
    g.beginNight();
    while (g.step) g.advanceNight(true);
    g.startDay();
    g.startVote();
    // first vote: p1 and p2 end up accused
    g.castVote("p3", "p1"); g.castVote("p4", "p1"); g.castVote("p5", "p2"); g.castVote("p6", "p2"); g.castVote("h", "p2");
    g.resolveVote();
    expect(g.phase).toBe("defense");
    g.advanceDefense();
    g.advanceDefense();
    expect(g.voteStage).toBe("final");
    return g;
  };

  it("by default only the accused can be named", () => {
    const g = toFinal("accused");
    expect(g.castVote("p3", "p4").ok).toBe(false);
    expect(g.castVote("p3", g.defendants[0]).ok).toBe(true);
  });
  it("on request, anyone alive can be named, and the biggest total goes out", () => {
    const g = toFinal("anyone");
    expect(g.castVote("p3", "p4").ok).toBe(true);
    g.castVote("p5", "p4"); g.castVote("p6", "p4"); g.castVote("h", "p3");
    g.castVote("p2", "p4"); g.castVote("p4", "skip"); g.castVote("p1", "skip");
    g.resolveVote();
    expect(g.player("p4")!.alive).toBe(false); // not one of the two accused, but the most voted
  });
  it("still cannot vote for yourself or a dead player", () => {
    const g = toFinal("anyone");
    expect(g.castVote("p3", "p3").ok).toBe(false);
    g.player("p6")!.alive = false;
    expect(g.castVote("p3", "p6").ok).toBe(false);
  });
});

describe("seeing how everyone voted", () => {
  it("after each vote everyone can see who voted for whom, until the next night", () => {
    const g = game(6, { voteStyle: "trial" }, { h: "mafia", p1: "villager", p2: "villager", p3: "villager", p4: "doctor", p5: "detective" });
    g.beginNight();
    while (g.step) g.advanceNight(true);
    g.startDay();
    g.startVote();
    expect(g.viewFor("p1").vote.reveal).toBeNull();
    g.castVote("p1", "p2"); g.castVote("p2", "p3"); g.castVote("p3", "p2"); g.castVote("p4", "p2"); g.castVote("p5", "skip"); g.castVote("h", "p2");
    g.resolveVote(); // first vote -> defense
    const poll = g.viewFor("p4").vote.reveal!;
    expect(poll.stage).toBe("poll");
    expect(poll.votes).toEqual({ p1: "p2", p2: "p3", p3: "p2", p4: "p2", p5: "skip", h: "p2" });
    expect(g.viewFor(null).vote.reveal).not.toBeNull(); // the TV can show it too
    g.advanceDefense();
    if (g.phase === "defense") g.advanceDefense();
    g.alive().forEach((p) => g.castVote(p.id, g.defendants.find((d) => d !== p.id) ?? "skip"));
    g.resolveVote();
    expect(g.viewFor("p1").vote.reveal!.stage).toBe("final");
    g.beginNight();
    expect(g.viewFor("p1").vote.reveal).toBeNull();
  });
});
