import { type Settings, roleCounts } from "./game";

// A rough pre-game estimate of who is favoured, from the role mix alone. It plays thousands of quick, simplified
// games (random but sensible choices, no real conversation) and counts the winners. Real tables differ: good
// talk and good lying matter more than any number here. It exists so a host can see lopsided setups before dealing.

export interface Odds {
  town: number; // percent, rounded; the three numbers add up to 100
  mafia: number;
  jester: number;
  favoured: "town" | "mafia" | "even";
  runs: number;
}

const RUNS = 3000;
const SUSPICION = 2.2;

function rng(seed: number) {
  let s = seed >>> 0;
  return () => ((s = (Math.imul(s, 1664525) + 1013904223) >>> 0) / 4294967296);
}

type R = "mafia" | "godfather" | "doctor" | "detective" | "vigilante" | "bomber" | "jester" | "villager";

function playOnce(n: number, s: Settings, rand: () => number): "town" | "mafia" | "jester" {
  const c = roleCounts(n, s);
  let alive: R[] = [
    ...Array<R>(c.mafia).fill("mafia"), ...Array<R>(c.godfather).fill("godfather"), ...Array<R>(c.doctor).fill("doctor"),
    ...Array<R>(c.detective).fill("detective"), ...Array<R>(c.vigilante).fill("vigilante"), ...Array<R>(c.bomber).fill("bomber"),
    ...Array<R>(c.jester).fill("jester"), ...Array<R>(c.villager).fill("villager"),
  ];
  const isM = (r: R) => r === "mafia" || r === "godfather";
  const count = (f: (r: R) => boolean) => alive.filter(f).length;
  const remove = (i: number) => alive.splice(i, 1);
  const removeRole = (role: R) => { const i = alive.indexOf(role); if (i >= 0) remove(i); };
  const pick = (f: (r: R) => boolean) => {
    const idx = alive.map((r, i) => (f(r) ? i : -1)).filter((i) => i >= 0);
    return idx.length ? idx[Math.floor(rand() * idx.length)] : -1;
  };
  let bulletUsed = false;
  let foundMafia = 0; // mafia the detectives have identified and the village can act on
  const check = (): "town" | "mafia" | null => {
    const m = count(isM);
    const side = m + count((r) => r === "bomber");
    if (m === 0) return "town";
    if (side >= alive.length - side) return "mafia";
    return null;
  };

  for (let round = 1; round < 40; round++) {
    // Bomber: usually waits a night or two, then takes a power role with it.
    if (alive.includes("bomber") && round >= 2 && rand() < 0.35) {
      removeRole("bomber");
      const i = pick((r) => r === "doctor" || r === "detective" || r === "vigilante");
      remove(i >= 0 ? i : Math.max(0, pick((r) => !isM(r))));
      const w = check(); if (w) return w;
    }
    // Mafia choose a victim; the Doctor guesses who and may save them.
    const victim = pick((r) => !isM(r));
    const nonM = alive.length - count(isM);
    let saved = false;
    if (alive.includes("doctor")) saved = rand() < 1 / Math.max(1, nonM);
    // Mafia lean toward silencing the Detective when they suspect one is around.
    let target = victim;
    if (alive.includes("detective") && rand() < 0.3) target = alive.indexOf("detective");
    // Vigilante: spends the bullet from night 2, at a random other player.
    let shot = -1;
    if (alive.includes("vigilante") && !bulletUsed && round >= 2 && rand() < 0.4) { bulletUsed = true; shot = pick((r) => r !== "vigilante"); }
    const dead = new Set<number>();
    if (target >= 0 && !saved) dead.add(target);
    if (shot >= 0 && !(saved && shot === target)) dead.add(shot);
    alive = alive.filter((_, i) => !dead.has(i));
    let w = check(); if (w) return w;
    // Each living Detective investigates; the Godfather reads as innocent.
    const dets = count((r) => r === "detective");
    for (let d = 0; d < dets; d++) if (rand() < count((r) => r === "mafia") / Math.max(1, alive.length - 1)) foundMafia++;
    // Day: an uninformed village lynches almost at random; a Detective's finding makes it likelier to be right.
    const m = count(isM);
    let pMafia = Math.min(0.9, (m / alive.length) * SUSPICION); // people reason, so they beat random guessing
    if (dets && foundMafia > 0) pMafia = Math.min(0.75, pMafia + 0.35 * Math.min(1, foundMafia));
    if (rand() < 0.15) pMafia = 0; // the Mafia occasionally steer the vote onto a villager
    const outcome = rand();
    if (outcome < pMafia) {
      const i = pick((r) => r === "mafia") >= 0 && rand() < 0.8 ? pick((r) => r === "mafia") : pick(isM);
      remove(i); if (foundMafia > 0) foundMafia--;
    } else {
      const i = pick((r) => !isM(r));
      if (i >= 0) {
        if (alive[i] === "jester" && rand() < 0.5) return "jester"; // the Jester only wins if it is actually voted out
        const lost = alive[i];
        remove(i);
        if (lost === "detective") foundMafia = 0;
      }
    }
    w = check(); if (w) return w;
  }
  return "mafia";
}

export function winOdds(n: number, s: Settings): Odds {
  const rand = rng(n * 7919 + (s.mafiaCount ?? 0) * 31 + (s.useBomber ? 1 : 0) * 5 + (s.useJester ? 1 : 0) * 11 + (s.detectiveCount ?? 1) * 101);
  const tally = { town: 0, mafia: 0, jester: 0 };
  for (let i = 0; i < RUNS; i++) tally[playOnce(n, s, rand)]++;
  let town = Math.round((tally.town / RUNS) * 100);
  let jester = Math.round((tally.jester / RUNS) * 100);
  const mafia = Math.max(0, 100 - town - jester);
  if (town + jester + mafia !== 100) town = 100 - mafia - jester;
  const gap = town - mafia;
  return { town, mafia, jester, favoured: Math.abs(gap) <= 6 ? "even" : gap > 0 ? "town" : "mafia", runs: RUNS };
}
