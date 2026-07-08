"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Tone = "accent" | "spark" | "success" | "danger" | "neutral";

const TONE_CLASSES: Record<Tone, string> = {
  accent: "text-accent-strong",
  spark: "text-spark",
  success: "text-success",
  danger: "text-danger",
  neutral: "text-ink",
};

export default function StatCard({
  label,
  value,
  hint,
  href,
  tone = "neutral",
  delay = 0,
}: {
  label: string;
  value: number | string;
  hint?: string;
  href?: string;
  tone?: Tone;
  delay?: number;
}) {
  const [display, setDisplay] = useState(typeof value === "number" ? 0 : value);

  useEffect(() => {
    if (typeof value !== "number") {
      setDisplay(value);
      return;
    }
    const duration = 600;
    const start = performance.now();
    let raf: number;
    function tick(now: number) {
      const t = Math.min(1, (now - start) / duration);
      const eased = 1 - Math.pow(1 - t, 3);
      setDisplay(Math.round(eased * (value as number)));
      if (t < 1) raf = requestAnimationFrame(tick);
    }
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value]);

  const inner = (
    <div
      className="count-in group relative overflow-hidden rounded-2xl border border-border bg-surface p-5 transition-colors hover:border-border-bright"
      style={{ animationDelay: `${delay}ms` }}
    >
      <p className="text-xs font-medium text-ink-faint">{label}</p>
      <p className={`mt-2 font-mono-num text-3xl font-semibold ${TONE_CLASSES[tone]}`}>
        {display}
      </p>
      {hint && <p className="mt-1 text-xs text-ink-dim">{hint}</p>}
      {href && (
        <span className="absolute right-4 top-4 text-ink-faint opacity-0 transition-opacity group-hover:opacity-100">
          →
        </span>
      )}
    </div>
  );

  if (href) {
    return (
      <Link href={href} className="block">
        {inner}
      </Link>
    );
  }
  return inner;
}
