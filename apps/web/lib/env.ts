import { z } from "zod";

/**
 * Environment validation.
 *
 * - `publicEnv` is safe to import from client components (only NEXT_PUBLIC_*).
 * - `serverEnv` is for server-side only (API routes / RSC server actions).
 *
 * We deliberately use lazy access via getters because Next.js statically replaces
 * process.env.NEXT_PUBLIC_* at build time only when literally referenced.
 */

const optionalAddress = z
  .string()
  .optional()
  .transform((v) => (v && v.length > 0 ? (v as `0x${string}`) : undefined));

// Convert "" → undefined so optional()/default() trigger correctly.
const emptyToUndef = (v: unknown) =>
  typeof v === "string" && v.length === 0 ? undefined : v;

const PublicEnvSchema = z.object({
  NEXT_PUBLIC_ARC_CHAIN_ID: z.preprocess(emptyToUndef, z.coerce.number().int().positive().default(421614)),
  NEXT_PUBLIC_ARC_RPC_URL: z.preprocess(emptyToUndef, z.string().url().optional()),
  NEXT_PUBLIC_ARC_EXPLORER_URL: z.preprocess(emptyToUndef, z.string().url().optional()),
  NEXT_PUBLIC_POLYGON_CHAIN_ID: z.preprocess(emptyToUndef, z.coerce.number().int().positive().default(137)),
  NEXT_PUBLIC_POLYGON_RPC_URL: z.preprocess(
    emptyToUndef,
    z.string().url().default("https://polygon-rpc.com"),
  ),
  NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS: optionalAddress,
  NEXT_PUBLIC_USDC_ARC_ADDRESS: optionalAddress,
  NEXT_PUBLIC_INSIGHT_PRICE_USDC: z.preprocess(emptyToUndef, z.coerce.number().positive().default(0.01)),
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID: z.preprocess(emptyToUndef, z.string().optional().default("")),
});

export type PublicEnv = z.infer<typeof PublicEnvSchema>;

function readPublicEnv(): PublicEnv {
  // Must reference each NEXT_PUBLIC_* literally for Next.js inlining.
  return PublicEnvSchema.parse({
    NEXT_PUBLIC_ARC_CHAIN_ID: process.env.NEXT_PUBLIC_ARC_CHAIN_ID,
    NEXT_PUBLIC_ARC_RPC_URL: process.env.NEXT_PUBLIC_ARC_RPC_URL,
    NEXT_PUBLIC_ARC_EXPLORER_URL: process.env.NEXT_PUBLIC_ARC_EXPLORER_URL,
    NEXT_PUBLIC_POLYGON_CHAIN_ID: process.env.NEXT_PUBLIC_POLYGON_CHAIN_ID,
    NEXT_PUBLIC_POLYGON_RPC_URL: process.env.NEXT_PUBLIC_POLYGON_RPC_URL,
    NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS:
      process.env.NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS,
    NEXT_PUBLIC_USDC_ARC_ADDRESS: process.env.NEXT_PUBLIC_USDC_ARC_ADDRESS,
    NEXT_PUBLIC_INSIGHT_PRICE_USDC: process.env.NEXT_PUBLIC_INSIGHT_PRICE_USDC,
    NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID:
      process.env.NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID,
  });
}

export const publicEnv: PublicEnv = readPublicEnv();

const ServerEnvSchema = z.object({
  // Server-only Arc RPC (e.g. Canteen private RPC with token).
  // Falls back to NEXT_PUBLIC_ARC_RPC_URL if not provided.
  ARC_RPC_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  DEEPSEEK_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  DEEPSEEK_BASE_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : "https://api.deepseek.com")),
  DEEPSEEK_MODEL: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : "deepseek-chat")),
  TIKHUB_API_KEY: z.string().optional().transform((v) => (v ? v : undefined)),
  TIKHUB_BASE_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : "https://api.tikhub.io")),
  GAMMA_BASE_URL: z
    .string()
    .optional()
    .transform((v) =>
      v && v.length > 0 ? v : "https://gamma-api.polymarket.com",
    ),
  KV_REST_API_URL: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  KV_REST_API_TOKEN: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
  OPS_WALLET_PRIVATE_KEY: z
    .string()
    .optional()
    .transform((v) => (v && v.length > 0 ? v : undefined)),
});

export type ServerEnv = z.infer<typeof ServerEnvSchema>;

let _serverEnv: ServerEnv | undefined;

export function getServerEnv(): ServerEnv {
  if (typeof window !== "undefined") {
    throw new Error("getServerEnv() must not be called in the browser");
  }
  if (!_serverEnv) {
    _serverEnv = ServerEnvSchema.parse({
      ARC_RPC_URL: process.env.ARC_RPC_URL,
      DEEPSEEK_API_KEY: process.env.DEEPSEEK_API_KEY,
      DEEPSEEK_BASE_URL: process.env.DEEPSEEK_BASE_URL,
      DEEPSEEK_MODEL: process.env.DEEPSEEK_MODEL,
      TIKHUB_API_KEY: process.env.TIKHUB_API_KEY,
      TIKHUB_BASE_URL: process.env.TIKHUB_BASE_URL,
      GAMMA_BASE_URL: process.env.GAMMA_BASE_URL,
      KV_REST_API_URL: process.env.KV_REST_API_URL,
      KV_REST_API_TOKEN: process.env.KV_REST_API_TOKEN,
      OPS_WALLET_PRIVATE_KEY: process.env.OPS_WALLET_PRIVATE_KEY,
    });
  }
  return _serverEnv;
}

/**
 * Server-side feature flags. Computed on demand to avoid leaking flags into the
 * client bundle as static `false` values.
 */
export function getIntegrations() {
  if (typeof window !== "undefined") {
    return { hasDeepseek: false, hasTikhub: false, hasKv: false, hasVault: !!publicEnv.NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS };
  }
  return {
    hasDeepseek: !!process.env.DEEPSEEK_API_KEY,
    hasTikhub: !!process.env.TIKHUB_API_KEY,
    hasKv: !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN,
    hasVault: !!publicEnv.NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS,
  };
}

/** @deprecated Prefer getIntegrations() to avoid client/server confusion. */
export const integrations = {
  get hasDeepseek() { return !!process.env.DEEPSEEK_API_KEY; },
  get hasTikhub() { return !!process.env.TIKHUB_API_KEY; },
  get hasKv() {
    return !!process.env.KV_REST_API_URL && !!process.env.KV_REST_API_TOKEN;
  },
  get hasVault() { return !!process.env.NEXT_PUBLIC_PAYMENT_VAULT_ADDRESS; },
};
