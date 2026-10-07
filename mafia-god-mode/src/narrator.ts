import { useCallback, useEffect, useRef, useState } from "react";
import { clipId } from "../shared/clips";
import type { Cue } from "../shared/game";
import { type Lang, LANGS, segmentsOf } from "../shared/script";
import type { ClientView } from "../shared/room";
import { Ambience, type Mood, type Sting } from "./audio";

export const speechSupported = typeof window !== "undefined" && "speechSynthesis" in window;

// Fixed narrator style, chosen by ear: UK male voice, normal speed, lowest pitch, music at 60%.
const RATE = 1;
const PITCH = 0.5;
const MUSIC_VOL = 0.6;

/** The best voice for a language. English prefers a deep UK male voice, the way the narrator was tuned; other languages take the best match. */
export function bestVoice(voices: SpeechSynthesisVoice[], lang: Lang = "en"): SpeechSynthesisVoice | undefined {
  const base = LANGS.find((l) => l.id === lang)?.bcp47.slice(0, 2) ?? "en";
  const pool = voices.filter((v) => v.lang.toLowerCase().startsWith(base));
  if (!pool.length) return lang === "en" ? undefined : undefined;
  if (lang === "en") {
    const uk = pool.find((v) => /google uk english male/i.test(v.name));
    if (uk) return uk;
  }
  const score = (v: SpeechSynthesisVoice) => {
    const n = v.name.toLowerCase();
    let sc = 0;
    if (/natural|neural|premium|enhanced|siri|studio|google/.test(n)) sc += 50;
    if (lang === "en") {
      if (/daniel|arthur|oliver|alex|fred|aaron|guy|ryan|davis|james|thomas|rishi|lee/.test(n)) sc += 25;
      if (/female|zira|samantha|karen|moira|tessa|susan|hazel|jenny|aria/.test(n)) sc -= 8;
      if (v.lang === "en-GB") sc += 8;
    } else if (/male(?!.*female)|madhur|valluvar|prabhat|hemant|ravi/.test(n)) sc += 10;
    if (v.localService) sc += 2;
    return sc;
  };
  return [...pool].sort((a, b) => score(b) - score(a))[0];
}

/**
 * Browsers load their voice list in the background: the first getVoices() call is often empty, and Chrome announces the
 * real list later. Speaking before then falls back to the default voice (not the UK male). So wait for the list.
 */
export function loadVoices(timeoutMs = 600): Promise<SpeechSynthesisVoice[]> {
  if (!speechSupported) return Promise.resolve([]);
  const synth = window.speechSynthesis;
  const now = synth.getVoices();
  if (now.length) return Promise.resolve(now);
  return new Promise((resolve) => {
    const done = () => {
      synth.removeEventListener("voiceschanged", done);
      clearTimeout(timer);
      resolve(synth.getVoices());
    };
    const timer = setTimeout(done, timeoutMs);
    synth.addEventListener("voiceschanged", done);
  });
}
if (speechSupported) void loadVoices(); // start loading as soon as the app opens

export const parseScript = segmentsOf;
export const plain = (text: string) => text.replace(/\s*\|\|?\s*/g, " ").replace(/\.\.\.\s*/g, "… ").replace(/\s+/g, " ").trim();

// ---- recorded clips (optional). A manifest per language lists the clips that exist; anything missing is spoken by the device voice.
type Manifest = Record<string, string>;
const manifests = new Map<Lang, Manifest | null>();
const loading = new Map<Lang, Promise<void>>();
export function preloadClips(lang: Lang): Promise<void> {
  if (!loading.has(lang)) {
    loading.set(
      lang,
      fetch(`/narration/${lang}/manifest.json`, { cache: "no-cache" })
        .then((r) => (r.ok ? (r.json() as Promise<Manifest>) : {}))
        .catch(() => ({}))
        .then((m) => void manifests.set(lang, m && typeof m === "object" ? (m as Manifest) : {})),
    );
  }
  return loading.get(lang)!;
}
if (typeof window !== "undefined") (window as unknown as { __mgmClipId: typeof clipId }).__mgmClipId = clipId; // lets browser tests compute clip names

const MOOD: Partial<Record<Cue, Mood>> = {
  deal: "night", night: "night", mafia: "night", doctor: "night", detective: "night", vigilante: "night", bomber: "night",
  dawn: "day", "dawn-death": "day", day: "day", vote: "tense", elim: "night", noelim: "day",
  "win-town": "win", "win-mafia": "lose", "win-jester": "win",
};
const STING: Partial<Record<Cue, Sting>> = {
  night: "gong", dawn: "bell", "dawn-death": "death", elim: "death", "win-town": "reveal", "win-mafia": "death", "win-jester": "reveal",
};

