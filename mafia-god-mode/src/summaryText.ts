// Plain-English lines for the "what happened" timeline at the end of a game.
import type { GameSummary, HistoryEvent } from "../shared/game";

const ROLE = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);

export function describeEvent(e: HistoryEvent, players: GameSummary["players"]): string {
  const p = (id?: string) => players.find((x) => x.id === id);
  const name = (id?: string) => p(id)?.name ?? "someone";
  const names = (ids: string[] = []) => ids.map(name).join(" and ");
  const night = `Night ${e.round}`;
  const day = `Day ${e.round}`;
  switch (e.kind) {
    case "night-kill":
      return `${night}: the Mafia killed ${names(e.ids)} (${ROLE(p(e.ids?.[0])?.role ?? "?")}).`;
    case "vigilante-shot":
      return `${night}: the Vigilante ${name(e.by)} shot ${names(e.ids)}${e.flag ? ` (${ROLE(p(e.ids?.[0])?.role ?? "?")}).` : ", but they were saved."}`;
    case "saved":
      return `${night}: the Doctor ${name(e.by)} saved ${names(e.ids)}.`;
    case "investigated":
      return `${night}: the Detective ${name(e.by)} checked ${names(e.ids)} and found ${e.flag ? "a Mafia member" : "an innocent"}.`;
    case "accused":
      return `${day}: ${names(e.ids)} stood accused.`;
    case "eliminated":
      return `${day}: ${names(e.ids)} was voted out (${ROLE(p(e.ids?.[0])?.role ?? "?")}).`;
    case "no-elimination":
      return `${day}: nobody was voted out.`;
    default:
      return "";
  }
}

/** The timeline in the order things happened: each night's events, then that day's. */
export function describeTimeline(summary: GameSummary): string[] {
  const order = (e: HistoryEvent) => e.round * 10 + (["night-kill", "vigilante-shot", "saved", "investigated"].includes(e.kind) ? 0 : 5);
  return summary.timeline
    .map((e, i) => ({ e, i }))
    .sort((a, b) => order(a.e) - order(b.e) || a.i - b.i)
    .map(({ e }) => describeEvent(e, summary.players))
    .filter(Boolean);
}
