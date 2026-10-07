import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, ApiResponse, ClientView, RoomSummary } from "../shared/room";

const get = (k: string) => {
  try {
    return localStorage.getItem(k);
  } catch {
    return null;
  }
};
const put = (k: string, v: string | null) => {
  try {
    v === null ? localStorage.removeItem(k) : localStorage.setItem(k, v);
  } catch {
    /* private mode: the game still works until reload */
  }
};

export function playerToken(): string {
  let t = get("mgm.token");
  if (!t) {
    t = (crypto.randomUUID?.() ?? Math.random().toString(36).slice(2) + Date.now()).replace(/-/g, "");
    put("mgm.token", t);
  }
  return t;
}

export type Session = { code: string; mode: "player" | "watch" | "moderator" };
export const loadSession = (): Session | null => {
  try {
    return JSON.parse(get("mgm.session") ?? "null");
  } catch {
    return null;
  }
};
export const saveSession = (s: Session | null) => put("mgm.session", s ? JSON.stringify(s) : null);
export const savedName = () => get("mgm.name") ?? "";
export const saveName = (n: string) => put("mgm.name", n);

export async function call(a: Action): Promise<ApiResponse> {
  try {
    const res = await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(a),
    });
    const text = await res.text();
    try {
      return JSON.parse(text) as ApiResponse;
    } catch {
      // The function answered with something that is not JSON (missing route, crash, or a Vercel login wall).
      return { ok: false, error: `Game server error (HTTP ${res.status}). ${text.replace(/<[^>]*>/g, " ").trim().slice(0, 140)}` };
    }
  } catch {
    return { ok: false, error: "Cannot reach the game server. Check your connection.", status: 0 };
  }
}

export async function callRooms(): Promise<RoomSummary[]> {
  try {
    const res = await fetch("/api/room", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rooms" }),
    });
    const data = (await res.json()) as { ok: boolean; rooms?: RoomSummary[] };
    return data.ok ? (data.rooms ?? []) : [];
  } catch {
    return [];
  }
}

const STALE_TAP = /^(Voting is not open|It is not (your turn|night)|Not time to confirm roles)/;

/** Polls the room once a second and exposes an `act` helper that refreshes immediately. */
export function useRoom(session: Session | null, onGone: () => void) {
  const [view, setView] = useState<ClientView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skew = useRef(0);
  const token = playerToken();
  const busy = useRef(false);
  const phase = useRef("lobby");
  // How many background refreshes in a row could not reach the server. Two or more means we are offline.
  const [failures, setFailures] = useState(0);
  const failCount = useRef(0);
  const wake = useRef<() => void>(() => {});

  // An error from the player's own tap stays on screen for a few seconds. Without this the next
  // background refresh would wipe it before anyone could read it.
  const stickyUntil = useRef(0);
  const apply = useCallback((r: ApiResponse, fromTap = false) => {
    if (r.ok) {
      failCount.current = 0;
      setFailures(0);
      skew.current = r.view.now - Date.now();
      phase.current = r.view.phase;
      setView(r.view);
      if (Date.now() > stickyUntil.current) setError(null);
      return true;
    }
    if (r.status === 0) {
      failCount.current += 1;
      setFailures(failCount.current);
      if (!fromTap) return false; // the offline banner explains it; do not also show a red error
    }
    // A tap that lands just as the game moves on ("voting is not open" and the like) is not worth a warning: the next refresh shows the new state.
    if (fromTap && STALE_TAP.test(r.error)) return false;
    if (fromTap) stickyUntil.current = Date.now() + 6000;
    setError(r.error);
    if (r.status === 404) onGone();
    return false;
  }, [onGone]);

  useEffect(() => {
    if (!session) {
      setView(null);
      return;
    }
    let live = true;
    let timer: ReturnType<typeof setTimeout>;
    // Fast while something is waiting on a tap, slow while people just talk.
    // When the connection drops, ease off (up to 8 seconds) instead of hammering the server.
    const delay = () =>
      failCount.current >= 2 ? Math.min(8000, 1000 * 2 ** Math.min(failCount.current - 1, 3)) : ["night", "vote", "reveal"].includes(phase.current) ? 1000 : 2000;
    const poll = async () => {
      clearTimeout(timer);
      if (!busy.current && !document.hidden) {
        const r = await call(session.mode === "watch" ? { action: "watch", code: session.code } : { action: "poll", code: session.code, token });
        if (live) apply(r);
      }
      if (live) timer = setTimeout(poll, delay());
    };
    wake.current = poll;
    poll();
    // A phone that was asleep or offline catches up the moment it is back.
    const onBack = () => !document.hidden && live && poll();
    document.addEventListener("visibilitychange", onBack);
    window.addEventListener("online", onBack);
    return () => {
      live = false;
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onBack);
      window.removeEventListener("online", onBack);
    };
  }, [session?.code, session?.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = useCallback(
    async (a: Record<string, unknown>) => {
      if (!session) return false;
      busy.current = true;
      try {
        return apply(await call({ ...a, code: session.code, token } as Action), true);
      } finally {
        busy.current = false;
      }
    },
    [session, token, apply],
  );

  const now = () => Date.now() + skew.current;
  return { view, error, setError, act, now, token, offline: failures >= 2, retry: () => wake.current() };
}
