import type { EvidenceItem, EvidenceSource } from "@canteen/shared/insight";
import { getServerEnv } from "@/lib/env";

/**
 * TikHub REST client. Endpoint paths and query params come from the official
 * OpenAPI schema at https://api.tikhub.io/openapi.json
 *
 * - HTTP 402 (paywall) is treated as a *silent skip*: the user can simply
 *   top up and the source becomes available without code changes.
 * - All other failures log a warning so we can see schema drift / token
 *   issues in the dev terminal.
 */

interface EndpointSpec {
  path: string;
  keywordParam: string;
  extra?: Record<string, string>;
}

const SOURCE_ENDPOINT: Record<EvidenceSource, EndpointSpec | null> = {
  tiktok: {
    path: "/api/v1/tiktok/web/fetch_general_search",
    keywordParam: "keyword",
    extra: { offset: "0" },
  },
  twitter: {
    path: "/api/v1/twitter/web/fetch_search_timeline",
    keywordParam: "keyword",
    extra: { search_type: "Top" },
  },
  youtube: {
    path: "/api/v1/youtube/web/search_video",
    keywordParam: "search_query",
    extra: { language_code: "en", country_code: "us" },
  },
  threads: {
    path: "/api/v1/threads/web/search_top",
    keywordParam: "query",
  },
  reddit: {
    path: "/api/v1/reddit/app/fetch_dynamic_search",
    keywordParam: "query",
    extra: { search_type: "post", need_format: "False" },
  },
  instagram: {
    path: "/api/v1/instagram/v2/general_search",
    keywordParam: "keyword",
  },
  // No native TikHub endpoints for these.
  google_news: null,
  polymarket: null,
};

export async function fetchTikhubEvidences(
  source: EvidenceSource,
  query: string,
  limit = 6,
): Promise<EvidenceItem[]> {
  const env = getServerEnv();
  if (!env.TIKHUB_API_KEY) return [];
  const spec = SOURCE_ENDPOINT[source];
  if (!spec) return [];

  const params = new URLSearchParams({
    [spec.keywordParam]: query,
    ...(spec.extra ?? {}),
  });
  const url = `${env.TIKHUB_BASE_URL}${spec.path}?${params.toString()}`;

  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 12_000);

  let res: Response;
  try {
    res = await fetch(url, {
      headers: {
        Authorization: `Bearer ${env.TIKHUB_API_KEY}`,
        accept: "application/json",
      },
      signal: ctrl.signal,
      cache: "no-store",
    });
  } finally {
    clearTimeout(t);
  }

  if (res.status === 402) {
    // Quota / plan paywall — user can top up to enable. Silent skip.
    return [];
  }
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    console.warn(`[tikhub] ${source} ${res.status}: ${body.slice(0, 200)}`);
    return [];
  }
  const json = (await res.json()) as Record<string, unknown>;
  const inner = (json.data ?? json) as unknown;
  const items = parseBySource(source, inner, limit);
  if (items.length === 0) {
    console.warn(
      `[tikhub] ${source} parsed 0 items; raw outer keys=${Object.keys(json).slice(0, 8).join(",")}`,
    );
  }
  return items;
}

// ---------------------------------------------------------------------------
// Per-source parsers
// ---------------------------------------------------------------------------

function parseBySource(
  source: EvidenceSource,
  raw: unknown,
  limit: number,
): EvidenceItem[] {
  switch (source) {
    case "tiktok":
      return parseTiktok(raw, limit);
    case "twitter":
      return parseTwitter(raw, limit);
    case "youtube":
      return parseYoutube(raw, limit);
    case "threads":
      return parseThreads(raw, limit);
    case "reddit":
      return parseReddit(raw, limit);
    case "instagram":
      return parseInstagram(raw, limit);
    default:
      return [];
  }
}

function parseTiktok(raw: unknown, limit: number): EvidenceItem[] {
  const list = readList(raw, ["data"]);
  const out: EvidenceItem[] = [];
  for (const row of list.slice(0, limit)) {
    if (!row || typeof row !== "object") continue;
    const wrap = row as Record<string, unknown>;
    const item = (wrap.item ?? wrap) as Record<string, unknown>;
    if (!item || typeof item !== "object") continue;
    const author = (item.author ?? {}) as Record<string, unknown>;
    const stats = (item.stats ?? item.statsV2 ?? {}) as Record<string, unknown>;
    const id = String(item.id ?? item.aweme_id ?? cryptoId());
    const uniqueId = strField(author, ["uniqueId", "unique_id"]);
    const desc = strField(item, ["desc", "title"]) ?? "";
    out.push({
      source: "tiktok",
      id,
      title: truncate(desc, 240) || `TikTok video ${id}`,
      excerpt: truncate(desc, 600),
      url: uniqueId
        ? `https://www.tiktok.com/@${uniqueId}/video/${id}`
        : undefined,
      author:
        strField(author, ["nickname", "uniqueId"]) ?? uniqueId ?? undefined,
      metrics: {
        views: numField(stats, ["playCount", "play_count"]),
        likes: numField(stats, ["diggCount", "digg_count"]),
        comments: numField(stats, ["commentCount", "comment_count"]),
        shares: numField(stats, ["shareCount", "share_count"]),
      },
      publishedAt: numField(item, ["createTime", "create_time"]),
    });
  }
  return out;
}

