import { useState } from "react";

interface Item { id: string; at: number; text: string; rating: number | null; tags: string[]; who: string; context: Record<string, unknown> }

/** Read-only feedback list at /#admin. The key is checked by the server, never stored. */
export function Admin() {
  const [key, setKey] = useState("");
  const [items, setItems] = useState<Item[] | null>(null);
  const [err, setErr] = useState("");
  const [tag, setTag] = useState("all");

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
      <h1>Feedback</h1>
      {!items ? (
        <form className="stack" onSubmit={load}>
          <label className="field"><span>Admin key</span><input id="adminkey" type="password" value={key} onChange={(e) => setKey(e.target.value)} autoComplete="off" /></label>
          <button className="btn" type="submit" disabled={!key}>Open feedback</button>
          {err && <p className="error" role="alert">{err}</p>}
        </form>
      ) : (
        <>
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
        </>
      )}
    </div>
  );
}
