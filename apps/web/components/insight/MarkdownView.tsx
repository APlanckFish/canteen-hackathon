"use client";

import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";
import { cn } from "@/lib/utils";
import type { EvidenceItem } from "@canteen/shared/insight";

interface Props {
  source: string;
  /** Optional evidence list — used to turn (N) citations into clickable refs. */
  evidences?: EvidenceItem[];
  className?: string;
}

/**
 * Lightweight markdown renderer with project-themed styling.
 *
 * If `evidences` is provided, inline `(1)` / `(2)` / `(3,5)` style references
 * are rewritten into proper markdown links pointing at `#evidence-N`. The
 * EvidencePanel marks every row with that id so the page scrolls into view
 * when a citation is clicked.
 */
export function MarkdownView({ source, evidences, className }: Props) {
  const rendered = evidences?.length
    ? linkifyCitations(source, evidences.length)
    : source;

  return (
    <div className={cn("md-body text-sm leading-relaxed", className)}>
      <ReactMarkdown
        remarkPlugins={[remarkGfm]}
        components={{
          h1: ({ ...props }) => (
            <h1
              className="mt-5 mb-3 text-xl font-bold text-white tracking-tight"
              {...props}
            />
          ),
          h2: ({ ...props }) => (
            <h2
              className="mt-6 mb-3 flex items-center gap-2 border-b border-border pb-2 text-base font-semibold text-white"
              {...props}
            />
          ),
          h3: ({ ...props }) => (
            <h3
              className="mt-4 mb-2 inline-flex items-center gap-2 rounded-md bg-white/5 px-2 py-1 text-[13px] font-semibold text-white"
              {...props}
            />
          ),
          p: ({ ...props }) => (
            <p className="my-2 text-foreground" {...props} />
          ),
          ul: ({ ...props }) => (
            <ul
              className="my-2 ml-1 list-none space-y-1.5 [&>li]:relative [&>li]:pl-4"
              {...props}
            />
          ),
          ol: ({ ...props }) => (
            <ol
              className="my-2 ml-5 list-decimal space-y-1.5 marker:text-foreground-dim"
              {...props}
            />
          ),
          li: ({ children, ...props }) => (
            <li className="text-foreground" {...props}>
              <span className="absolute left-0 top-2 h-1 w-1 rounded-full bg-accent/70" />
              {children}
            </li>
          ),
          strong: ({ ...props }) => (
            <strong className="font-semibold text-white" {...props} />
          ),
          em: ({ ...props }) => (
            <em className="italic text-foreground-muted" {...props} />
          ),
          a: ({ href, children, ...rest }) => {
            // Internal evidence references use #evidence-N — keep them in-page
            // and smooth-scroll via JS so the rest of the layout is preserved.
            if (typeof href === "string" && href.startsWith("#evidence-")) {
              return (
                <a
                  href={href}
                  onClick={(e) => {
                    e.preventDefault();
                    const id = href.slice(1);
                    const el = document.getElementById(id);
                    if (el) {
                      el.scrollIntoView({ behavior: "smooth", block: "center" });
                      el.classList.add("evidence-flash");
                      setTimeout(
                        () => el.classList.remove("evidence-flash"),
                        1500,
                      );
                    }
                  }}
                  className="mx-0.5 inline-flex items-center rounded-md bg-accent/15 px-1.5 py-px font-mono text-[11px] font-semibold text-accent ring-1 ring-accent/30 transition-colors hover:bg-accent/30 hover:text-white"
                  {...rest}
                >
                  {children}
                </a>
              );
            }
            return (
              <a
                className="text-accent underline-offset-2 hover:underline"
                target="_blank"
                rel="noreferrer"
                href={href}
                {...rest}
              >
                {children}
              </a>
            );
          },
          blockquote: ({ ...props }) => (
            <blockquote
              className="my-3 border-l-2 border-accent/50 pl-3 italic text-foreground-muted"
              {...props}
            />
          ),
          code: ({ children, ...props }) => (
            <code
              className="rounded bg-white/10 px-1.5 py-0.5 text-[0.85em] text-accent-glow font-mono"
              {...props}
            >
              {children}
            </code>
          ),
          pre: ({ children, ...props }) => (
            <pre
              className="my-3 overflow-x-auto rounded-lg border border-border bg-background-elevated/60 p-3 text-xs"
              {...props}
            >
              {children}
            </pre>
          ),
          hr: ({ ...props }) => (
            <hr className="my-4 border-border" {...props} />
          ),
          table: ({ ...props }) => (
            <div className="my-3 overflow-x-auto rounded-lg border border-border">
              <table className="w-full text-xs" {...props} />
            </div>
          ),
          th: ({ ...props }) => (
            <th
              className="bg-white/5 px-3 py-2 text-left font-semibold text-white"
              {...props}
            />
          ),
          td: ({ ...props }) => (
            <td
              className="border-t border-border px-3 py-2 text-foreground-muted"
              {...props}
            />
          ),
        }}
      >
        {rendered}
      </ReactMarkdown>
    </div>
  );
}

/**
 * Rewrite `(1)` / `(2, 3)` / `(1,2,3)` patterns into markdown links pointing
 * at `#evidence-N`. We're conservative:
 *   - only digits and commas/spaces inside the parens
 *   - each number must be in [1, total]
 *   - skip patterns inside fenced code blocks (those carry the verdict JSON)
 */
function linkifyCitations(md: string, total: number): string {
  // Strip fenced code blocks first so we don't touch JSON / code samples.
  const codeBlocks: string[] = [];
  const stripped = md.replace(/```[\s\S]*?```/g, (block) => {
    codeBlocks.push(block);
    return `\u0000CB${codeBlocks.length - 1}\u0000`;
  });

  const transformed = stripped.replace(
    /\(\s*(\d+(?:\s*,\s*\d+)*)\s*\)/g,
    (full, group: string) => {
      const nums = group
        .split(/[,\s]+/)
        .map((s) => parseInt(s, 10))
        .filter((n) => Number.isFinite(n) && n >= 1 && n <= total);
      if (nums.length === 0) return full;
      // Render each number as its own link, comma-separated, wrapped in parens.
      const links = nums.map((n) => `[(${n})](#evidence-${n})`).join(" ");
      return links;
    },
  );

  // Restore code blocks.
  return transformed.replace(/\u0000CB(\d+)\u0000/g, (_, i) => codeBlocks[Number(i)]);
}
