"use client";

import { useEffect, useState } from "react";
import { DiagnosticCard, type DiagnosticDto } from "./DiagnosticCard";

interface SampleDto {
  label: string;
  raw: string;
}

export function ErrorDecoder() {
  const [raw, setRaw] = useState("");
  const [samples, setSamples] = useState<SampleDto[]>([]);
  const [diagnostic, setDiagnostic] = useState<DiagnosticDto | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    fetch("/api/explain")
      .then((r) => r.json())
      .then((d) => setSamples(d.samples ?? []))
      .catch(() => {});
  }, []);

  const decode = async (value?: string) => {
    const text = value ?? raw;
    if (!text.trim()) return;
    setBusy(true);
    try {
      const res = await fetch("/api/explain", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ error: text }),
      });
      const data = await res.json();
      if (data.ok) setDiagnostic(data.diagnostic);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <section className="rounded-xl border p-5" style={{ background: "var(--surface)" }}>
        <h1 className="text-xl font-semibold tracking-tight">Fiber error decoder</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
          Paste any raw Fiber payment error and get a structured diagnosis: what happened, wallet-ready copy,
          and what to do next. Pure translation — works without a node.
        </p>

        {samples.length > 0 && (
          <div className="mt-4">
            <label className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
              Try a sample error
            </label>
            <select
              className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              style={{ background: "var(--surface-2)", color: "var(--ink)" }}
              defaultValue=""
              onChange={(e) => {
                const s = samples[Number(e.target.value)];
                if (s) {
                  setRaw(s.raw);
                  void decode(s.raw);
                }
              }}
            >
              <option value="" disabled>
                Pick one of {samples.length} real failure shapes…
              </option>
              {samples.map((s, i) => (
                <option key={i} value={i}>
                  {s.label}
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-4">
          <label className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
            Raw error
          </label>
          <textarea
            className="mono mt-1 h-28 w-full rounded-lg border p-3 text-sm"
            style={{ background: "var(--surface-2)", color: "var(--ink)" }}
            placeholder='e.g. "Failed to send payment: no route found to destination node"'
            value={raw}
            onChange={(e) => setRaw(e.target.value)}
          />
        </div>
        <button
          onClick={() => decode()}
          disabled={busy || !raw.trim()}
          className="mt-3 rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
          style={{ background: "var(--accent)", color: "#0a0e14" }}
        >
          {busy ? "Decoding…" : "Decode error"}
        </button>
      </section>

      {diagnostic && <DiagnosticCard diagnostic={diagnostic} />}
    </div>
  );
}
