import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handle, handleRooms } from "../shared/handler";
import { INSTANT_TIMING } from "../shared/room";
import { RedisStore } from "../shared/store";

// Tiny stand-in for Upstash's REST API: POST a JSON command array, get {result}.
const data = new Map<string, string>();
const sets = new Map<string, Set<string>>();
const lists = new Map<string, string[]>();
const counters = new Map<string, number>();
let server: ReturnType<typeof createServer>;
let url = "";

beforeAll(async () => {
  server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    if (req.headers.authorization !== "Bearer secret") return void res.writeHead(401).end("{}");
    const [cmd, key, val, ...rest] = JSON.parse(body) as string[];
    const args = JSON.parse(body) as string[];
    let result: unknown = null;
    if (cmd === "GET") result = data.get(key) ?? null;
    else if (cmd === "SADD") (sets.get(key) ?? sets.set(key, new Set()).get(key)!).add(val), (result = 1);
    else if (cmd === "SREM") result = sets.get(key)?.delete(val) ? 1 : 0;
    else if (cmd === "SMEMBERS") result = [...(sets.get(key) ?? [])];
    else if (cmd === "MGET") result = args.slice(1).map((k) => data.get(k) ?? null);
    else if (cmd === "RPUSH") (lists.get(key) ?? lists.set(key, []).get(key)!).push(val), (result = 1);
    else if (cmd === "LTRIM") result = "OK";
    else if (cmd === "LRANGE") result = lists.get(key) ?? [];
    else if (cmd === "INCR") counters.set(key, (counters.get(key) ?? 0) + 1), (result = counters.get(key));
    else if (cmd === "EXPIRE") result = 1;
    else if (cmd === "DEL") result = data.delete(key) ? 1 : 0;
    else if (cmd === "SET") {
      if (rest.includes("NX") && data.has(key)) result = null;
      else {
        data.set(key, val);
        result = "OK";
      }
    }
    res.writeHead(200, { "Content-Type": "application/json" }).end(JSON.stringify({ result }));
  });
  await new Promise<void>((r) => server.listen(0, r));
  url = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
afterAll(() => void server.close());

describe("RedisStore over the REST protocol", () => {
  it("creates, joins and starts a game", async () => {
    const store = new RedisStore(url, "secret");
    const call = (a: any) => handle(a, store, 1_000, INSTANT_TIMING);
    const c = await call({ action: "create", token: "h", name: "Host" });
    if (!c.ok) throw new Error(c.error);
    for (let i = 1; i < 4; i++) expect((await call({ action: "join", code: c.code, token: `t${i}`, name: `P${i}` })).ok).toBe(true);
    const s = await call({ action: "start", code: c.code, token: "h" });
    expect(s.ok).toBe(true);
    expect([...data.keys()].some((k) => k.startsWith("mgm:lock:"))).toBe(false); // locks released
  });
  it("lists open rooms through Redis sets", async () => {
    const store = new RedisStore(url, "secret");
    const call = (a: any) => handle(a, store, 2_000, INSTANT_TIMING);
    const c = await call({ action: "create", token: "h2", name: "Asha" });
    if (!c.ok) throw new Error(c.error);
    await call({ action: "settings", code: c.code, token: "h2", patch: { visibility: "open" } });
    const rooms = (await handleRooms(store)).rooms;
    expect(rooms.map((r) => r.code)).toContain(c.code);
    await call({ action: "settings", code: c.code, token: "h2", patch: { visibility: "private" } });
    expect((await handleRooms(store)).rooms.map((r) => r.code)).not.toContain(c.code);
  });

  it("stores feedback and rate limits through Redis", async () => {
    const store = new RedisStore(url, "secret");
    const { submitFeedback, listFeedback } = await import("../shared/feedback");
    expect((await submitFeedback(store, { text: "Loved the bots", rating: 5, token: "p1" })).ok).toBe(true);
    const items = await listFeedback(store);
    expect(items.map((i) => i.text)).toContain("Loved the bots");
  });

  it("keeps anonymous game records through Redis", async () => {
    const store = new RedisStore(url, "secret");
    await store.pushGame({ at: 1, rounds: 3, winner: "town", players: 6, bots: 2, roles: [], language: "en", mode: "table", voteStyle: "trial" });
    const games = await store.listGames(10);
    expect(games.at(-1)).toMatchObject({ winner: "town", players: 6 });
  });

  it("reports a bad token as an error, not a crash", async () => {
    const store = new RedisStore(url, "wrong");
    await expect(store.get("ABCD")).rejects.toThrow();
  });
});
