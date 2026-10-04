import { useCallback, useEffect, useRef, useState } from "react";
import type { Action, ApiResponse, ClientView } from "../shared/room";

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

export type Session = { code: string; mode: "player" | "watch" };
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
    return (await res.json()) as ApiResponse;
  } catch {
    return { ok: false, error: "Cannot reach the game server. Check your connection." };
  }
}

/** Polls the room once a second and exposes an `act` helper that refreshes immediately. */
export function useRoom(session: Session | null, onGone: () => void) {
  const [view, setView] = useState<ClientView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const skew = useRef(0);
  const token = playerToken();
  const busy = useRef(false);
  const phase = useRef("lobby");

  const apply = useCallback((r: ApiResponse) => {
    if (r.ok) {
      skew.current = r.view.now - Date.now();
      phase.current = r.view.phase;
      setView(r.view);
      setError(null);
      return true;
    }
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
    const delay = () => (["night", "vote", "reveal"].includes(phase.current) ? 1000 : 2000);
    const poll = async () => {
      if (!busy.current && !document.hidden) {
        const r = await call(session.mode === "watch" ? { action: "watch", code: session.code } : { action: "poll", code: session.code, token });
        if (live) apply(r);
      }
      if (live) timer = setTimeout(poll, delay());
    };
    poll();
    return () => {
      live = false;
      clearTimeout(timer);
    };
  }, [session?.code, session?.mode]); // eslint-disable-line react-hooks/exhaustive-deps

  const act = useCallback(
    async (a: Record<string, unknown>) => {
      if (!session) return false;
      busy.current = true;
      try {
        return apply(await call({ ...a, code: session.code, token } as Action));
      } finally {
        busy.current = false;
      }
    },
    [session, token, apply],
  );

  const now = () => Date.now() + skew.current;
  return { view, error, setError, act, now, token };
}
