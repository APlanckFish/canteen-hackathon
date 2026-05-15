"use client";

import { cn } from "@/lib/utils";

interface Props {
  yesProb: number; // 0..1
  size?: "sm" | "md" | "lg";
  className?: string;
}

export function ProbabilityBar({ yesProb, size = "md", className }: Props) {
  const noProb = 1 - yesProb;
  const heights: Record<string, string> = { sm: "h-1", md: "h-1.5", lg: "h-2.5" };

  return (
    <div className={cn("w-full", className)}>
      <div className={cn("relative w-full overflow-hidden rounded-full bg-white/5", heights[size])}>
        <div
          className="absolute inset-y-0 left-0 bg-gradient-to-r from-yes/80 to-yes-glow"
          style={{ width: `${yesProb * 100}%` }}
        />
        <div
          className="absolute inset-y-0 right-0 bg-gradient-to-l from-no/70 to-no-glow/70"
          style={{ width: `${noProb * 100}%` }}
        />
      </div>
    </div>
  );
}

export function ProbabilityPills({ yesProb }: { yesProb: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <span className="pill-yes">YES {Math.round(yesProb * 100)}%</span>
      <span className="pill-no">NO {Math.round((1 - yesProb) * 100)}%</span>
    </div>
  );
}
