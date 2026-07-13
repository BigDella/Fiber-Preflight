"use client";

import { useEffect, useState } from "react";

interface Health {
  ok: boolean;
  mock: boolean;
  node?: { nodeName?: string; peersCount?: string; channelCount?: string };
}

interface Summary {
  nodeCount: number;
  channelCount: number;
  graphAgeMs: number;
}

/** Compact live strip proving node connectivity + graph sync (header widget). */
export function NetworkSnapshot() {
  const [health, setHealth] = useState<Health | null>(null);
  const [summary, setSummary] = useState<Summary | null>(null);

  useEffect(() => {
    let cancelled = false;
    const load = async () => {
      try {
        const [h, s] = await Promise.all([
          fetch("/api/health").then((r) => r.json()),
          fetch("/api/graph/summary").then((r) => r.json()),
        ]);
        if (!cancelled) {
          setHealth(h);
          setSummary(s.ok ? s.summary : null);
        }
      } catch {
        if (!cancelled) setHealth({ ok: false, mock: false });
      }
    };
    load();
    const t = setInterval(load, 30_000);
    return () => {
      cancelled = true;
      clearInterval(t);
    };
  }, []);

  const dotColor = health == null ? "var(--ink-3)" : health.ok ? "var(--status-good)" : "var(--status-critical)";
  const label = health == null ? "connecting…" : health.ok ? (health.mock ? "mock network" : "node online") : "node offline";

  return (
    <div className="flex items-center gap-3 text-xs" style={{ color: "var(--ink-2)" }}>
      {summary && (
        <span className="hidden sm:inline mono">
          {summary.nodeCount} nodes · {summary.channelCount} channels · graph {Math.round(summary.graphAgeMs / 1000)}s old
        </span>
      )}
      <span className="flex items-center gap-1.5 rounded-full border px-2.5 py-1" style={{ background: "var(--surface-2)" }}>
        <span aria-hidden className="inline-block h-2 w-2 rounded-full" style={{ background: dotColor }} />
        {label}
      </span>
    </div>
  );
}
