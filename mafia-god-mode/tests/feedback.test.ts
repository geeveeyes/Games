import { describe, expect, it } from "vitest";
import { isAdmin, listFeedback, submitFeedback, toCsv } from "../shared/feedback";
import { MemoryStore } from "../shared/store";

describe("feedback", () => {
  it("saves free text with rating, themes and safe context", async () => {
    const store = new MemoryStore();
    const r = await submitFeedback(store, {
      text: "  The narrator was great, but voting was confusing.  ", rating: 4, tags: ["narrator", "voting", "nope"], token: "abc",
      context: { phase: "vote", players: 6, isHost: true, evil: { x: 1 }, mode: "x".repeat(200) },
    });
    expect(r.ok).toBe(true);
    const [item] = await listFeedback(store);
    expect(item.text).toBe("The narrator was great, but voting was confusing.");
    expect(item.rating).toBe(4);
    expect(item.tags).toEqual(["narrator", "voting"]); // unknown theme dropped
    expect(item.context).toEqual({ phase: "vote", players: 6, isHost: true, mode: "x".repeat(40) }); // only known keys, trimmed
    expect(item.who).not.toContain("abc"); // token is hashed, never stored
  });

  it("accepts a rating alone, rejects empty feedback", async () => {
    const store = new MemoryStore();
    expect((await submitFeedback(store, { rating: 5 })).ok).toBe(true);
    const bad = await submitFeedback(store, { text: "   " });
    expect(bad.ok).toBe(false);
    expect((await submitFeedback(store, { rating: 9, text: "" })).ok).toBe(false);
  });

  it("limits how much one person can send and ignores bots", async () => {
    const store = new MemoryStore();
    for (let i = 0; i < 6; i++) expect((await submitFeedback(store, { text: `n${i}`, token: "same" })).ok).toBe(true);
    const seventh = await submitFeedback(store, { text: "again", token: "same" });
    expect(seventh.ok).toBe(false);
    expect(!seventh.ok && seventh.status).toBe(429);
    expect((await submitFeedback(store, { text: "buy pills", website: "http://spam" })).ok).toBe(true);
    expect((await listFeedback(store)).some((i) => i.text === "buy pills")).toBe(false);
  });

  it("only the admin key can read, and exports CSV", async () => {
    expect(isAdmin("Bearer secret-key-123456", "secret-key-123456")).toBe(true);
    expect(isAdmin("Bearer wrong", "secret-key-123456")).toBe(false);
    expect(isAdmin(undefined, "secret-key-123456")).toBe(false);
    expect(isAdmin("Bearer anything", undefined)).toBe(false); // disabled until a key is configured
    expect(isAdmin("Bearer short", "short")).toBe(false); // keys must be long
    const store = new MemoryStore();
    await submitFeedback(store, { text: 'Said "hi", twice', rating: 3, tags: ["bots"] });
    const csv = toCsv(await listFeedback(store));
    expect(csv.split("\n")[0]).toBe("id,at_iso,rating,tags,text,who,context_json");
    expect(csv).toContain('"Said ""hi"", twice"');
  });
});
