import { useState } from "react";

interface Stats { games: number; last7days: number; avgPlayers: number; avgBots: number; avgRounds: number; gamesWithBots: number; winners: Record<string, number>; languages: Record<string, number>; modes: Record<string, number>; voteStyles: Record<string, number>; optionalRoles: Record<string, number>; perDay: { day: string; games: number }[] }
interface Item { id: string; at: number; text: string; rating: number | null; tags: string[]; who: string; context: Record<string, unknown> }

/** Read-only feedback list at /#admin. The key is checked by the server, never stored. */
export function Admin() {
  const [key, setKey] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState("");
  const [tag, setTag] = useState("all");
  const [tab, setTab] = useState<"feedback" | "games">("feedback");
  const [stats, setStats] = useState<Stats | null>(null);
  const loadStats = async () => {
    const res = await fetch("/api/stats", { headers: { Authorization: `Bearer ${key}` } });
    const data = (await res.json()) as { ok: boolean; stats?: Stats };
    if (data.ok && data.stats) setStats(data.stats);
  };

  const load = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr("");
    const res = await fetch("/api/feedback?limit=1000", { headers: { Authorization: `Bearer ${key}` } });
    const data = (await res.json()) as { ok: boolean; items?: Item[]; error?: string };
    if (data.ok) setItems(data.items ?? []);
    else setErr(res.status === 403 ? "That key was not accepted." : (data.error ?? "Could not load feedback."));
  };
  const csv = async () => {
    const res = await fetch("/api/feedback?format=csv&limit=2000", { headers: { Authorization: `Bearer ${key}` } });
    const url = URL.createObjectURL(new Blob([await res.text()], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "mafia-god-mode-feedback.csv";
    a.click();
    URL.revokeObjectURL(url);
  };

  const shown = items?.filter((i) => tag === "all" || i.tags.includes(tag)) ?? [];
  const avg = items?.filter((i) => i.rating).reduce((s, i, _, a) => s + (i.rating ?? 0) / a.length, 0);

  return (
    <div className="stack gap-lg">
      <h1>{tab === "games" ? "Games" : "Feedback"}</h1>
      {!items ? (
        <form className="stack" onSubmit={load}>
          <label className="field"><span>Admin key</span><input id="adminkey" type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" /></label>
          <button className="btn" type="submit" disabled={!key}>Open feedback</button>
          {err && <p className="error" role="alert">{err}</p>}
        </form>
      ) : (
        <>
          <div className="themes">
            <button className={`chip ${tab === "feedback" ? "on" : ""}`} onClick={() => setTab("feedback")}>Feedback</button>
            <button className={`chip ${tab === "games" ? "on" : ""}`} onClick={() => { setTab("games"); void loadStats(); }}>Games</button>
          </div>
          {tab === "games" ? <GamesTab stats={stats} /> : <>
          <p className="muted">{items.length} {items.length === 1 ? "entry" : "entries"}{avg ? ` · average rating ${avg.toFixed(1)}` : ""}</p>
          <div className="themes">
            {["all", "narrator", "voting", "bots", "rooms", "looks", "bugs", "ideas"].map((t) => (
              <button key={t} className={`chip ${tag === t ? "on" : ""}`} onClick={() => setTag(t)}>{t}</button>
            ))}
            <button className="chip" onClick={csv}>Download CSV</button>
          </div>
          <ul className="talklist fblist">
            {shown.map((i) => (
              <li key={i.id}>
                <span className="tag">{new Date(i.at).toLocaleString()} · {i.rating ? `${i.rating}/5` : "no rating"} · {i.tags.join(", ") || "no theme"} · {String(i.context.phase ?? "")} {String(i.context.mode ?? "")}</span>
                <p>{i.text || <i className="muted">(rating only)</i>}</p>
              </li>
            ))}
          </ul>
          </>}
        </>
      )}
    </div>
  );
}

const pct = (n: number, total: number) => (total ? `${Math.round((n / total) * 100)}%` : "–");
const share = (m: Record<string, number>, total: number) => Object.entries(m).sort((a, b) => b[1] - a[1]).map(([k, n]) => `${k} ${pct(n, total)}`).join(" · ") || "–";

function GamesTab({ stats }: { stats: Stats | null }) {
  if (!stats) return <p className="muted">Loading…</p>;
  const rows: [string, string][] = [
    ["Games played", String(stats.games)],
    ["Last 7 days", String(stats.last7days)],
    ["Average players", `${stats.avgPlayers} (${stats.avgBots} bots)`],
    ["Games with bots", pct(stats.gamesWithBots, stats.games)],
    ["Average rounds", String(stats.avgRounds)],
    ["Winners", share(stats.winners, stats.games)],
    ["Narrator language", share(stats.languages, stats.games)],
    ["Mode", share(stats.modes, stats.games)],
    ["Vote style", share(stats.voteStyles, stats.games)],
    ["Optional roles used", Object.entries(stats.optionalRoles).map(([k, n]) => `${k} ${n}`).join(" · ") || "none yet"],
  ];
  const max = Math.max(1, ...stats.perDay.map((d) => d.games));
  return (
    <div className="stack gap-lg">
      <div className="tiles">{rows.map(([k, v]) => <div key={k} className="tile"><span className="tag">{k}</span><b>{v}</b></div>)}</div>
      <section className="stack"><h3>Games per day (14 days)</h3>
        <ul className="talklist">{stats.perDay.map((d) => <li key={d.day}><span className="tag">{d.day}</span> <span style={{ display: "inline-block", height: 8, width: `${(d.games / max) * 60}%`, minWidth: d.games ? 4 : 0, background: "var(--lamp)", borderRadius: 4, verticalAlign: "middle" }} /> {d.games}</li>)}</ul>
      </section>
    </div>
  );
}
