"use client";

import { useEffect, useState } from "react";
import { DiagnosticCard, type DiagnosticDto } from "./DiagnosticCard";
import { SEVERITY_STYLES, VERDICT_STYLES } from "./verdict";

/* ---- serialized DTOs (bigints arrive as decimal strings) ---- */
interface HopDto {
  fromName: string;
  toName: string;
  channelOutpoint: string;
  capacity: string;
  feeRatePpm: string;
  fee: string;
  utilisation: number;
}
interface RouteDto {
  hops: HopDto[];
  totalFee: string;
  totalAmount: string;
  score: number;
  reasons: string[];
}
interface BottleneckDto {
  kind: string;
  severity: "info" | "warning" | "critical";
  message: string;
}
interface ReportDto {
  verdict: "likely" | "uncertain" | "unlikely" | "impossible";
  score: number;
  targetName: string;
  amount: string;
  assetLabel: string;
  routes: RouteDto[];
  bottlenecks: BottleneckDto[];
  suggestions: string[];
  graphAgeMs: number;
}
interface ExampleDto {
  label: string;
  target: string;
  amount: string;
  asset: string;
  expect: string;
}
interface PayResultDto {
  preflight: ReportDto | null;
  payment: { paymentHash: string | null; status: string; fee: string | null; rawError: string | null };
  diagnostic: DiagnosticDto | null;
}
interface AssetDto {
  assetId: string;
  label: string;
}

const fmtUnits = (base: string, label: string) => {
  const v = BigInt(base);
  const whole = v / 100_000_000n;
  const frac = v % 100_000_000n;
  const fracStr = frac === 0n ? "" : `.${frac.toString().padStart(8, "0").replace(/0+$/, "")}`;
  return `${whole}${fracStr} ${label}`;
};