function parseTwitter(raw: unknown, limit: number): EvidenceItem[] {
  const list = readList(raw, ["timeline", "tweets", "results", "data"]);
  const out: EvidenceItem[] = [];
  for (const row of list.slice(0, limit)) {
    if (!row || typeof row !== "object") continue;
    const t = row as Record<string, unknown>;
    const user = (t.user ?? t.author ?? {}) as Record<string, unknown>;
    const pm = (t.public_metrics ?? t.metrics ?? t.legacy ?? {}) as Record<string, unknown>;
    const id = String(t.id_str ?? t.tweet_id ?? t.id ?? cryptoId());
    const screen = strField(user, ["screen_name", "username", "uniqueId"]);
    const text = strField(t, ["text", "full_text", "content"]) ?? "";
    out.push({
      source: "twitter",
      id,
      title: truncate(text, 240) || `Tweet ${id}`,
      excerpt: truncate(text, 600),
      url: screen ? `https://x.com/${screen}/status/${id}` : undefined,
      author: strField(user, ["name", "screen_name"]) ?? screen ?? undefined,
      metrics: {
        views: numField(pm, ["impression_count", "view_count", "views"]),
        likes: numField(pm, ["like_count", "favorite_count"]),
        comments: numField(pm, ["reply_count", "comment_count"]),
        shares: numField(pm, ["retweet_count", "share_count"]),
      },
      publishedAt: numField(t, ["created_at_ts", "create_time", "timestamp"]),
    });
  }
  return out;
}

function parseYoutube(raw: unknown, limit: number): EvidenceItem[] {
  const list = readList(raw, ["contents", "videos", "results", "search_results", "data"]);
  const out: EvidenceItem[] = [];
  for (const row of list.slice(0, limit)) {
    if (!row || typeof row !== "object") continue;
    const v = row as Record<string, unknown>;
    const channel = (v.channel ?? v.author ?? {}) as Record<string, unknown>;
    const id = String(v.video_id ?? v.id ?? cryptoId());
    const title = strField(v, ["title", "name"]) ?? "";
    const desc = strField(v, ["description", "snippet"]) ?? "";
    out.push({
      source: "youtube",
      id,
      title: truncate(title, 240) || `YouTube ${id}`,
      excerpt: truncate(desc || title, 600),
      url: `https://www.youtube.com/watch?v=${id}`,
      author: strField(channel, ["name", "title"]) ?? undefined,
      metrics: {
        views: numField(v, ["view_count", "views", "viewCount"]),
        likes: numField(v, ["like_count", "likes"]),
        comments: numField(v, ["comment_count", "comments"]),
      },
      publishedAt: numField(v, ["published_at", "publishedTime", "timestamp"]),
    });
  }
  return out;
}

function parseThreads(raw: unknown, limit: number): EvidenceItem[] {
  // Threads response wraps thread objects under .edges[].node.thread_items[].post
  const list = readList(raw, [
    "edges",
    "search_results",
    "items",
    "data",
    "results",
  ]);
  const out: EvidenceItem[] = [];
  for (const row of list.slice(0, limit)) {
    if (!row || typeof row !== "object") continue;
    const wrap = row as Record<string, unknown>;
    const node = (wrap.node ?? wrap) as Record<string, unknown>;
    const thread = pickFirst(node, ["thread_items", "items"]);
    const post = thread
      ? ((thread as Record<string, unknown>).post ?? thread)
      : (node.post ?? node);
    const p = (post ?? {}) as Record<string, unknown>;
    const user = (p.user ?? {}) as Record<string, unknown>;
    const id = String(p.id ?? p.pk ?? p.code ?? cryptoId());
    const text = strField(p, ["text", "caption", "content"]) ?? "";
    const username = strField(user, ["username", "uniqueId"]);
    out.push({
      source: "threads",
      id,
      title: truncate(text, 240) || `Threads post ${id}`,
      excerpt: truncate(text, 600),
      url: username && p.code
        ? `https://www.threads.net/@${username}/post/${p.code}`
        : undefined,
      author: strField(user, ["full_name", "username"]) ?? username ?? undefined,
      metrics: {
        likes: numField(p, ["like_count", "likes"]),
        comments: numField(p, ["reply_count", "comment_count"]),
      },
      publishedAt: numField(p, ["taken_at", "created_at"]),
    });
  }
  return out;
}

