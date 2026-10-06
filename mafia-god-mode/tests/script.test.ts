import { describe, expect, it } from "vitest";
import { allRecordable, clipId, recordableSegments } from "../shared/clips";
import { Game } from "../shared/game";
import { LANG_IDS, SCRIPT_KEYS, type Lang, rawVariants, segmentsOf, spokenTime } from "../shared/script";

const placeholders = (s: string) => [...new Set([...s.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))].sort();

describe("narration script", () => {
  it("has every line in every language, using the same placeholders", () => {
    for (const key of SCRIPT_KEYS) {
      const en = rawVariants(key, "en").flatMap(placeholders);
      const enSet = [...new Set(en)].sort();
      for (const lang of LANG_IDS) {
        const variants = rawVariants(key, lang);
        expect(variants.length, `${key}/${lang} has no lines`).toBeGreaterThan(0);
        for (const text of variants) {
          expect(text.trim().length, `${key}/${lang} is empty`).toBeGreaterThan(0);
          expect(placeholders(text), `${key}/${lang} placeholders differ from English`).toEqual(enSet);
        }
      }
    }
  });

  it("uses each language's own script for Hindi and Tamil", () => {
    expect(rawVariants("deal", "hi")[0]).toMatch(/[ऀ-ॿ]/);
    expect(rawVariants("deal", "ta")[0]).toMatch(/[஀-௿]/);
  });

  it("speaks times naturally", () => {
    expect(spokenTime("en", 45)).toBe("45 seconds");
    expect(spokenTime("en", 60)).toBe("1 minute");
    expect(spokenTime("en", 180)).toBe("3 minutes");
    expect(spokenTime("hi", 180)).toBe("3 मिनट");
    expect(spokenTime("ta", 180)).toBe("3 நிமிஷம்");
  });

  it("splits text into segments with the right pauses", () => {
    expect(segmentsOf("A. | B. || C.")).toEqual([{ say: "A.", gap: 650 }, { say: "B.", gap: 1400 }, { say: "C.", gap: 0 }]);
  });
});

describe("a whole game narrated in each language", () => {
  for (const lang of LANG_IDS) {
    it(`${lang}: no gaps, no leftover placeholders`, () => {
      const g = new Game(() => 0.5);
      ["h", "a", "b", "c", "d", "e"].forEach((id, i) => g.addPlayer(id, ["Host", "Ann", "Ben", "Cy", "Di", "Ed"][i]));
      g.updateSettings({ language: lang, voteStyle: "trial", revealRoleOnDeath: true });
      g.start();
      g.players.forEach((p) => g.ackRole(p.id));
      const seen: string[] = [];
      const collect = () => g.lines.forEach((l) => seen.push(l.text));
      for (let round = 0; round < 3 && (g.phase as string) !== "over"; round++) {
        g.beginNight();
        while (g.phase === "night") g.advanceNight(true);
        collect();
        if ((g.phase as string) === "over") break;
        g.startDay();
        g.startVote();
        const alive = g.alive();
        alive.forEach((p, i) => g.castVote(p.id, alive[(i + 1) % alive.length].id === p.id ? "skip" : alive[(i + 1) % alive.length].id));
        g.resolveVote();
        while (g.phase === "defense") g.advanceDefense();
        if (g.phase === "vote") {
          const al = g.alive();
          al.forEach((p) => g.castVote(p.id, g.defendants.find((d) => d !== p.id) ?? "skip"));
          g.resolveVote();
        }
        collect();
      }
      expect(seen.length).toBeGreaterThan(8);
      for (const t of seen) {
        expect(t, t).not.toMatch(/\{\w+\}/);
        expect(t, t).not.toMatch(/undefined|NaN/);
      }
      expect(g.lines.every((l) => l.lang === lang)).toBe(true);
      const RANGE = { hi: /[\u0900-\u097F]/, ta: /[\u0B80-\u0BFF]/, te: /[\u0C00-\u0C7F]/ } as const;
      if (lang !== "en") expect(seen.join(" ")).toMatch(RANGE[lang as "hi" | "ta" | "te"]);
    });
  }
});

describe("narration clips", () => {
  it("ids are stable, so recorded files stay valid (change this only on purpose)", () => {
    expect(clipId("en", "Time is up.")).toBe(clipId("en", "  Time is up.  "));
    expect(clipId("en", "Time is up.")).toMatchInlineSnapshot(`"cef07920055f2181"`);
    expect(clipId("hi", "Time is up.")).not.toBe(clipId("en", "Time is up."));
  });

  it("every recordable segment gets a unique id and has no names or placeholders", () => {
    const ids = new Map<string, string>();
    for (const lang of LANG_IDS) {
      const segs = recordableSegments(lang as Lang);
      expect(segs.length, lang).toBeGreaterThan(30);
      for (const s of segs) {
        expect(s).not.toMatch(/\{\w+\}/);
        const id = clipId(lang as Lang, s);
        expect(ids.get(id), `id collision: ${s} / ${ids.get(id)}`).toBeUndefined();
        ids.set(id, `${lang}:${s}`);
      }
    }
  });

  it("covers the closing lines for each role and the spoken times", () => {
    const en = recordableSegments("en");
    expect(en).toContain("Mafia... close your eyes.");
    expect(en).toContain("Detective... close your eyes.");
    expect(en).toContain("You have 3 minutes.");
    expect(en).toContain("Time is up.");
    expect(Object.values(allRecordable()).every((l) => l.length > 30)).toBe(true);
  });
});
