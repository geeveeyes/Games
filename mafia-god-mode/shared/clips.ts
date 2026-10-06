// Pre-recorded narration clips. A clip is one spoken segment in one language, found by a short stable id.
// The same function runs in the browser (to look a clip up) and in the generator script (to name the file).
import { LANG_IDS, type Lang, ROLE_WORDS, SCRIPT_KEYS, WERE_WORDS, rawVariants, segmentsOf, spokenTime, fill } from "./script";

function fnv(s: string, seed: number): string {
  let h = seed >>> 0;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619) >>> 0;
  }
  return h.toString(16).padStart(8, "0");
}

/** Stable id for a segment: two 32-bit FNV-1a hashes of "lang|text". */
export const clipId = (lang: Lang, segment: string): string => {
  const key = `${lang}|${segment.trim()}`;
  return fnv(key, 2166136261) + fnv(key, 0x9747b28c);
};

/** Timer values the lobby offers, so spoken times can be recorded ahead. */
const TIME_VALUES = [20, 30, 45, 60, 90, 120, 180, 300, 600];

/**
 * Every segment that can be recorded ahead of time, per language. Lines that contain a player's name are left out
 * (they are spoken by the device voice), but names are always their own segment, so only the name itself falls back.
 */
export function recordableSegments(lang: Lang): string[] {
  const out = new Set<string>();
  const add = (s: string) => {
    if (!/\{\w+\}/.test(s)) out.add(s.trim());
  };
  for (const key of SCRIPT_KEYS) {
    for (const template of rawVariants(key, lang)) {
      for (const seg of segmentsOf(template)) {
        const vars = [...new Set([...seg.say.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))];
        if (!vars.length) {
          add(seg.say);
        } else if (vars.every((x) => ["role", "were", "time"].includes(x))) {
          const roles = Object.keys(ROLE_WORDS);
          for (const r of roles) {
            for (const t of TIME_VALUES) {
              add(fill(seg.say, { role: ROLE_WORDS[r][lang], were: WERE_WORDS[r][lang], time: spokenTime(lang, t) }));
            }
          }
        }
      }
    }
  }
  return [...out].filter(Boolean).sort();
}

export const allRecordable = () => Object.fromEntries(LANG_IDS.map((l) => [l, recordableSegments(l)])) as Record<Lang, string[]>;
