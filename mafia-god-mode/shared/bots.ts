// Bots play through the same rules as people: they ack their role, pick night targets, speak in
// the table-talk feed, and vote. They act lazily (on any poll after their due time), so they work
// on serverless hosting. Delays are random, so a bot's speed never gives its role away.
import type { Game, Persona, Player } from "./game";
import { actsIn, isMafiaRole, shuffle } from "./game";
import type { RoomData, Timing } from "./room";

export interface BotMem {
  key: string;
  due: Record<string, number>; // task id -> time to act
  done: Record<string, number>; // task id -> times done
  replies: string[]; // bot ids that were mentioned in chat
}

type Rng = () => number;
const pickOf = <T>(xs: T[], rng: Rng): T => xs[Math.floor(rng() * xs.length)];

const LINES: Record<Persona, Record<"accuse" | "claim" | "death" | "reply" | "defend" | "vouch", string[]>> = {
  warm: {
    accuse: ["I don't want to point fingers, but {t} has been quiet. What do you think, {t}?", "Gut feeling... I'm a little worried about {t}.", "Can we talk about {t}? Something feels off, and I hope I'm wrong."],
    claim: ["Just so everyone knows, I'm a villager. I promise.", "I'm on your side, truly. Let's be careful with each other."],
    death: ["I'm so sorry, {v}. That's awful.", "{v} was one of the good ones. We have to be careful now."],
    reply: ["Me? I promise it isn't me, {n}. Please look somewhere else.", "Oh, that hurts. I'm just trying to help us."],
    defend: ["Please listen. I'm town, and if you vote me out the Mafia gets a free turn.", "I know it looks bad, but I'm only trying to help. Think about who pushed this."],
    vouch: ["I trust {t}. They've been straight with me."],
  },
  blunt: {
    accuse: ["{t}. Something's off with you.", "I'm voting {t}. Call it instinct.", "{t}, you've said nothing useful. Why?"],
    claim: ["Not me. Next.", "I'm town. Don't waste time on me."],
    death: ["{v} is gone. Someone here did that.", "That's what happens when we sit around. Pick a suspect."],
    reply: ["Wrong target.", "Cute. But no."],
    defend: ["I'm not Mafia. Count the votes and ask who started this.", "You're about to make a mistake. Look closer."],
    vouch: ["{t} is fine. Leave them alone."],
  },
  playful: {
    accuse: ["I'm not saying {t} is a mobster, but they do have the look of a mobster.", "{t}, you're sweating. Are you sweating?", "My spidey sense says {t}. It's usually wrong, but still."],
    claim: ["I'm an honest villager. I even return my shopping carts.", "Me, Mafia? I can't even lie about my age."],
    death: ["RIP {v}. You'll be missed. Mostly your snacks.", "Well, that escalated quickly, {v}."],
    reply: ["Whoa, who, me? I'm innocent as a bowl of pasta.", "You wound me, {n}. Deeply."],
    defend: ["Okay, okay, plot twist: I'm a villager. Please don't vote me out.", "If I were Mafia I'd have a much better poker face. Look at this face."],
    vouch: ["{t} seems cool. I'd share fries with {t}."],
  },
};
const fill = (s: string, vars: Record<string, string>) => s.replace(/\{(\w)\}/g, (_, k) => vars[k] ?? "");