function parseReddit(raw: unknown, limit: number): EvidenceItem[] {
  // Reddit dynamic_search returns posts under data.children[].data
  const list = readList(raw, ["children", "posts", "results", "data"]);
  const out: EvidenceItem[] = [];
  for (const row of list.slice(0, limit)) {
    if (!row || typeof row !== "object") continue;
    const wrap = row as Record<string, unknown>;
    const p = (wrap.data ?? wrap) as Record<string, unknown>;
    if (!p || typeof p !== "object") continue;
    const id = String(p.id ?? p.name ?? cryptoId());
    const title = strField(p, ["title", "name"]) ?? "";
    const body = strField(p, ["selftext", "body", "text"]) ?? "";
    const permalink = strField(p, ["permalink"]);
    out.push({
      source: "reddit",
      id,
      title: truncate(title, 240) || `Reddit ${id}`,
      excerpt: truncate(body || title, 600),
      url: permalink
        ? permalink.startsWith("http")
          ? permalink
          : `https://www.reddit.com${permalink}`
        : strField(p, ["url"]),
      author: strField(p, ["author", "author_fullname"]) ?? undefined,
      metrics: {
        likes: numField(p, ["score", "ups", "upvotes"]),
        comments: numField(p, ["num_comments", "comment_count"]),
      },
      publishedAt: numField(p, ["created_utc", "created"]),
    });
  }
  return out;
}

function parseInstagram(raw: unknown, limit: number): EvidenceItem[] {
  const list = readList(raw, ["items", "results", "media", "data"]);
  const out: EvidenceItem[] = [];
  for (const row of list.slice(0, limit)) {
    if (!row || typeof row !== "object") continue;
    const m = row as Record<string, unknown>;
    const user = (m.user ?? m.owner ?? {}) as Record<string, unknown>;
    const cap = (m.caption ?? {}) as Record<string, unknown>;
    const id = String(m.id ?? m.pk ?? m.code ?? cryptoId());
    const text =
      typeof cap === "string"
        ? cap
        : strField(cap as Record<string, unknown>, ["text"]) ?? "";
    const username = strField(user, ["username", "uniqueId"]);
    const code = strField(m, ["code", "shortcode"]);
    out.push({
      source: "instagram",
      id,
      title: truncate(text, 240) || `Instagram ${id}`,
      excerpt: truncate(text, 600),
      url: code ? `https://www.instagram.com/p/${code}/` : undefined,
      author: strField(user, ["full_name", "username"]) ?? username ?? undefined,
      metrics: {
        likes: numField(m, ["like_count", "likes"]),
        comments: numField(m, ["comment_count", "comments"]),
      },
      publishedAt: numField(m, ["taken_at", "timestamp", "created_time"]),
    });
  }
  return out;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function readList(raw: unknown, candidates: string[]): unknown[] {
  if (Array.isArray(raw)) return raw;
  if (!raw || typeof raw !== "object") return [];
  const obj = raw as Record<string, unknown>;
  for (const k of candidates) {
    const v = obj[k];
    if (Array.isArray(v)) return v;
    if (v && typeof v === "object") {
      const nested = readList(v, candidates);
      if (nested.length) return nested;
    }
  }
  for (const v of Object.values(obj)) {
    if (Array.isArray(v)) return v;
  }
  return [];
}

function pickFirst(o: Record<string, unknown>, keys: string[]): unknown {
  for (const k of keys) {
    const v = o[k];
    if (Array.isArray(v) && v.length > 0) return v[0];
    if (v && typeof v === "object") return v;
  }
  return undefined;
}

function strField(o: Record<string, unknown>, keys: string[]): string | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "string" && v.length > 0) return v;
  }
  return undefined;
}

function numField(o: Record<string, unknown>, keys: string[]): number | undefined {
  for (const k of keys) {
    const v = o[k];
    if (typeof v === "number") return v;
    if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  }
  return undefined;
}

function truncate(s: string, n: number): string {
  return s.length > n ? s.slice(0, n) : s;
}

function cryptoId(): string {
  return Math.random().toString(36).slice(2, 12);
}
