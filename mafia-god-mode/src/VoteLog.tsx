import { useEffect, useRef } from "react";
import type { ClientView } from "../shared/room";

type Entry = ClientView["vote"]["log"][number];

const nameOf = (v: ClientView, id: string) => v.players.find((p) => p.id === id)?.name ?? "?";

/** One closed vote: who voted for whom, grouped by target, and what it decided. */
export function VoteCard({ v, e }: { v: ClientView; e: Entry }) {
  const byTarget = new Map<string, string[]>();
  for (const [from, to] of Object.entries(e.votes)) byTarget.set(to, [...(byTarget.get(to) ?? []), nameOf(v, from)]);
  const rows = [...byTarget].sort((a, b) => (a[0] === "skip" ? 1 : b[0] === "skip" ? -1 : b[1].length - a[1].length));
  const outcome =
    e.outcome.kind === "eliminated" ? `${e.outcome.ids.map((i) => nameOf(v, i)).join(" and ")} was eliminated`
    : e.outcome.kind === "accused" ? `${e.outcome.ids.map((i) => nameOf(v, i)).join(" and ")} stood accused`
    : "Nobody was eliminated";
  return (
    <div className="votecard">
      <div className="votehead"><span className="tag">{e.stage === "final" ? "Final vote" : "First vote"}</span><b>{outcome}</b></div>
      {rows.length === 0 ? <p className="muted small">No votes were cast.</p> : (
        <ul className="talklist">
          {rows.map(([to, from]) => <li key={to}><b>{to === "skip" ? "Skipped" : nameOf(v, to)}</b> ({from.length}): {from.join(", ")}</li>)}
        </ul>
      )}
    </div>
  );
}

/** Every vote so far this game, newest round first. */
export function VoteLogList({ v }: { v: ClientView }) {
  const log = v.vote.log;
  if (!log.length) return <p className="muted">No votes yet. Each vote will be listed here once it closes.</p>;
  const rounds = [...new Set(log.map((e) => e.round))].sort((a, b) => b - a);
  return (
    <div className="stack">
      {rounds.map((r) => (
        <section key={r} className="stack" aria-label={`Day ${r}`}>
          <h4>Day {r}</h4>
          {log.filter((e) => e.round === r).map((e, i) => <VoteCard key={i} v={v} e={e} />)}
        </section>
      ))}
    </div>
  );
}

export function VoteLogModal({ v, onClose }: { v: ClientView; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => { window.removeEventListener("keydown", onKey); prev?.focus?.(); };
  }, []);
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-label="Vote log" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="row-between"><h3>Vote log</h3><button className="chip" onClick={onClose}>Close</button></div>
        <VoteLogList v={v} />
      </div>
    </div>
  );
}