/** Everything a bot could do right now: [taskId, delay window]. */
function tasks(room: RoomData, g: Game, t: Timing): { id: string; bot: Player; min: number; max: number }[] {
  const out: { id: string; bot: Player; min: number; max: number }[] = [];
  const bots = g.players.filter((p) => p.bot);
  const mem = room.bots!;
  for (const b of bots) {
    if (g.phase === "reveal" && !b.seenRole) out.push({ id: `ack:${b.id}`, bot: b, min: t.botRevealMinMs, max: t.botRevealMaxMs });
    if (g.phase === "night" && b.alive && actsIn(b.role, g.step) && g.canTarget(b.id).length) {
      const mine = g.actors();
      const humansMafia = isMafiaRole(b.role) ? mine.filter((m) => !m.bot) : [];
      const waitingOnHuman = humansMafia.length > 0 && humansMafia.every((m) => !g.mafiaPicks[m.id]);
      const already = isMafiaRole(b.role) ? g.mafiaPicks[b.id] : b.role === "doctor" ? g.doctorPick : b.role === "vigilante" ? g.vigilantePick : b.role === "bomber" ? g.bomberPick : g.detectivePicks[b.id];
      if (!waitingOnHuman && !already) out.push({ id: `night:${b.id}`, bot: b, min: t.botNightMinMs, max: t.botNightMaxMs });
    }
    if (g.phase === "vote" && b.alive && !g.votes[b.id]) {
      out.push({ id: `vote:${b.id}`, bot: b, min: t.botVoteMinMs, max: Math.min(t.botVoteMaxMs, g.settings.voteTimerSec * 600) });
    }
    if (g.phase === "day" && b.alive && (mem.done[`talk:${b.id}`] ?? 0) < 2) {
      out.push({ id: `talk:${b.id}`, bot: b, min: t.botTalkMinMs, max: Math.min(t.botTalkMaxMs, g.settings.dayTimerSec * 650) });
    }
    if (g.phase === "defense" && g.defendants[g.defenseIdx] === b.id && !(mem.done[`defend:${b.id}`] ?? 0)) {
      out.push({ id: `defend:${b.id}`, bot: b, min: t.botDefendMinMs, max: t.botDefendMaxMs });
    }
    if (["day", "vote", "defense"].includes(g.phase) && b.alive && mem.replies.includes(b.id)) {
      out.push({ id: `reply:${b.id}`, bot: b, min: t.botReplyMinMs, max: t.botReplyMaxMs });
    }
  }
  return out;
}

const keyOf = (g: Game) => `${g.phase}:${g.round}:${g.voteStage}:${g.defenseIdx}:${g.stepIdx}`;

/** Reset bot memory when the game moves to a new waiting state. */
export function syncBots(room: RoomData, g: Game) {
  const key = keyOf(g);
  if (!room.bots || room.bots.key !== key) room.bots = { key, due: {}, done: {}, replies: [] };
}

/** A person said something. Bots whose names were mentioned will answer. */
export function noteMentions(room: RoomData, g: Game, speakerId: string, text: string) {
  syncBots(room, g);
  const low = text.toLowerCase();
  for (const b of g.players) {
    if (b.bot && b.alive && b.id !== speakerId && new RegExp(`\\b${b.name.toLowerCase()}\\b`).test(low) && !room.bots!.replies.includes(b.id)) {
      room.bots!.replies.push(b.id);
    }
  }
}

function suspects(g: Game, bot: Player): Player[] {
  return g.alive().filter((p) => p.id !== bot.id);
}

function chooseTarget(g: Game, bot: Player, pool: Player[], rng: Rng): Player | undefined {
  if (!pool.length) return undefined;
  if (bot.role === "detective") {
    const found = pool.find((p) => (g.notes[bot.id] ?? []).some((n) => n.targetId === p.id && n.isMafia));
    if (found) return found;
    const cleared = new Set((g.notes[bot.id] ?? []).filter((n) => !n.isMafia).map((n) => n.targetId));
    const fresh = pool.filter((p) => !cleared.has(p.id));
    if (fresh.length) return pickOf(fresh, rng);
  }
  return pickOf(pool, rng);
}