/** The music that fits a phase, used when the narrator is switched on part-way through a game. */
function moodFor(v: ClientView): Mood {
  switch (v.phase) {
    case "reveal": case "night": return "night";
    case "dawn": case "day": case "result": return "day";
    case "vote": case "defense": return "tense";
    case "over": return v.winner === "mafia" ? "lose" : "win";
    default: return "off";
  }
}

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

  const clip = useRef<HTMLAudioElement | null>(null);
  const stopSpeech = useCallback(() => {
    if (speechSupported) window.speechSynthesis.cancel();
    clip.current?.pause();
    clip.current = null;
  }, []);

  /** Speak one line: recorded clips where they exist, the device voice for the rest (names, anything not recorded). */
  const speak = useCallback((text: string, lang: Lang, myRun: number, onDone?: () => void) => {
    const segs = parseScript(text);
    let voice: SpeechSynthesisVoice | undefined;
    const bcp47 = LANGS.find((l) => l.id === lang)?.bcp47 ?? "en-GB";
    let i = 0;
    const next = () => {
      if (run.current !== myRun) return;
      if (i >= segs.length) {
        amb().duck(false);
        onDone?.();
        return;
      }
      const seg = segs[i++];
      const after = () => setTimeout(next, seg.gap);
      amb().duck(true);
      const tts = () => {
        if (!speechSupported) return after();
        const u = new SpeechSynthesisUtterance(seg.say);
        if (voice) u.voice = voice;
        u.lang = voice?.lang ?? bcp47;
        u.rate = RATE;
        u.pitch = PITCH;
        u.volume = 1;
        u.onend = after;
        u.onerror = after;
        window.speechSynthesis.speak(u);
      };
      const file = manifests.get(lang)?.[clipId(lang, seg.say)];
      if (!file) return tts();
      const audio = new Audio(`/narration/${lang}/${file}`);
      clip.current = audio;
      audio.onended = after;
      audio.onerror = tts; // a missing or broken file falls back to the device voice
      audio.play().catch(tts);
    };
    if (!speechSupported) return next();
    void loadVoices().then((voices) => {
      if (run.current !== myRun) return;
      voice = bestVoice(voices, lang);
      next();
    });
  }, []);

  const viewRef = useRef(view);
  viewRef.current = view;
  const language = view?.settings.language ?? "en";
  useEffect(() => {
    if (on) void preloadClips(language);
  }, [on, language]);

  /** Speak lines one after another, with their music and sound cues. A newer call replaces an older one. */
  // Lines wait in a queue and are spoken one at a time, each to the end. A new line never cuts the one being spoken.
  const queue = useRef<{ line: ClientView["lines"][number]; stings: boolean }[]>([]);
  const speaking = useRef(false);
  const MAX_BACKLOG = 4; // if the device falls far behind (a sleeping phone), skip the oldest lines and catch up

  const drain = useCallback(() => {
    if (speaking.current) return;
    const item = queue.current.shift();
    if (!item) return;
    speaking.current = true;
    const myRun = run.current;
    const { line, stings } = item;
    const a = amb();
    const mood = line.cue ? MOOD[line.cue] : undefined;
    if (mood) a.setMood(mood);
    const sting = line.cue ? STING[line.cue] : undefined;
    if (sting && stings) a.sting(sting);
    speak(line.text, line.lang ?? "en", myRun, () => {
      if (run.current !== myRun) return;
      speaking.current = false;
      setTimeout(drain, 400);
    });
  }, [speak]);

  /** Add lines to the queue. With `fromNow`, drop anything still waiting and start with these (used when the narrator is switched on). */
  const playLines = useCallback((lines: ClientView["lines"], opts: { stings?: boolean; fromNow?: boolean } = {}) => {
    if (opts.fromNow) {
      run.current++;
      stopSpeech();
      queue.current = [];
      speaking.current = false;
    }
    for (const line of lines) queue.current.push({ line, stings: opts.stings ?? true });
    if (queue.current.length > MAX_BACKLOG) queue.current.splice(0, queue.current.length - MAX_BACKLOG);
    drain();
  }, [drain, stopSpeech]);

  // React to new narration lines. Every new line is played in order, so a slow refresh never swallows the middle of a night.
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
    playLines(fresh);
  }, [view?.lines, on]); // eslint-disable-line react-hooks/exhaustive-deps

  // Leaving a room (or losing it) must silence everything: queued speech, pending lines, and the music.
  useEffect(() => {
    if (view !== null) return;
    run.current++;
    stopSpeech();
    queue.current = [];
    speaking.current = false;
    ambience.current?.duck(false);
    ambience.current?.stop();
    setOn(false);
  }, [view]); // eslint-disable-line react-hooks/exhaustive-deps

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

  /**
   * Turn the narrator on, at any point in the game. It immediately says where the game is right now
   * (the latest narration), then keeps narrating new lines. Speech starts synchronously inside the tap,
   * because some browsers only allow speech that begins during a user gesture.
   */
  const enable = useCallback(async () => {
    const v = viewRef.current;
    const current = v?.lines.at(-1);
    if (current) lastSeq.current = current.seq; // the effect must not repeat it
    unlockAudioElements(); // inside the tap, so later clips are allowed to play
    void preloadClips(v?.settings.language ?? "en");
    setOn(true);
    if (current) playLines([current], { stings: false, fromNow: true });
    await amb().start();
    amb().setVolume(MUSIC_VOL);
    if (v) amb().setMood(moodFor(v));
  }, [playLines]);

  const disable = useCallback(() => {
    run.current++;
    stopSpeech();
    queue.current = [];
    speaking.current = false;
    ambience.current?.stop();
    setOn(false);
  }, [stopSpeech]);

  return { on, enable, disable, supported: speechSupported };
}

/** Browsers (iPhone especially) only let a page play audio files after one has been started by a tap. */
function unlockAudioElements() {
  try {
    const a = new Audio("data:audio/wav;base64,UklGRiQAAABXQVZFZm10IBAAAAABAAEAESsAACJWAAACABAAZGF0YQAAAAA=");
    a.volume = 0;
    void a.play().catch(() => {});
  } catch {
    /* optional */
  }
}

export async function keepAwake() {
  try {
    await (navigator as unknown as { wakeLock?: { request(t: string): Promise<unknown> } }).wakeLock?.request("screen");
  } catch {
    /* optional */
  }
}
