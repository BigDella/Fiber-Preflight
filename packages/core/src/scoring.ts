import { formatCkb } from "./hex.js";
import { kShortestPaths, toRouteHops, edgeFeasible } from "./pathfinding.js";
import {
  CKB_ASSET,
  type AssetId,
  type Bottleneck,
  type NetworkGraph,
  type PreflightReport,
  type PreflightVerdict,
  type RouteCandidate,
} from "./types.js";
import { assetLabelOf } from "./graph.js";

/**
 * Confidence scoring heuristics (documented in docs/scoring.md).
 *
 * IMPORTANT HONESTY NOTE: gossip announces TOTAL channel capacity, not the
 * directional balance, so a "feasible" route can still fail if liquidity sits
 * on the wrong side. This is the same fundamental limitation Lightning
 * pathfinders have. The score therefore expresses *likelihood*, never a
 * guarantee — tight capacity headroom is penalised because it leaves less
 * room for the unknown balance split to be favourable.
 *
 * Per-route score starts at 100 and applies multiplicative penalties:
 *  - capacity headroom: worst hop utilisation u = amount/capacity.
 *      u <= 0.1 → no penalty; u = 0.5 → ~35% penalty; u >= 0.9 → ~80% penalty
 *  - hop count: each hop beyond the first costs 7%.
 * Aggregate score = best route score adjusted by:
 *  - route diversity: 1 disjoint route → -15; 2 → -5; 3+ → 0
 *  - target connectivity: target with 1 channel → -15, thin inbound capacity → -10
 *  - graph staleness: > 30 min → -10, > 2 h → -25
 * Verdict: >=70 likely, >=40 uncertain, >0 unlikely (routes exist but risky),
 * no routes → impossible (score 0).
 */

export interface PreflightInput {
  source: string;
  target: string;
  amount: bigint;
  asset?: AssetId;
  k?: number;
  maxHops?: number;
  assetLabels?: Record<string, string>;
}

function headroomPenalty(worstUtilisation: number): number {
  const u = Math.min(Math.max(worstUtilisation, 0), 1);
  if (u <= 0.1) return 0;
  // smooth ramp: 0 at u=0.1 → 0.8 at u=0.9+
  return Math.min(0.8, ((u - 0.1) / 0.8) * 0.8);
}

export function scoreRoute(hops: ReturnType<typeof toRouteHops>): { score: number; reasons: string[] } {
  const reasons: string[] = [];
  let score = 100;

  const worstU = Math.max(...hops.map((h) => h.utilisation));
  const hp = headroomPenalty(worstU);
  if (hp > 0) {
    score *= 1 - hp;
    reasons.push(
      `Tightest hop uses ${(worstU * 100).toFixed(1)}% of announced channel capacity — directional balance is unknown, so tight headroom is risky`,
    );
  } else {
    reasons.push(`Comfortable capacity headroom (worst hop utilisation ${(worstU * 100).toFixed(1)}%)`);
  }

  const extraHops = hops.length - 1;
  if (extraHops > 0) {
    score *= Math.pow(0.93, extraHops);
    reasons.push(`${hops.length} hops — each additional hop adds forwarding risk`);
  } else {
    reasons.push("Direct channel to target (single hop)");
  }

  return { score: Math.round(Math.max(0, Math.min(100, score))), reasons };
}

/** Count routes that share no channel with a higher-ranked route. */
function countDisjointRoutes(routes: RouteCandidate[]): number {
  const used = new Set<string>();
  let disjoint = 0;
  for (const r of routes) {
    if (r.hops.every((h) => !used.has(h.channelOutpoint))) {
      disjoint++;
      for (const h of r.hops) used.add(h.channelOutpoint);
    }
  }
  return disjoint;
}

