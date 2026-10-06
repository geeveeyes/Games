import { describe, expect, it } from "vitest";
import { Game, type Role, actsIn, isMafiaRole, roleCounts } from "../shared/game";

function seeded(seed = 3) {
  let s = seed;
  return () => ((s = (s * 1664525 + 1013904223) % 4294967296) / 4294967296);
}
const NAMES = ["Host", "Ann", "Ben", "Cy", "Di", "Ed", "Fay", "Gus", "Hal", "Ivy"];

function game(n: number, settings: Record<string, unknown>, seed = 3) {
  const g = new Game(seeded(seed));
  for (let i = 0; i < n; i++) g.addPlayer(i === 0 ? "h" : `p${i}`, NAMES[i]);
  g.updateSettings({ voteStyle: "quick", ...settings });
  expect(g.start().ok).toBe(true);
  g.players.forEach((p) => g.ackRole(p.id));
  return g;
}
/** Move through night steps until the named one (TypeScript cannot see that `step` changes inside the loop). */
const advanceTo = (g: Game, step: string) => {
  while (g.step && (g.step as string) !== step) g.advanceNight(true);
};
const withRole = (g: Game, r: Role) => g.players.filter((p) => p.role === r);

/** Give a specific role to specific players, to set up a scenario. */
function assign(g: Game, roles: Record<string, Role>) {
  for (const [id, role] of Object.entries(roles)) g.player(id)!.role = role;
}

describe("role sets", () => {
  const all = { useDoctor: true, useDetective: true, useGodfather: true, useJester: true, useVigilante: true, mafiaCount: null as number | null };
  it("only adds optional roles when enough plain villagers remain", () => {
    expect(roleCounts(5, all)).toMatchObject({ godfather: 0, jester: 0, vigilante: 0 }); // too small
    expect(roleCounts(8, all)).toMatchObject({ mafiaTotal: 2, godfather: 1, mafia: 1, doctor: 1, detective: 1, vigilante: 1 });
    const c = roleCounts(10, all);
    expect(c.mafia + c.godfather + c.doctor + c.detective + c.vigilante + c.jester + c.villager).toBe(10);
    expect(c.villager).toBeGreaterThanOrEqual(2);
  });
  it("the Godfather needs a regular Mafia partner", () => {
    expect(roleCounts(6, { ...all, mafiaCount: 1 }).godfather).toBe(0);
  });
  it("deals exactly the roles the host chose, for every size", () => {
    for (let n = 4; n <= 10; n++) {
      const g = game(n, { useGodfather: true, useJester: true, useVigilante: true });
      const c = roleCounts(n, g.settings);
      const count = (r: Role) => withRole(g, r).length;
      expect([count("mafia"), count("godfather"), count("doctor"), count("detective"), count("vigilante"), count("jester"), count("villager")]).toEqual([c.mafia, c.godfather, c.doctor, c.detective, c.vigilante, c.jester, c.villager]);
    }
  });
  it("optional roles are off by default", () => {
    const g = game(10, {});
    expect(["godfather", "jester", "vigilante"].every((r) => withRole(g, r as Role).length === 0)).toBe(true);
  });
});

describe("Godfather", () => {
  it("is on the Mafia team, wakes with them, but reads as innocent to the Detective", () => {
    const g = game(7, { useGodfather: true });
    const gf = withRole(g, "godfather")[0];
    expect(isMafiaRole(gf.role)).toBe(true);
    expect(actsIn("godfather", "mafia")).toBe(true);
    g.beginNight();
    expect(g.actors().some((p) => p.id === gf.id)).toBe(true);
    // everyone on the Mafia team picks the same victim, then the Detective investigates the Godfather
    const victim = g.alive().find((p) => !isMafiaRole(p.role) && p.role !== "detective")!;
    for (const m of g.aliveMafia()) expect(g.nightAction(m.id, victim.id).ok).toBe(true);
    g.advanceNight();
    advanceTo(g, "detective");
    const det = withRole(g, "detective")[0];
    expect(g.nightAction(det.id, gf.id).ok).toBe(true);
    expect(g.notes[det.id][0]).toMatchObject({ targetId: gf.id, isMafia: false });
  });
  it("counts for the Mafia when they reach the town in number", () => {
    const g = game(5, { useGodfather: true, mafiaCount: 2 });
    assign(g, { h: "godfather", p1: "doctor", p2: "villager", p3: "villager", p4: "villager" });
    g.player("p2")!.alive = false;
    g.player("p3")!.alive = false; // 1 Godfather + 0 other Mafia vs 2 town
    g.beginNight();
    g.mafiaPicks = { h: "p1" };
    g.advanceNight(true);
    while (g.step) g.advanceNight(true);
    // Godfather alone vs one remaining villager => the Mafia team has equalled the town
    expect(g.winner).toBe("mafia");
  });
  it("town needs the Godfather out too", () => {
    const g = game(6, { useGodfather: true, mafiaCount: 2 });
    for (const p of withRole(g, "mafia")) p.alive = false;
    g.beginNight();
    while (g.step) g.advanceNight(true);
    expect(g.winner).toBeNull(); // the Godfather is still alive
  });
});

