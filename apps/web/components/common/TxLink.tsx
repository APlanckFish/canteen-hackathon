"use client";

import { ExternalLink } from "lucide-react";
import { buildTxUrl, arcTestnet } from "@/lib/chains";
import { shortHash } from "@/lib/utils";
import { cn } from "@/lib/utils";

interface Props {
  hash?: string | null;
  /** Defaults to Arc Testnet (where the x402 settlement tx lives). */
  chainId?: number;
  /** When false, render the full hash instead of the abbreviated form. */
  short?: boolean;
  /** Optional label override; otherwise just the (short) hash text. */
  label?: string;
  /** Render a small external-link icon to the right. */
  withIcon?: boolean;
  className?: string;
}

/**
 * Click-through link to the configured block explorer for a tx hash.
 * Falls back to a non-clickable styled span when the hash is missing.
 */
export function TxLink({
  hash,
  chainId = arcTestnet.id,
  short = true,
  label,
  withIcon = true,
  className,
}: Props) {
  if (!hash) {
    return (
      <span className={cn("font-mono text-foreground-dim", className)}>—</span>
    );
  }
  const url = buildTxUrl(chainId, hash);
  const text = label ?? (short ? shortHash(hash) : hash);
  if (!url) {
    return (
      <span className={cn("font-mono text-foreground-muted", className)}>
        {text}
      </span>
    );
  }
  return (
    <a
      href={url}
      target="_blank"
      rel="noreferrer"
      className={cn(
        "inline-flex items-center gap-1 font-mono text-foreground-muted underline-offset-2 transition-colors hover:text-accent hover:underline",
        className,
      )}
      onClick={(e) => e.stopPropagation()}
      title={hash}
    >
      <span>{text}</span>
      {withIcon ? <ExternalLink className="h-3 w-3 opacity-70" /> : null}
    </a>
  );
}
