import { useEffect, useRef, useState } from "react";
import { playerToken } from "./api";

const THEMES: { id: string; label: string }[] = [
  { id: "narrator", label: "Narrator and music" },
  { id: "voting", label: "Voting and rules" },
  { id: "bots", label: "Bots" },
  { id: "rooms", label: "Rooms and joining" },
  { id: "looks", label: "Look and layout" },
  { id: "bugs", label: "Something broke" },
  { id: "ideas", label: "An idea" },
];
const RATINGS = ["Rough", "Meh", "Okay", "Good", "Great"];

export type FeedbackContext = Record<string, string | number | boolean>;

export function FeedbackModal({ onClose, context }: { onClose: () => void; context: FeedbackContext }) {
  const ref = useRef<HTMLDivElement>(null);
  const [text, setText] = useState("");
  const [rating, setRating] = useState<number | null>(null);
  const [tags, setTags] = useState<string[]>([]);
  const [state, setState] = useState<"edit" | "sending" | "sent">("edit");
  const [err, setErr] = useState("");

  useEffect(() => {
    const prev = document.activeElement as HTMLElement | null;
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      prev?.focus?.();
    };
  }, [onClose]);

  const send = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() && rating === null) return setErr("Write a few words or pick a rating.");
    setState("sending");
    setErr("");
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text, rating, tags, token: playerToken(), website: honeypot.current?.value ?? "",
          context: { ...context, viewport: `${window.innerWidth}x${window.innerHeight}`, touch: "ontouchstart" in window },
        }),
      });
      const data = (await res.json()) as { ok: boolean; error?: string };
      if (data.ok) setState("sent");
      else {
        setErr(data.error ?? "Could not send. Please try again.");
        setState("edit");
      }
    } catch {
      setErr("Could not reach the server. Check your connection and try again.");
      setState("edit");
    }
  };
  const honeypot = useRef<HTMLInputElement>(null);

  return (
    <div className="modal-back" onClick={onClose}>
      <div className="modal" role="dialog" aria-modal="true" aria-labelledby="fb-title" tabIndex={-1} ref={ref} onClick={(e) => e.stopPropagation()}>
        <div className="modal-head">
          <h2 id="fb-title">{state === "sent" ? "Thank you" : "Tell us how it went"}</h2>
          <button className="chip" onClick={onClose}>Close</button>
        </div>
        {state === "sent" ? (
          <div className="stack gap-lg">
            <p>Your feedback was saved. We read all of it and use it to decide what to improve next.</p>
            <button className="btn" onClick={onClose}>Back to the game</button>
          </div>
        ) : (
          <form className="stack gap-lg" onSubmit={send}>
            <label className="field">
              <span>What worked, what did not, and what would you change? Write it however you like.</span>
              <textarea id="fb-text" rows={6} maxLength={2000} value={text} onChange={(e) => setText(e.target.value)} placeholder="For example: the narrator was great at night, but I lost track of whose turn it was during the defense." />
            </label>
            <fieldset className="stack plain">
              <legend className="tag">Overall, how was it?</legend>
              <div className="ratings" role="radiogroup" aria-label="Rating">
                {RATINGS.map((label, i) => (
                  <button type="button" key={label} role="radio" aria-checked={rating === i + 1} className={`rate ${rating === i + 1 ? "on" : ""}`} onClick={() => setRating(rating === i + 1 ? null : i + 1)}>
                    <b>{i + 1}</b><span>{label}</span>
                  </button>
                ))}
              </div>
            </fieldset>
            <fieldset className="stack plain">
              <legend className="tag">What is it about? (optional)</legend>
              <div className="themes">
                {THEMES.map((t) => (
                  <button type="button" key={t.id} aria-pressed={tags.includes(t.id)} className={`chip ${tags.includes(t.id) ? "on" : ""}`} onClick={() => setTags((cur) => (cur.includes(t.id) ? cur.filter((x) => x !== t.id) : [...cur, t.id]))}>
                    {t.label}
                  </button>
                ))}
              </div>
            </fieldset>
            <input ref={honeypot} className="hp" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" />
            {err && <p className="error" role="alert">{err}</p>}
            <p className="muted small">We save your message with basic game details (room code, phase, game mode). We do not collect your name or contact details.</p>
            <button className="btn" type="submit" disabled={state === "sending"}>{state === "sending" ? "Sending…" : "Send feedback"}</button>
          </form>
        )}
      </div>
    </div>
  );
}