describe("Jester", () => {
  it("wins alone when voted out by day", () => {
    const g = game(7, { useJester: true });
    const j = withRole(g, "jester")[0];
    g.beginNight();
    while (g.step) g.advanceNight(true);
    g.startDay();
    g.startVote();
    g.alive().forEach((p) => g.castVote(p.id, p.id === j.id ? "skip" : j.id));
    g.resolveVote();
    expect(g.winner).toBe("jester");
    expect(g.phase).toBe("over");
    expect(g.lines.at(-1)!.cue).toBe("win-jester");
  });
  it("does not win when killed at night", () => {
    const g = game(7, { useJester: true });
    const j = withRole(g, "jester")[0];
    g.beginNight();
    for (const m of g.aliveMafia()) g.nightAction(m.id, j.id);
    while (g.step) g.advanceNight(true);
    expect(g.player(j.id)!.alive).toBe(false);
    expect(g.winner).toBeNull();
  });
});

describe("Vigilante", () => {
  const setup = () => {
    const g = game(8, { useVigilante: true });
    return { g, vig: withRole(g, "vigilante")[0] };
  };
  const nightWith = (g: Game, vigPick: string | null, mafiaPick?: string) => {
    g.beginNight();
    if (mafiaPick) for (const m of g.aliveMafia()) g.nightAction(m.id, mafiaPick);
    advanceTo(g, "vigilante");
    const vig = withRole(g, "vigilante")[0];
    if (vig.alive && vigPick) expect(g.nightAction(vig.id, vigPick).ok).toBe(true);
    while (g.step) g.advanceNight(true);
  };

  it("has a night step and can shoot once", () => {
    const { g, vig } = setup();
    const target = g.alive().find((p) => !isMafiaRole(p.role) && p.id !== vig.id && p.role !== "doctor")!;
    nightWith(g, target.id);
    expect(g.player(target.id)!.alive).toBe(false);
    expect(g.vigilanteUsed).toBe(true);
    // second night: the bullet is gone, the step is silent
    g.startDay();
    g.startVote();
    g.alive().forEach((p) => g.castVote(p.id, "skip"));
    g.resolveVote();
    g.beginNight();
    advanceTo(g, "vigilante");
    expect(g.stepIsEmpty()).toBe(true);
    expect(g.nightAction(vig.id, g.alive().find((p) => p.id !== vig.id)!.id).ok).toBe(false);
  });
  it("can hold fire and keep the bullet", () => {
    const { g } = setup();
    nightWith(g, "skip");
    expect(g.vigilanteUsed).toBe(false);
    expect(g.lines.at(-1)!.text).toMatch(/nobody died|still alive/i);
  });
  it("two deaths in one night are announced together", () => {
    const { g, vig } = setup();
    const a = g.alive().find((p) => !isMafiaRole(p.role) && p.id !== vig.id && p.role !== "doctor")!;
    const b = g.alive().find((p) => !isMafiaRole(p.role) && p.id !== vig.id && p.id !== a.id && p.role !== "doctor")!;
    nightWith(g, a.id, b.id);
    expect(g.lastNightDeathIds.sort()).toEqual([a.id, b.id].sort());
    expect(g.lines.at(-1)!.text).toContain(a.name);
    expect(g.lines.at(-1)!.text).toContain(b.name);
    expect(g.lines.at(-1)!.text).toMatch(/were killed/);
  });
  it("the Doctor's save protects against the bullet too", () => {
    const { g, vig } = setup();
    const doc = withRole(g, "doctor")[0];
    const target = g.alive().find((p) => !isMafiaRole(p.role) && p.id !== vig.id && p.id !== doc.id)!;
    g.beginNight();
    advanceTo(g, "doctor");
    g.nightAction(doc.id, target.id);
    advanceTo(g, "vigilante");
    g.nightAction(vig.id, target.id);
    while (g.step) g.advanceNight(true);
    expect(g.player(target.id)!.alive).toBe(true);
  });
  it("cannot shoot themselves", () => {
    const { g, vig } = setup();
    g.beginNight();
    advanceTo(g, "vigilante");
    expect(g.nightAction(vig.id, vig.id).ok).toBe(false);
  });
});

describe("ghost chat", () => {
  it("eliminated players talk in a channel only they can see", () => {
    const g = game(6, {});
    const dead = g.players[1];
    dead.alive = false;
    g.beginNight();
    expect(g.say(dead.id, "I was robbed").ok).toBe(true); // allowed even at night
    const living = g.players.find((p) => p.alive)!;
    expect(g.say(living.id, "hello").ok).toBe(false); // the living wait for the day
    while (g.step) g.advanceNight(true);
    g.startDay();
    expect(g.say(living.id, "morning all").ok).toBe(true);
    const seenByLiving = g.viewFor(living.id).talk.map((t) => t.text);
    const seenByDead = g.viewFor(dead.id).talk.map((t) => t.text);
    const seenByTv = g.viewFor(null).talk.map((t) => t.text);
    expect(seenByLiving).toEqual(["morning all"]);
    expect(seenByTv).toEqual(["morning all"]);
    expect(seenByDead).toEqual(["I was robbed", "morning all"]);
  });
  it("everyone sees everything once the game is over", () => {
    const g = game(6, {});
    const dead = g.players[1];
    dead.alive = false;
    g.beginNight();
    g.say(dead.id, "booo");
    g.phase = "over";
    expect(g.viewFor(g.players[0].id).talk.map((t) => t.text)).toContain("booo");
  });
  it("spectators see who voted for whom; the living do not", () => {
    const g = game(6, {});
    const dead = g.players[1];
    dead.alive = false;
    g.beginNight();
    while (g.step) g.advanceNight(true);
    g.startDay();
    g.startVote();
    const alive = g.alive();
    g.castVote(alive[0].id, alive[1].id);
    expect(g.viewFor(dead.id).vote.byWho).toEqual({ [alive[0].id]: alive[1].id });
    expect(g.viewFor(alive[0].id).vote.byWho).toEqual({});
  });
});
