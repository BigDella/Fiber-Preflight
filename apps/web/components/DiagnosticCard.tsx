import { SEVERITY_STYLES } from "./verdict";

export interface DiagnosticDto {
  code: string;
  category: string;
  title: string;
  explanation: string;
  userMessage: string;
  suggestions: string[];
  severity: string;
  retryable: boolean;
  raw: string;
}

/** Structured rendering of a translated Fiber failure. */
export function DiagnosticCard({ diagnostic }: { diagnostic: DiagnosticDto }) {
  const sev = SEVERITY_STYLES[diagnostic.severity] ?? SEVERITY_STYLES.error!;
  return (
    <div className="rounded-xl border p-5" style={{ background: "var(--surface)" }}>
      <div className="flex flex-wrap items-center gap-2">
        <span
          className="flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold"
          style={{ background: sev.color, color: "#0a0e14" }}
          aria-hidden
        >
          {sev.icon}
        </span>
        <h3 className="text-lg font-semibold">{diagnostic.title}</h3>
        <span className="mono rounded border px-2 py-0.5 text-xs" style={{ color: "var(--ink-2)" }}>
          {diagnostic.code}
        </span>
        <span className="rounded border px-2 py-0.5 text-xs capitalize" style={{ color: "var(--ink-2)" }}>
          {diagnostic.category.replace("_", " ")}
        </span>
        <span className="rounded border px-2 py-0.5 text-xs" style={{ color: "var(--ink-2)" }}>
          {diagnostic.retryable ? "retryable" : "not retryable"}
        </span>
      </div>

      <div className="mt-4 rounded-lg border-l-4 p-3" style={{ borderLeftColor: sev.color, background: "var(--surface-2)" }}>
        <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
          Wallet-ready message
        </div>
        <p className="mt-1">{diagnostic.userMessage}</p>
      </div>

      <div className="mt-4">
        <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
          Technical explanation
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--ink-2)" }}>
          {diagnostic.explanation}
        </p>
      </div>

      {diagnostic.suggestions.length > 0 && (
        <div className="mt-4">
          <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
            Suggested next steps
          </div>
          <ul className="mt-1 list-disc space-y-1 pl-5 text-sm" style={{ color: "var(--ink-2)" }}>
            {diagnostic.suggestions.map((s, i) => (
              <li key={i}>{s}</li>
            ))}
          </ul>
        </div>
      )}

      <div className="mt-4">
        <div className="text-xs uppercase tracking-wide" style={{ color: "var(--ink-3)" }}>
          Raw error
        </div>
        <pre className="mono mt-1 overflow-x-auto rounded-lg border p-3 text-xs" style={{ color: "var(--ink-2)" }}>
          {diagnostic.raw}
        </pre>
      </div>
    </div>
  );
}
