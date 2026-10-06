import type { FeedbackItem } from "./feedback";
import type { GameRecord } from "./stats";
import type { RoomData } from "./room";

/** Room storage. Redis (Upstash REST) in production, memory for local dev and tests. */
export interface Store {
  get(code: string): Promise<RoomData | null>;
  set(code: string, room: RoomData): Promise<void>;
  lock(code: string): Promise<() => Promise<void>>;
  /** Directory of listed rooms (visibility open or ask, still in the lobby). */
  index(code: string, listed: boolean): Promise<void>;
  openCodes(): Promise<string[]>;
  getMany(codes: string[]): Promise<(RoomData | null)[]>;
  pushFeedback(item: FeedbackItem): Promise<void>;
  listFeedback(limit: number): Promise<FeedbackItem[]>;
  pushGame(rec: GameRecord): Promise<void>;
  listGames(limit: number): Promise<GameRecord[]>;
  /** Count a hit against a key within a rolling window and return the new count (for rate limits). */
  hit(key: string, windowSec: number): Promise<number>;
}

const TTL_SEC = 60 * 60 * 8;

export class MemoryStore implements Store {
  private rooms = new Map<string, string>();
  private listed = new Set<string>();
  private feedback: FeedbackItem[] = [];
  private games: GameRecord[] = [];
  private hits = new Map<string, { n: number; until: number }>();
  private chains = new Map<string, Promise<void>>();
  async get(code: string) {
    const raw = this.rooms.get(code);
    return raw ? (JSON.parse(raw) as RoomData) : null;
  }
  async set(code: string, room: RoomData) {
    this.rooms.set(code, JSON.stringify(room));
  }
  async pushFeedback(item: FeedbackItem) {
    this.feedback.push(item);
  }
  async pushGame(rec: GameRecord) {
    this.games.push(rec);
  }
  async listGames(limit: number) {
    return this.games.slice(-limit);
  }
  async listFeedback(limit: number) {
    return this.feedback.slice(-limit);
  }
  async hit(key: string, windowSec: number) {
    const now = Date.now();
    const cur = this.hits.get(key);
    const rec = cur && cur.until > now ? cur : { n: 0, until: now + windowSec * 1000 };
    rec.n += 1;
    this.hits.set(key, rec);
    return rec.n;
  }
  async index(code: string, listed: boolean) {
    if (listed) this.listed.add(code);
    else this.listed.delete(code);
  }
  async openCodes() {
    return [...this.listed];
  }
  async getMany(codes: string[]) {
    return Promise.all(codes.map((c) => this.get(c)));
  }
  async lock(code: string) {
    const prev = this.chains.get(code) ?? Promise.resolve();
    let release!: () => void;
    const next = new Promise<void>((res) => (release = res));
    this.chains.set(code, prev.then(() => next));
    await prev;
    return async () => release();
  }
}

export class RedisStore implements Store {
  constructor(private url: string, private token: string) {}
  private async cmd<T>(...args: (string | number)[]): Promise<T> {
    const res = await fetch(this.url, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(args),
    });
    if (!res.ok) throw new Error(`Redis ${res.status}`);
    return ((await res.json()) as { result: T }).result;
  }
  async get(code: string) {
    const raw = await this.cmd<string | null>("GET", `mgm:room:${code}`);
    return raw ? (JSON.parse(raw) as RoomData) : null;
  }
  async set(code: string, room: RoomData) {
    await this.cmd("SET", `mgm:room:${code}`, JSON.stringify(room), "EX", TTL_SEC);
  }
  async pushGame(rec: GameRecord) {
    await this.cmd("RPUSH", "mgm:games", JSON.stringify(rec));
    await this.cmd("LTRIM", "mgm:games", -5000, -1);
  }
  async listGames(limit: number) {
    const raws = (await this.cmd<string[]>("LRANGE", "mgm:games", -limit, -1)) ?? [];
    return raws.map((r) => JSON.parse(r) as GameRecord);
  }
  async pushFeedback(item: FeedbackItem) {
    await this.cmd("RPUSH", "mgm:feedback", JSON.stringify(item));
    await this.cmd("LTRIM", "mgm:feedback", -20000, -1);
  }
  async listFeedback(limit: number) {
    const raws = (await this.cmd<string[]>("LRANGE", "mgm:feedback", -limit, -1)) ?? [];
    return raws.map((r) => JSON.parse(r) as FeedbackItem);
  }
  async hit(key: string, windowSec: number) {
    const n = await this.cmd<number>("INCR", `mgm:hit:${key}`);
    if (n === 1) await this.cmd("EXPIRE", `mgm:hit:${key}`, windowSec);
    return n;
  }
  async index(code: string, listed: boolean) {
    await this.cmd(listed ? "SADD" : "SREM", "mgm:open", code);
  }
  async openCodes() {
    return (await this.cmd<string[]>("SMEMBERS", "mgm:open")) ?? [];
  }
  async getMany(codes: string[]) {
    if (!codes.length) return [];
    const raws = await this.cmd<(string | null)[]>("MGET", ...codes.map((c) => `mgm:room:${c}`));
    return raws.map((r) => (r ? (JSON.parse(r) as RoomData) : null));
  }
  async lock(code: string) {
    const key = `mgm:lock:${code}`;
    const id = Math.random().toString(36).slice(2);
    for (let i = 0; i < 40; i++) {
      const got = await this.cmd<string | null>("SET", key, id, "NX", "PX", 4000);
      if (got === "OK") {
        return async () => {
          const cur = await this.cmd<string | null>("GET", key);
          if (cur === id) await this.cmd("DEL", key);
        };
      }
      await new Promise((r) => setTimeout(r, 60));
    }
    throw new Error("Room is busy, try again.");
  }
}

let shared: Store | null = null;
export function defaultStore(): Store {
  if (shared) return shared;
  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;
  shared = url && token ? new RedisStore(url, token) : new MemoryStore();
  return shared;
}
