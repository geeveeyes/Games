import { describe, expect, it } from "vitest";
import { Game, type Role, isMafiaRole } from "../shared/game";

function seeded(seed = 5) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
const NAMES = ["Host", "Ann", "Ben", "Cy", "Di", "Ed", "Fay", "Gus"];

function setup(n: number, roles: Record<string, Role>, settings: Record<string, unknown> = {}) {
  const g = new Game(seeded());
  for (let i = 0; i < n; i++) g.addPlayer(i === 0 ? "h" : `p${i}`, NAMES[i]);
  g.updateSettings({ voteStyle: "quick", ...settings });
  g.start();
  for (const [id, r] of Object.entries(roles)) g.player(id)!.role = r;
  g.players.forEach((p) => g.ackRole(p.id));
  return g;
}
const finishNight = (g: Game) => {
  while (g.step) g.advanceNight(true);
};
const award = (g: Game, id: string) => g.summary?.awards.find((a) => a.id === id);

describe("game summary", () => {
  it("is only shown once the game is over, and knows the rounds, winner and roles", () => {
    const g = setup(6, { h: "mafia", p1: "villager", p2: "villager", p3: "villager", p4: "doctor", p5: "detective" });
    g.beginNight();
    expect(g.viewFor("h").summary).toBeNull();
    for (const m of g.aliveMafia()) g.nightAction(m.id, "p1");
    finishNight(g);
    g.player("p2")!.alive = false;
    g.player("p3")!.alive = false; // Mafia now equals the town: 1 vs 2? (p4, p5 alive) -> keep going
    g.player("p4")!.alive = false;
    g.beginNight();
    for (const m of g.aliveMafia()) g.nightAction(m.id, "p5");
    finishNight(g);
    expect(g.phase).toBe("over");
    const v = g.viewFor("h").summary!;
    expect(v.winner).toBe("mafia");
    expect(v.rounds).toBe(2);
    expect(v.players.find((p) => p.id === "p4")).toMatchObject({ role: "doctor", alive: false });
    expect(v.timeline.some((e) => e.kind === "night-kill")).toBe(true);
    expect(v.timeline.every((e) => e.kind !== "vote")).toBe(true); // raw votes stay out of the timeline
  });

  it("Sharp eye for the Detective who finds a Mafia member", () => {
    const g = setup(6, { h: "mafia", p1: "detective", p2: "villager", p3: "villager", p4: "villager", p5: "villager" });
    g.beginNight();
    for (const m of g.aliveMafia()) g.nightAction(m.id, "p2");
    while (g.step && (g.step as string) !== "detective") g.advanceNight(true);
    g.nightAction("p1", "h");
    finishNight(g);
    g.phase = "day";
    g.startVote();
    g.alive().forEach((p) => g.castVote(p.id, p.id === "h" ? "skip" : "h"));
    g.resolveVote();
    expect(g.winner).toBe("town");
    expect(award(g, "sharp-eye")).toMatchObject({ winners: ["p1"] });
  });

  it("Guardian angel for the Doctor who saves someone", () => {
    const g = setup(6, { h: "mafia", p1: "doctor", p2: "villager", p3: "villager", p4: "villager", p5: "villager" });
    g.beginNight();
    for (const m of g.aliveMafia()) g.nightAction(m.id, "p2");
    while (g.step && (g.step as string) !== "doctor") g.advanceNight(true);
    g.nightAction("p1", "p2");
    finishNight(g);
    expect(g.player("p2")!.alive).toBe(true);
    for (const id of ["p2", "p3", "p4"]) g.player(id)!.alive = false;
    g.phase = "day";
    g.startVote();
    g.alive().forEach((p) => g.castVote(p.id, "skip"));
    g.resolveVote();
    g.beginNight();
    for (const m of g.aliveMafia()) g.nightAction(m.id, "p5");
    finishNight(g);
    expect(award(g, "guardian-angel")).toMatchObject({ winners: ["p1"] });
  });

  it("Dead eye or Friendly fire for the Vigilante", () => {
    for (const [target, expected] of [["h", "dead-eye"], ["p2", "friendly-fire"]] as const) {
      const g = setup(7, { h: "mafia", p6: "mafia", p1: "vigilante", p2: "villager", p3: "villager", p4: "villager", p5: "villager" });
      g.beginNight();
      for (const m of g.aliveMafia()) g.nightAction(m.id, "p3");
      while (g.step && (g.step as string) !== "vigilante") g.advanceNight(true);
      g.nightAction("p1", target);
      finishNight(g);
      // force an ending so the summary is built
      for (const p of g.players) if (isMafiaRole(p.role)) p.alive = false;
      g.beginNight();
      finishNight(g);
      expect(award(g, expected), expected).toMatchObject({ winners: ["p1"] });
    }
  });

  it("Most suspected, Best liar and Perfect fool", () => {
    const g = setup(7, { h: "mafia", p1: "mafia", p2: "jester", p3: "villager", p4: "villager", p5: "villager", p6: "villager" });
    g.beginNight();
    finishNight(g);
    g.startDay();
    g.startVote();
    // everyone piles on p2 (the Jester); p1 gets one vote
    g.alive().forEach((p) => g.castVote(p.id, p.id === "p2" ? "skip" : "p2"));
    g.castVote("p3", "p1");
    g.resolveVote();
    expect(g.winner).toBe("jester");
    expect(award(g, "perfect-fool")).toMatchObject({ winners: ["p2"] });
    expect(award(g, "most-suspected")).toMatchObject({ winners: ["p2"] });
    expect(award(g, "best-liar")?.winners).toEqual(["h"]); // Mafia member with the fewest votes against
  });

  it("Chatterbox only counts people, not bots", () => {
    const g = setup(6, { h: "mafia", p1: "villager", p2: "villager", p3: "villager", p4: "villager", p5: "villager" });
    g.players[2].bot = true;
    g.beginNight();
    finishNight(g);
    g.startDay();
    for (let i = 0; i < 5; i++) g.say("p2", `bot line ${i}`); // p2 is a bot
    for (let i = 0; i < 3; i++) g.say("p1", `hello ${i}`);
    for (const p of g.players) if (isMafiaRole(p.role)) p.alive = false;
    g.startVote();
    g.resolveVote();
    expect(award(g, "chatterbox")).toMatchObject({ winners: ["p1"] });
  });

  it("starts fresh for a rematch", () => {
    const g = setup(6, { h: "mafia", p1: "villager", p2: "villager", p3: "villager", p4: "villager", p5: "villager" });
    g.beginNight();
    finishNight(g);
    for (const p of g.players) if (isMafiaRole(p.role)) p.alive = false;
    g.startDay();
    g.startVote();
    g.resolveVote();
    expect(g.summary).not.toBeNull();
    expect(g.gameNo).toBe(1);
    g.rematch();
    expect(g.summary).toBeNull();
    g.addBot();
    g.start();
    expect(g.gameNo).toBe(2);
    expect(g.history).toEqual([]);
  });
});
