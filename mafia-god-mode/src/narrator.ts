import { useCallback, useEffect, useRef, useState } from "react";
import type { Cue } from "../shared/game";
import type { ClientView } from "../shared/room";
import { Ambience, type Mood, type Sting } from "./audio";

export const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

// Fixed narrator style, chosen by ear: UK male voice, normal speed, lowest pitch, music at 60%.
const RATE = 1;
const PITCH = 0.5;
const MUSIC_VOL = 0.6;

/** Best-sounding English voice available on this device. Natural/neural voices first, then deep male voices. */
export function bestVoice(voices: SpeechSynthesisVoice[]): SpeechSynthesisVoice | undefined {
  const uk = voices.find((v) => /google uk english male/i.test(v.name));
  if (uk) return uk;
  const score = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase();
    let s = 0;
    if (/natural|neural|premium|enhanced|siri|studio/.test(n)) s += 50;
    if (/google uk english male|daniel|arthur|oliver|alex|fred|aaron|guy|ryan|davis|james|thomas|rishi|lee/.test(n)) s += 25;
    if (/female|zira|samantha|karen|moira|tessa|susan|hazel|jenny|aria/.test(n)) s -= 8;
    if (v.lang === "en-GB") s += 8;
    else if (v.lang.startsWith("en")) s += 5;
    else s -= 100;
    if (v.localService) s += 2;
    return s;
  };
  return [...voices].sort((a, b) => score(b) - score(a))[0];
}

/** Splits "text | text || text" into segments with the pause that follows each one. */
export function parseScript(text: string): { say: string; gap: number }[] {
  const out: { say: string; gap: number }[] = [];
  const parts = text.split(/(\|\|?)/);
  for (let i = 0; i < parts.length; i += 2) {
    const say = parts[i].trim();
    const sep = parts[i + 1];
    if (say) out.push({ say, gap: sep === "||" ? 1400 : sep === "|" ? 650 : 0 });
  }
  return out;
}
export const plain = (text: string) => text.replace(/\s*\|\|?\s*/g, " ").replace(/\.\.\.\s*/g, "… ").replace(/\s+/g, " ").trim();

const MOOD: Partial<Record<Cue, Mood>> = {
  deal: "night", night: "night", mafia: "night", doctor: "night", detective: "night",
  dawn: "day", "dawn-death": "day", day: "day", vote: "tense", elim: "night", noelim: "day",
  "win-town": "win", "win-mafia": "lose",
};
const STING: Partial<Record<Cue, Sting>> = {
  night: "gong", dawn: "bell", "dawn-death": "death", elim: "death", "win-town": "reveal", "win-mafia": "death",
};

/** Reads narration aloud with timed pauses and plays mood music. One device does this per game. */
export function useNarrator(view: ClientView | null) {
  const [on, setOn] = useState(false);
  const ambience = useRef<Ambience | null>(null);
  const lastSeq = useRef(0);
  const run = useRef(0);

  const amb = () => {
    if (!ambience.current) {
      ambience.current = new Ambience();
      ambience.current.setVolume(MUSIC_VOL);
    }
    return ambience.current;
  };

  const speak = useCallback((text: string, myRun: number, onDone?: () => void) => {
    const segs = parseScript(text);
    const voice = bestVoice(window.speechSynthesis.getVoices());
    let i = 0;
    const next = () => {
      if (run.current !== myRun) return;
      if (i >= segs.length) {
        amb().duck(false);
        onDone?.();
        return;
      }
      const seg = segs[i++];
      const u = new SpeechSynthesisUtterance(seg.say);
      if (voice) u.voice = voice;
      u.rate = RATE;
      u.pitch = PITCH;
      u.volume = 1;
      const after = () => setTimeout(next, seg.gap);
      u.onend = after;
      u.onerror = after;
      amb().duck(true);
      window.speechSynthesis.speak(u);
    };
    next();
  }, []);

  // React to new narration lines.
  useEffect(() => {
    if (!view) return;
    const newest = view.lines.at(-1)?.seq ?? 0;
    if (!on) {
      lastSeq.current = newest;
      return;
    }
    const fresh = view.lines.filter((l) => l.seq > lastSeq.current);
    if (!fresh.length) return;
    lastSeq.current = newest;
    const a = amb();
    const myRun = ++run.current;
    if (speechSupported) window.speechSynthesis.cancel();
    // Play every new line in order, so a slow poll never swallows the middle of a night.
    let idx = 0;
    const playNext = () => {
      if (run.current !== myRun || idx >= fresh.length) return;
      const line = fresh[idx++];
      const mood = line.cue ? MOOD[line.cue] : undefined;
      if (mood) a.setMood(mood);
      const sting = line.cue ? STING[line.cue] : undefined;
      if (sting) a.sting(sting);
      if (speechSupported) speak(line.text, myRun, () => setTimeout(playNext, 400));
      else setTimeout(playNext, 400);
    };
    playNext();
  }, [view?.lines, on]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving a room (or losing it) must silence everything: queued speech, pending lines, and the music.
  useEffect(() => {
    if (view !== null) return;
    run.current++;
    if (speechSupported) window.speechSynthesis.cancel();
    ambience.current?.duck(false);
    ambience.current?.stop();
    setOn(false);
  }, [view]);

  // Closing the tab or navigating away also stops the voice, which would otherwise finish its sentence.
  useEffect(() => {
    const stop = () => {
      if (speechSupported) window.speechSynthesis.cancel();
    };
    window.addEventListener("pagehide", stop);
    return () => window.removeEventListener("pagehide", stop);
  }, []);

  // No music in the lobby.
  useEffect(() => {
    if (view?.phase === "lobby" && on) ambience.current?.setMood("off");
  }, [view?.phase, on]);

  const enable = useCallback(async () => {
    await amb().start();
    setOn(true);
    const a = amb();
    if (view && ["night", "reveal"].includes(view.phase)) a.setMood("night");
    if (view && ["day", "dawn", "result"].includes(view.phase)) a.setMood("day");
  }, [view]);

  const disable = useCallback(() => {
    run.current++;
    if (speechSupported) window.speechSynthesis.cancel();
    ambience.current?.stop();
    setOn(false);
  }, []);

  return { on, enable, disable, supported: speechSupported };
}

export async function keepAwake() {
  try {
    await (navigator as unknown as { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request("screen");
  } catch {
    /* optional */
  }
}
