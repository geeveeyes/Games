import { createServer } from "node:http";
import type { AddressInfo } from "node:net";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { handle } from "../shared/handler";
import { INSTANT_TIMING } from "../shared/room";
import { RedisStore } from "../shared/store";

// Tiny stand-in for Upstash's REST API: POST a JSON command array, get {result}.
const data = new Map<string, string>();
let server: ReturnType<typeof createServer>;
let url = "";

beforeAll(async () => {
  server = createServer(async (req, res) => {
    let body = "";
    for await (const c of req) body += c;
    if (req.headers.authorization !== "Bearer secret") return void res.writeHead(401).end("{}");
    const [cmd, key, val, ...rest] = JSON.parse(body) as string[];
    let result: unknown = null;
    if (cmd === "GET") result = data.get(key) ?? null;
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
  it("reports a bad token as an error, not a crash", async () => {
    const store = new RedisStore(url, "wrong");
    await expect(store.get("ABCD")).rejects.toThrow();
  });
});
