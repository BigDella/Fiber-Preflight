/** Shared verdict/status presentation tokens (status colors always ship with icon + label). */

export const VERDICT_STYLES: Record<
  string,
  { color: string; icon: string; label: string; blurb: string }
> = {
  likely: {
    color: "var(--status-good)",
    icon: "✓",
    label: "Likely to succeed",
    blurb: "Route conditions look healthy for this payment.",
  },
  uncertain: {
    color: "var(--status-warn)",
    icon: "~",
    label: "Uncertain",
    blurb: "A route exists but carries meaningful risk factors.",
  },
  unlikely: {
    color: "var(--status-serious)",
    icon: "!",
    label: "Unlikely to succeed",
    blurb: "Routes exist on paper but are badly constrained.",
  },
  impossible: {
    color: "var(--status-critical)",
    icon: "✕",
    label: "Impossible",
    blurb: "No feasible route exists in the current graph.",
  },
};

export const SEVERITY_STYLES: Record<string, { color: string; icon: string; label: string }> = {
  info: { color: "var(--accent)", icon: "i", label: "Info" },
  warning: { color: "var(--status-warn)", icon: "!", label: "Warning" },
  critical: { color: "var(--status-critical)", icon: "✕", label: "Critical" },
  error: { color: "var(--status-critical)", icon: "✕", label: "Error" },
};
