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
}

const TTL_SEC = 60 * 60 * 8;

export class MemoryStore implements Store {
  private rooms = new Map<string, string>();
  private listed = new Set<string>();
  private chains = new Map<string, Promise<void>>();
  async get(code: string) {
    const raw = this.rooms.get(code);
    return raw ? (JSON.parse(raw) as RoomData) : null;
  }
  async set(code: string, room: RoomData) {
    this.rooms.set(code, JSON.stringify(room));
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