function act(room: RoomData, g: Game, id: string, bot: Player, rng: Rng) {
  const [kind] = id.split(":");
  const persona = bot.persona ?? "warm";
  const L = LINES[persona];
  const name = (p?: Player) => p?.name ?? "someone";
  const mem = room.bots!;
  const bump = () => (mem.done[id] = (mem.done[id] ?? 0) + 1);

  if (kind === "ack") {
    g.ackRole(bot.id);
  } else if (kind === "night") {
    const allowed = new Set(g.canTarget(bot.id));
    let pool = g.alive().filter((p) => allowed.has(p.id));
    if (isMafiaRole(bot.role)) {
      // Copy a partner's pick so the team agrees; otherwise choose one and the rest will follow.
      const partner = Object.entries(g.mafiaPicks).find(([mid]) => mid !== bot.id);
      const target = partner ? g.player(partner[1]) : chooseTarget(g, bot, pool, rng);
      if (target) g.nightAction(bot.id, target.id);
    } else if (bot.role === "doctor") {
      g.nightAction(bot.id, pickOf(pool, rng).id);
    } else if (bot.role === "bomber") {
      // Usually waits; sometimes takes someone with it, never on the first night.
      const boom = g.round >= 2 && rng() < 0.25;
      g.nightAction(bot.id, boom ? pickOf(pool, rng).id : "skip");
    } else if (bot.role === "vigilante") {
      // Mostly hold fire. The single bullet is rarely spent, and not on the first night.
      const shoot = g.round >= 2 && rng() < 0.3;
      g.nightAction(bot.id, shoot ? pickOf(pool, rng).id : "skip");
    } else {
      const t = chooseTarget(g, bot, pool, rng);
      if (t) g.nightAction(bot.id, t.id);
    }
  } else if (kind === "vote") {
    const pool = g.phase === "vote" && g.voteStage === "final" && g.defendants.length ? g.alive().filter((p) => g.defendants.includes(p.id) && p.id !== bot.id) : suspects(g, bot);
    const final = g.voteStage === "final" && g.defendants.length > 0;
    let target: string = "skip";
    const mafiaAllies = new Set(g.aliveMafia().map((p) => p.id));
    if (!final) {
      const choices = isMafiaRole(bot.role) ? pool.filter((p) => !mafiaAllies.has(p.id)) : pool;
      // Mafia bots lean toward whoever the table is already suspecting.
      const counts = g.tally();
      const leaning = choices.filter((p) => (counts[p.id] ?? 0) > 0).sort((a, b) => (counts[b.id] ?? 0) - (counts[a.id] ?? 0))[0];
      const pickChoice = isMafiaRole(bot.role) && leaning && rng() < 0.6 ? leaning : chooseTarget(g, bot, choices, rng);
      if (pickChoice && rng() > 0.08) target = pickChoice.id;
    } else if (pool.length) {
      const d = pool[0];
      const known = (g.notes[bot.id] ?? []).find((n) => n.targetId === d.id);
      let eliminate: boolean;
      if (isMafiaRole(bot.role)) eliminate = !mafiaAllies.has(d.id);
      else if (known) eliminate = known.isMafia;
      else eliminate = rng() < 0.6;
      if (eliminate) target = d.id;
    }
    g.castVote(bot.id, target);
  } else if (kind === "talk") {
    const n = mem.done[id] ?? 0;
    const others = suspects(g, bot);
    const death = g.lastNightDeathId ? g.player(g.lastNightDeathId) : undefined;
    let text: string;
    if (n === 0 && death && rng() < 0.7) {
      text = fill(pickOf(L.death, rng), { v: name(death) });
    } else if (rng() < 0.25 && n === 1) {
      text = pickOf(L.claim, rng);
    } else {
      let pool = others;
      if (isMafiaRole(bot.role)) pool = others.filter((p) => !g.aliveMafia().some((m) => m.id === p.id));
      const t = bot.role === "detective" ? chooseTarget(g, bot, pool, rng) : pickOf(pool.length ? pool : others, rng);
      text = t ? fill(pickOf(L.accuse, rng), { t: name(t) }) : pickOf(L.claim, rng);
    }
    g.say(bot.id, text);
    bump();
  } else if (kind === "defend") {
    g.say(bot.id, pickOf(L.defend, rng));
    bump();
  } else if (kind === "reply") {
    g.say(bot.id, fill(pickOf(L.reply, rng), { n: "friend" }));
    mem.replies = mem.replies.filter((r) => r !== bot.id);
  }
}

/** Let any bot whose time has come act. Returns true if the game changed. */
export function runBots(room: RoomData, g: Game, now: number, t: Timing, rng: Rng = Math.random): boolean {
  if (!g.players.some((p) => p.bot)) {
    room.botNext = null;
    return false;
  }
  syncBots(room, g);
  let changed = false;
  for (let pass = 0; pass < 6; pass++) {
    const pending = tasks(room, g, t);
    let acted = false;
    for (const task of pending) {
      const mem = room.bots!;
      if (mem.due[task.id] === undefined) mem.due[task.id] = now + task.min + rng() * Math.max(0, task.max - task.min);
      if (now >= mem.due[task.id]) {
        delete mem.due[task.id];
        act(room, g, task.id, task.bot, rng);
        changed = acted = true;
      }
    }
    if (!acted) break;
  }
  const waiting = tasks(room, g, t).map((x) => room.bots!.due[x.id]).filter((d) => d !== undefined);
  room.botNext = waiting.length ? Math.min(...waiting) : null;
  void shuffle;
  return changed;
}