export function PreflightTool() {
  const [target, setTarget] = useState("");
  const [amount, setAmount] = useState("100");
  const [asset, setAsset] = useState("CKB");
  const [assets, setAssets] = useState<AssetDto[]>([{ assetId: "CKB", label: "CKB" }]);
  const [examples, setExamples] = useState<ExampleDto[]>([]);
  const [busy, setBusy] = useState<"preflight" | "pay" | null>(null);
  const [report, setReport] = useState<ReportDto | null>(null);
  const [payResult, setPayResult] = useState<PayResultDto | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [diagnostic, setDiagnostic] = useState<DiagnosticDto | null>(null);

  useEffect(() => {
    fetch("/api/examples")
      .then((r) => r.json())
      .then((d) => setExamples(d.examples ?? []))
      .catch(() => {});
    fetch("/api/graph/summary")
      .then((r) => r.json())
      .then((d) => {
        if (d.ok && Array.isArray(d.summary?.assets)) {
          setAssets(d.summary.assets.map((a: AssetDto & { totalCapacity: string }) => ({ assetId: a.assetId, label: a.label })));
        }
      })
      .catch(() => {});
  }, []);

  const applyExample = (idx: number) => {
    const ex = examples[idx];
    if (!ex) return;
    setTarget(ex.target);
    setAmount(ex.amount);
    setAsset(ex.asset);
    setReport(null);
    setPayResult(null);
    setError(null);
    setDiagnostic(null);
  };

  const run = async (mode: "preflight" | "pay") => {
    setBusy(mode);
    setError(null);
    setDiagnostic(null);
    if (mode === "preflight") setPayResult(null);
    try {
      const res = await fetch(`/api/${mode}`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target, amount, asset: asset === "CKB" ? undefined : asset }),
      });
      const data = await res.json();
      if (!data.ok && data.error) {
        setError(data.error);
      } else if (!data.ok && data.diagnostic) {
        setDiagnostic(data.diagnostic);
      } else if (mode === "preflight") {
        setReport(data.report);
      } else {
        setPayResult(data);
        if (data.preflight) setReport(data.preflight);
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(null);
    }
  };

  const isInvoice = target.trim().toLowerCase().startsWith("fib");

  return (
    <div className="space-y-6">
      <section className="rounded-xl border p-5" style={{ background: "var(--surface)" }}>
        <h1 className="text-xl font-semibold tracking-tight">Can this payment succeed?</h1>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
          Pre-flight a Fiber payment before sending it: route discovery, confidence scoring and bottleneck
          analysis from the live channel graph.
        </p>

        {examples.length > 0 && (
          <div className="mt-4">
            <label className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
              Demo scenarios
            </label>
            <select
              className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              style={{ background: "var(--surface-2)", color: "var(--ink)" }}
              defaultValue=""
              onChange={(e) => applyExample(Number(e.target.value))}
            >
              <option value="" disabled>
                Pick a scenario to fill the form…
              </option>
              {examples.map((ex, i) => (
                <option key={i} value={i}>
                  {ex.label} (expect: {ex.expect})
                </option>
              ))}
            </select>
          </div>
        )}

        <div className="mt-4 grid gap-4 md:grid-cols-[1fr_170px_170px]">
          <div>
            <label className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
              Target node ID or Fiber invoice
            </label>
            <input
              className="mono mt-1 w-full rounded-lg border p-2.5 text-sm"
              style={{ background: "var(--surface-2)", color: "var(--ink)" }}
              placeholder="0x02… node id, or fibt… invoice"
              value={target}
              onChange={(e) => setTarget(e.target.value)}
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
              Amount {isInvoice && "(from invoice)"}
            </label>
            <input
              className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              style={{ background: "var(--surface-2)", color: "var(--ink)" }}
              value={amount}
              disabled={isInvoice}
              onChange={(e) => setAmount(e.target.value)}
              inputMode="decimal"
            />
          </div>
          <div>
            <label className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
              Asset {isInvoice && "(from invoice)"}
            </label>
            <select
              className="mt-1 w-full rounded-lg border p-2.5 text-sm"
              style={{ background: "var(--surface-2)", color: "var(--ink)" }}
              value={asset}
              disabled={isInvoice}
              onChange={(e) => setAsset(e.target.value)}
            >
              {assets.map((a) => (
                <option key={a.assetId} value={a.assetId}>
                  {a.label}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="mt-4 flex flex-wrap gap-3">
          <button
            onClick={() => run("preflight")}
            disabled={busy !== null || !target}
            className="rounded-lg px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            style={{ background: "var(--accent)", color: "#0a0e14" }}
          >
            {busy === "preflight" ? "Analysing…" : "Run preflight"}
          </button>
          <button
            onClick={() => run("pay")}
            disabled={busy !== null || !target}
            className="rounded-lg border px-4 py-2.5 text-sm font-semibold disabled:opacity-50"
            style={{ color: "var(--ink)" }}
          >
            {busy === "pay" ? "Paying…" : "Preflight + pay (testnet)"}
          </button>
        </div>
        {error && (
          <p className="mt-3 text-sm" style={{ color: "var(--status-critical)" }}>
            {error}
          </p>
        )}
      </section>

      {diagnostic && <DiagnosticCard diagnostic={diagnostic} />}

      {report && <ReportView report={report} />}

      {payResult && <PayOutcome result={payResult} />}
    </div>
  );
}

function ScoreMeter({ score, color }: { score: number; color: string }) {
  return (
    <div className="w-full" role="meter" aria-valuenow={score} aria-valuemin={0} aria-valuemax={100} aria-label="confidence score">
      <div className="h-2 w-full overflow-hidden rounded-full" style={{ background: "var(--surface-2)" }}>
        <div className="h-full rounded-full" style={{ width: `${score}%`, background: color }} />
      </div>
    </div>
  );
}

function ReportView({ report }: { report: ReportDto }) {
  const v = VERDICT_STYLES[report.verdict] ?? VERDICT_STYLES.uncertain!;
  return (
    <section className="rounded-xl border p-5" style={{ background: "var(--surface)" }}>
      <div className="flex flex-wrap items-center gap-3">
        <span
          className="flex h-8 w-8 items-center justify-center rounded-full text-lg font-bold"
          style={{ background: v.color, color: "#0a0e14" }}
          aria-hidden
        >
          {v.icon}
        </span>
        <div>
          <div className="text-lg font-semibold">{v.label}</div>
          <div className="text-sm" style={{ color: "var(--ink-2)" }}>
            {fmtUnits(report.amount, report.assetLabel)} → {report.targetName} · {v.blurb}
          </div>
        </div>
        <div className="ml-auto text-right">
          <div className="text-3xl font-bold tabular-nums" style={{ color: v.color }}>
            {report.score}
            <span className="text-base font-normal" style={{ color: "var(--ink-3)" }}>
              /100
            </span>
          </div>
          <div className="text-xs" style={{ color: "var(--ink-3)" }}>
            confidence score
          </div>
        </div>
      </div>
      <div className="mt-3">
        <ScoreMeter score={report.score} color={v.color} />
      </div>

      {report.routes.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
            Route candidates ({report.routes.length})
          </h3>
          <div className="mt-2 space-y-3">
            {report.routes.map((r, i) => (
              <div key={i} className="rounded-lg border p-4" style={{ background: "var(--surface-2)" }}>
                <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
                  <span className="font-semibold">Route {i + 1}</span>
                  <span style={{ color: "var(--ink-2)" }}>
                    {r.hops.length} hop{r.hops.length > 1 ? "s" : ""}
                  </span>
                  <span style={{ color: "var(--ink-2)" }}>fee {fmtUnits(r.totalFee, report.assetLabel)}</span>
                  <span className="ml-auto tabular-nums" style={{ color: "var(--ink-2)" }}>
                    route score {r.score}/100
                  </span>
                </div>
                <div className="mono mt-3 flex flex-wrap items-center gap-1 text-xs">
                  {r.hops.map((h, j) => (
                    <span key={j} className="flex items-center gap-1">
                      {j === 0 && (
                        <span className="rounded border px-2 py-1" style={{ color: "var(--ink)" }}>
                          {h.fromName}
                        </span>
                      )}
                      <span aria-hidden style={{ color: "var(--ink-3)" }}>
                        →
                      </span>
                      <span
                        className="rounded border px-2 py-1"
                        style={{ color: "var(--ink)" }}
                        title={`channel ${h.channelOutpoint.slice(0, 18)}… · cap ${fmtUnits(h.capacity, report.assetLabel)} · ${h.feeRatePpm} ppm · ${(h.utilisation * 100).toFixed(1)}% utilised`}
                      >
                        {h.toName}
                      </span>
                    </span>
                  ))}
                </div>
                <ul className="mt-2 list-disc pl-5 text-xs" style={{ color: "var(--ink-3)" }}>
                  {r.reasons.map((reason, j) => (
                    <li key={j}>{reason}</li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </div>
      )}

      {report.bottlenecks.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
            Bottlenecks
          </h3>
          <ul className="mt-2 space-y-2">
            {report.bottlenecks.map((b, i) => {
              const sev = SEVERITY_STYLES[b.severity] ?? SEVERITY_STYLES.warning!;
              return (
                <li key={i} className="flex items-start gap-2 text-sm">
                  <span
                    className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full text-xs font-bold"
                    style={{ background: sev.color, color: "#0a0e14" }}
                    aria-hidden
                  >
                    {sev.icon}
                  </span>
                  <span>
                    <span className="font-medium">{sev.label}:</span>{" "}
                    <span style={{ color: "var(--ink-2)" }}>{b.message}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {report.suggestions.length > 0 && (
        <div className="mt-6">
          <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
            Suggestions
          </h3>
          <ul className="mt-2 list-disc space-y-1 pl-5 text-sm" style={{ color: "var(--ink-2)" }}>
            {report.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}

function PayOutcome({ result }: { result: PayResultDto }) {
  const succeeded = result.payment.status === "Success";
  const color = succeeded ? "var(--status-good)" : "var(--status-critical)";
  const predicted = result.preflight?.verdict;
  return (
    <section className="rounded-xl border p-5" style={{ background: "var(--surface)" }}>
      <h3 className="text-sm font-semibold uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
        Payment attempt (testnet)
      </h3>
      <div className="mt-2 flex flex-wrap items-center gap-3">
        <span
          className="flex h-7 w-7 items-center justify-center rounded-full text-sm font-bold"
          style={{ background: color, color: "#0a0e14" }}
          aria-hidden
        >
          {succeeded ? "✓" : "✕"}
        </span>
        <span className="text-lg font-semibold">{result.payment.status}</span>
        {predicted && (
          <span className="rounded-full border px-3 py-1 text-xs" style={{ color: "var(--ink-2)" }}>
            preflight predicted: {predicted}
          </span>
        )}
        {result.payment.fee && succeeded && (
          <span className="text-sm" style={{ color: "var(--ink-2)" }}>
            fee paid: {fmtUnits(result.payment.fee, result.preflight?.assetLabel ?? "CKB")}
          </span>
        )}
      </div>
      {result.payment.paymentHash && (
        <p className="mono mt-2 break-all text-xs" style={{ color: "var(--ink-3)" }}>
          payment_hash: {result.payment.paymentHash}
        </p>
      )}
      {result.diagnostic && (
        <div className="mt-4">
          <DiagnosticCard diagnostic={result.diagnostic} />
        </div>
      )}
    </section>
  );
}
