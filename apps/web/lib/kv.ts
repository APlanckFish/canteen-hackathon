import { Redis } from "@upstash/redis";
import { getServerEnv } from "./env";

/**
 * Vercel KV (Upstash Redis) wrapper with a graceful in-memory fallback for
 * local dev without KV configured. The fallback is process-local and ephemeral
 * — fine for a hackathon demo, not for production.
 */

interface KvLike {
  get<T = unknown>(key: string): Promise<T | null>;
  set(
    key: string,
    value: unknown,
    opts?: { ex?: number },
  ): Promise<unknown>;
  del(key: string): Promise<unknown>;
  /** Atomic set-if-absent. Returns true if the key was set, false if it existed. */
  setNx(key: string, value: unknown, opts?: { ex?: number }): Promise<boolean>;
}

class MemoryKv implements KvLike {
  private store = new Map<string, { v: unknown; expiresAt?: number }>();

  async get<T>(key: string): Promise<T | null> {
    const e = this.store.get(key);
    if (!e) return null;
    if (e.expiresAt && Date.now() > e.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return e.v as T;
  }
  async set(key: string, value: unknown, opts?: { ex?: number }) {
    this.store.set(key, {
      v: value,
      expiresAt: opts?.ex ? Date.now() + opts.ex * 1000 : undefined,
    });
    return "OK";
  }
  async del(key: string) {
    this.store.delete(key);
    return 1;
  }
  async setNx(key: string, value: unknown, opts?: { ex?: number }) {
    const cur = await this.get(key);
    if (cur !== null) return false;
    await this.set(key, value, opts);
    return true;
  }
}

class UpstashKv implements KvLike {
  constructor(private redis: Redis) {}
  async get<T>(key: string): Promise<T | null> {
    return (await this.redis.get<T>(key)) ?? null;
  }
  async set(key: string, value: unknown, opts?: { ex?: number }) {
    if (opts?.ex) {
      return this.redis.set(key, value as string, { ex: opts.ex });
    }
    return this.redis.set(key, value as string);
  }
  async del(key: string) {
    return this.redis.del(key);
  }
  async setNx(key: string, value: unknown, opts?: { ex?: number }) {
    // Upstash typings split nx/xx into mutually-exclusive unions; we cast to
    // the loose call signature to keep the helper polymorphic.
    const res = await (this.redis.set as (
      k: string,
      v: unknown,
      o: Record<string, unknown>,
    ) => Promise<string | null>)(key, value, {
      nx: true,
      ...(opts?.ex ? { ex: opts.ex } : {}),
    });
    return res === "OK";
  }
}

let _kv: KvLike | undefined;

export function getKv(): KvLike {
  if (_kv) return _kv;
  const env = getServerEnv();
  if (env.KV_REST_API_URL && env.KV_REST_API_TOKEN) {
    _kv = new UpstashKv(
      new Redis({ url: env.KV_REST_API_URL, token: env.KV_REST_API_TOKEN }),
    );
  } else {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[kv] KV_REST_API_URL not set — using in-memory fallback");
    }
    _kv = new MemoryKv();
  }
  return _kv;
}

export const KV_KEYS = {
  challenge: (eventId: string, nonce: string) =>
    `x402:challenge:${eventId}:${nonce}`,
  consumed: (txHash: string) => `x402:consumed:${txHash.toLowerCase()}`,
  ledger: (txHash: string) => `ledger:${txHash.toLowerCase()}`,
  /** AI-picked carousel (top-N curated markets). Cached for 1h. */
  marketsHot: () => `markets:hot:v2`,
  /** Category-filtered events first page. Cached for 60s. Higher pages are uncached. */
  marketsCat: (slug: string, offset: number) =>
    `markets:cat:v2:${slug}:${offset}`,
} as const;