/** Run the full preflight analysis against a graph snapshot. */
export function preflight(graph: NetworkGraph, input: PreflightInput): PreflightReport {
  const asset = input.asset ?? CKB_ASSET;
  const assetLabel = assetLabelOf(asset, input.assetLabels);
  const { source, target, amount } = input;
  const now = Date.now();
  const graphAgeMs = Math.max(0, now - graph.syncedAt);

  const bottlenecks: Bottleneck[] = [];
  const suggestions: string[] = [];
  const targetName = graph.nodes.get(target)?.name ?? `${target.slice(0, 12)}…`;

  const fmtAmount = asset === CKB_ASSET ? `${formatCkb(amount)} CKB` : `${amount} ${assetLabel}`;

  // ---- structural checks -------------------------------------------------
  if (!graph.assets.has(asset)) {
    bottlenecks.push({
      kind: "asset_unavailable",
      severity: "critical",
      message: `No public channels carry ${assetLabel} — the network cannot route this asset at all`,
    });
  }

  const targetIn = graph.edges.filter((e) => e.to === target && e.asset === asset);
  if (targetIn.length === 0) {
    bottlenecks.push({
      kind: "no_channels",
      severity: "critical",
      message: `Target ${targetName} has no public ${assetLabel} channels — it cannot receive this asset`,
      subject: target,
    });
    suggestions.push(`Ask the recipient to open a ${assetLabel} channel with a well-connected node`);
  } else {
    const inboundCap = targetIn.reduce((acc, e) => acc + e.capacity, 0n);
    if (inboundCap < amount) {
      bottlenecks.push({
        kind: "low_target_inbound",
        severity: "critical",
        message: `Target's total ${assetLabel} channel capacity (${asset === CKB_ASSET ? formatCkb(inboundCap) + " CKB" : inboundCap}) is below the payment amount (${fmtAmount})`,
        subject: target,
      });
      suggestions.push("Reduce the amount, or split the payment into smaller parts");
    } else if (targetIn.length === 1) {
      bottlenecks.push({
        kind: "low_target_inbound",
        severity: "warning",
        message: `Target has a single public ${assetLabel} channel — one uncooperative peer blocks all payments`,
        subject: target,
      });
    }
    const belowMin = targetIn.every((e) => e.tlcMinimumValue > 0n && amount < e.tlcMinimumValue);
    if (belowMin) {
      bottlenecks.push({
        kind: "below_tlc_minimum",
        severity: "critical",
        message: `Amount is below the minimum TLC value on every channel into the target`,
        subject: target,
      });
      suggestions.push("Increase the payment amount above the channel minimums");
    }
  }

  const disabledIntoTarget = graph.edges.filter((e) => e.to === target && e.asset === asset && !e.enabled);
  if (disabledIntoTarget.length > 0 && targetIn.length > 0) {
    bottlenecks.push({
      kind: "disabled_channels",
      severity: "warning",
      message: `${disabledIntoTarget.length} channel(s) into the target are currently disabled`,
      subject: target,
    });
  }

  if (graphAgeMs > 2 * 60 * 60 * 1000) {
    bottlenecks.push({
      kind: "stale_graph",
      severity: "warning",
      message: `Graph snapshot is ${Math.round(graphAgeMs / 60000)} minutes old — channel states may have changed`,
    });
  }

  // ---- pathfinding -------------------------------------------------------
  const paths = kShortestPaths(graph, source, target, amount, asset, input.k ?? 5, input.maxHops ?? 8);

  const routes: RouteCandidate[] = paths
    .filter((p) => p.edges.length > 0)
    .map((p) => {
      const hops = toRouteHops(graph, p, amount);
      const { score, reasons } = scoreRoute(hops);
      const totalFee = hops.reduce((acc, h) => acc + h.fee, 0n);
      return { hops, totalFee, totalAmount: amount + totalFee, score, reasons };
    });

  // ---- aggregate ---------------------------------------------------------
  let verdict: PreflightVerdict;
  let score: number;

  if (routes.length === 0) {
    verdict = "impossible";
    score = 0;
    if (bottlenecks.every((b) => b.severity !== "critical")) {
      bottlenecks.push({
        kind: "no_channels",
        severity: "critical",
        message: `No feasible route from source to ${targetName} for ${fmtAmount} — every candidate path fails on capacity, asset or channel state`,
      });
    }
    suggestions.push(
      "Try a smaller amount to see whether capacity is the constraint",
      "Check that your node has an open, funded channel with sufficient outbound balance",
    );
  } else {
    score = Math.max(...routes.map((r) => r.score));

    const disjoint = countDisjointRoutes([...routes].sort((a, b) => b.score - a.score));
    if (disjoint === 1) {
      score -= 15;
      bottlenecks.push({
        kind: "single_route",
        severity: "warning",
        message: "All candidate routes share the same channels — a single failure point blocks payment",
      });
      suggestions.push("Consider opening an additional channel to improve route diversity");
    } else if (disjoint === 2) {
      score -= 5;
    }

    if (targetIn.length === 1) score -= 15;
    else {
      const inboundCap = targetIn.reduce((acc, e) => acc + e.capacity, 0n);
      if (inboundCap < amount * 2n) score -= 10;
    }

    if (graphAgeMs > 2 * 60 * 60 * 1000) score -= 25;
    else if (graphAgeMs > 30 * 60 * 1000) score -= 10;

    const tightest = Math.max(...routes[0]!.hops.map((h) => h.utilisation));
    if (tightest > 0.5) {
      bottlenecks.push({
        kind: "tight_capacity",
        severity: tightest > 0.85 ? "critical" : "warning",
        message: `Best route pushes ${(tightest * 100).toFixed(0)}% of a channel's announced capacity through one hop`,
        subject: routes[0]!.hops.reduce((a, b) => (a.utilisation > b.utilisation ? a : b)).channelOutpoint,
      });
      suggestions.push("If the payment fails, retry with a smaller amount or in multiple parts");
    }

    score = Math.round(Math.max(1, Math.min(100, score)));
    verdict = score >= 70 ? "likely" : score >= 40 ? "uncertain" : "unlikely";
  }

  if (verdict === "likely" && suggestions.length === 0) {
    suggestions.push("Route conditions look good — proceed with the payment");
  }

  return {
    verdict,
    score,
    source,
    target,
    targetName,
    amount,
    asset,
    assetLabel,
    routes,
    bottlenecks,
    suggestions,
    graphAgeMs,
    generatedAt: now,
  };
}

/** Quick boolean helper for wallet integrations: "can I (probably) pay?" */
export function canPay(graph: NetworkGraph, input: PreflightInput): boolean {
  const report = preflight(graph, input);
  return report.verdict === "likely" || report.verdict === "uncertain";
}

/** Expose feasibility check for external tooling. */
export { edgeFeasible };
