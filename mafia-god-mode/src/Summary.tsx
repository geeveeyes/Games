import { useEffect, useRef, useState } from "react";
import type { Role } from "../shared/game";
import type { ClientView } from "../shared/room";
import { clearHistory, loadHistory, statsOf, type PlayedGame } from "./history";
import { describeTimeline } from "./summaryText";

const ROLE_NAME = (r: string) => r.charAt(0).toUpperCase() + r.slice(1);

/** Awards and "what happened", shown on the game-over screen. */
export function SummaryPanel({ v }: { v: ClientView }) {
  const s = v.summary;
  if (!s) return null;
  const name = (id: string) => (id === v.you?.id ? "You" : (s.players.find((p) => p.id === id)?.name ?? "someone"));
  const lines = describeTimeline(s);
  return (
    <div className="stack gap-lg">
      {s.awards.length > 0 && (
        <section className="stack" aria-label="Awards">
          <h3>Awards</h3>
          <div className="awards">
            {s.awards.map((a) => (
              <div key={a.id + a.winners.join()} className={`award ${a.winners.includes(v.you?.id ?? "") ? "mine" : ""}`}>
                <span className="tag">{a.title}</span>
                <b>{a.winners.map(name).join(" and ")}</b>
                <span className="muted small">{a.detail}</span>
              </div>
            ))}
          </div>
        </section>
      )}
      <details className="timeline">
        <summary>What happened ({s.rounds} {s.rounds === 1 ? "round" : "rounds"})</summary>
        <ol className="rules-list">{lines.map((l, i) => <li key={i}>{l}</li>)}</ol>
      </details>
    </div>
  );
}

export function HistoryModal({ onClose }: { onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [list, setList] = useState<PlayedGame[]>(loadHistory);
  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && closeRef.current();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, []);
  const s = statsOf(list);
  const tiles: [string, string][] = [
    ["Games", String(s.played)],
    ["Wins", `${s.won} (${s.winRate}%)`],
    ["Win streak", `${s.streak} (best ${s.bestStreak})`],
    ["Survived", `${s.survivedRate}%`],
    ["Awards", String(s.awardsEarned)],
    ["Favourite role", s.favoriteRole ? ROLE_NAME(s.favoriteRole) : "–"],
  ];
  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="hist-title" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="hist-title">My games</h2>
          <button className="chip" onClick={onClose}>Close</button>
        </div>
        {list.length === 0 ? (
          <p className="muted">No games yet. Finish a game on this device and it will show up here. History stays on this device only.</p>
        ) : (
          <div className="stack gap-lg">
            <div className="tiles">{tiles.map(([k, val]) => <div key={k} className="tile"><span className="tag">{k}</span><b>{val}</b></div>)}</div>
            <div className="tiles">
              {(["town", "mafia", "jester"] as const).filter((t) => s[t].played > 0).map((t) => (
                <div key={t} className="tile"><span className="tag">As {t}</span><b>{s[t].won} of {s[t].played} won</b></div>
              ))}
            </div>
            <section className="stack">
              <h3>Recent games</h3>
              <ul className="talklist">
                {[...list].reverse().slice(0, 15).map((g) => (
                  <li key={g.key}>
                    <b>{g.won ? "Won" : "Lost"}</b> as {ROLE_NAME(g.role as Role)} · {g.players} players · {g.rounds} {g.rounds === 1 ? "round" : "rounds"} · {new Date(g.at).toLocaleDateString()}
                    {g.awards.length > 0 && <span className="muted small"> · {g.awards.join(", ")}</span>}
                  </li>
                ))}
              </ul>
            </section>
            <p className="muted small">Kept only in this browser. Nothing is sent to anyone.</p>
            <button className="btn ghost" onClick={() => { clearHistory(); setList([]); }}>Clear my history</button>
          </div>
        )}
      </div>
    </div>
  );
}
