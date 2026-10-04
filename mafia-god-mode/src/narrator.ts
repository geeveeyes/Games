import { useCallback, useEffect, useRef, useState } from "react";
import type { Cue } from "../shared/game";
import type { ClientView } from "../shared/room";
import { Ambience, type Mood, type Sting } from "./audio";

export const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

export interface NarratorSettings {
  on: boolean;
  voiceOn: boolean;
  musicOn: boolean;
  musicVol: number;
  voiceURI: string;
  rate: number;
  pitch: number;
}
const DEFAULTS: NarratorSettings = { on: false, voiceOn: true, musicOn: true, musicVol: 0.6, voiceURI: "", rate: 0.84, pitch: 0.82 };

const load = (): NarratorSettings => {
  try {
    return { ...DEFAULTS, ...JSON.parse(localStorage.getItem("mgm.narrator") ?? "{}"), on: false };
  } catch {
    return DEFAULTS;
  }
};

/** Best-sounding English voice available on this device. Natural/neural voices first, then deep male voices. */
export function bestVoice(voices: SpeechSynthesisVoice[], preferred?: string): SpeechSynthesisVoice | undefined {
  const chosen = preferred && voices.find((v) => v.voiceURI === preferred);
  if (chosen) return chosen;
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
  const [s, setS] = useState<NarratorSettings>(load);
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);
  const ambience = useRef<Ambience | null>(null);
  const lastSeq = useRef(0);
  const run = useRef(0);
  const sRef = useRef(s);
  sRef.current = s;

  const update = useCallback((patch: Partial<NarratorSettings>) => {
    setS((cur) => {
      const next = { ...cur, ...patch };
      try {
        const { on: _on, ...keep } = next;
        localStorage.setItem("mgm.narrator", JSON.stringify(keep));
      } catch {
        /* optional */
      }
      return next;
    });
  }, []);

  useEffect(() => {
    if (!speechSupported) return;
    const read = () => setVoices(window.speechSynthesis.getVoices().filter((v) => v.lang.toLowerCase().startsWith("en")));
    read();
    window.speechSynthesis.addEventListener("voiceschanged", read);
    return () => window.speechSynthesis.removeEventListener("voiceschanged", read);
  }, []);

  const amb = () => (ambience.current ??= new Ambience());

  const speak = useCallback((text: string, myRun: number, onDone?: () => void) => {
    const cfg = sRef.current;
    const segs = parseScript(text);
    const voice = bestVoice(window.speechSynthesis.getVoices(), cfg.voiceURI);
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
      u.rate = cfg.rate;
      u.pitch = cfg.pitch;
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
    if (!s.on) {
      lastSeq.current = newest;
      return;
    }
    const fresh = view.lines.filter((l) => l.seq > lastSeq.current);
    if (!fresh.length) return;
    lastSeq.current = newest;
    const a = amb();
    a.setVolume(s.musicVol);
    const myRun = ++run.current;
    if (speechSupported) window.speechSynthesis.cancel();
    // Play every new line in order, so a slow poll never swallows the middle of a night.
    let idx = 0;
    const playNext = () => {
      if (run.current !== myRun || idx >= fresh.length) return;
      const line = fresh[idx++];
      const mood = line.cue ? MOOD[line.cue] : undefined;
      if (mood) a.setMood(s.musicOn ? mood : "off");
      const sting = line.cue ? STING[line.cue] : undefined;
      if (sting) a.sting(sting);
      if (s.voiceOn && speechSupported) speak(line.text, myRun, () => setTimeout(playNext, 400));
      else setTimeout(playNext, 400);
    };
    playNext();
  }, [view?.lines, s.on]); // eslint-disable-line react-hooks/exhaustive-deps

  // Lobby and game over: no music in the lobby.
  useEffect(() => {
    if (!s.on) return;
    const a = amb();
    a.setVolume(s.musicVol);
    if (!s.musicOn) a.setMood("off");
  }, [s.musicOn, s.musicVol, s.on]);

  useEffect(() => {
    if (view?.phase === "lobby" && s.on) ambience.current?.setMood("off");
  }, [view?.phase, s.on]);

  const enable = useCallback(async () => {
    await amb().start();
    update({ on: true });
    const a = amb();
    a.setVolume(sRef.current.musicVol);
    if (view && ["night", "reveal"].includes(view.phase) && sRef.current.musicOn) a.setMood("night");
    if (view && ["day", "dawn", "result"].includes(view.phase) && sRef.current.musicOn) a.setMood("day");
  }, [update, view]);

  const disable = useCallback(() => {
    run.current++;
    if (speechSupported) window.speechSynthesis.cancel();
    ambience.current?.stop();
    update({ on: false });
  }, [update]);

  const test = useCallback(async () => {
    await amb().start();
    amb().setVolume(sRef.current.musicVol);
    amb().sting("gong");
    const myRun = ++run.current;
    if (speechSupported) {
      window.speechSynthesis.cancel();
      speak("Night falls on the village. || Everyone... close your eyes. | Keep them closed. | No peeking.", myRun);
    }
  }, [speak]);

  return { s, update, voices, enable, disable, test, supported: speechSupported };
}

export async function keepAwake() {
  try {
    await (navigator as unknown as { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request("screen");
  } catch {
    /* optional */
  }
}
