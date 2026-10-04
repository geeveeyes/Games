import { useEffect, useRef, useState } from "react";
import type { ClientView } from "../shared/room";

const supported = typeof window !== "undefined" && "speechSynthesis" in window;

/** Reads new narration lines aloud once the user has switched it on (browsers need a tap first). */
export function useNarrator(view: ClientView | null, defaultOn: boolean) {
  const [on, setOn] = useState(false);
  const last = useRef(0);
  const seen = useRef(false);

  useEffect(() => {
    if (!view) return;
    const max = view.lines.at(-1)?.seq ?? 0;
    if (!on || !supported) {
      last.current = max; // never replay backlog when switched on
      return;
    }
    for (const l of view.lines) {
      if (l.seq > last.current) {
        const u = new SpeechSynthesisUtterance(l.text);
        u.rate = 0.92;
        window.speechSynthesis.speak(u);
      }
    }
    last.current = max;
  }, [view?.lines, on]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggle = () => {
    if (on) window.speechSynthesis?.cancel();
    seen.current = true;
    setOn(!on);
  };
  return { on, toggle, supported, defaultOn };
}

export async function keepAwake() {
  try {
    await (navigator as unknown as { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request("screen");
  } catch {
    /* optional */
  }
}
