/** Normalised domain types used by the graph, pathfinding, scoring and diagnostics modules. */

/** Asset identifier: "CKB" for the native asset, otherwise a stable hash of the UDT type script. */
export type AssetId = string;

export const CKB_ASSET: AssetId = "CKB";

export interface GraphNode {
  nodeId: string;
  name: string;
  addresses: string[];
  /** ms timestamp of the node announcement (0 if unknown). */
  timestamp: number;
}

/**
 * A directed edge (one direction of an announced channel).
 * `capacity` is the total channel capacity — public gossip does NOT reveal
 * directional balance, which is why scoring treats tight headroom as risk.
 */
export interface ChannelEdge {
  channelOutpoint: string;
  from: string;
  to: string;
  capacity: bigint;
  asset: AssetId;
  /** human label for the asset, e.g. "CKB" or the UDT symbol if known */
  assetLabel: string;
  /** proportional fee in parts-per-million charged by `from` for forwarding */
  feeRatePpm: bigint;
  tlcMinimumValue: bigint;
  /** 0n means "no announced maximum" */
  tlcMaximumValue: bigint;
  tlcExpiryDelta: bigint;
  enabled: boolean;
  /** ms timestamp of last update for this direction (0 if unknown) */
  lastUpdated: number;
}

export interface NetworkGraph {
  nodes: Map<string, GraphNode>;
  /** adjacency: nodeId -> outgoing edges */
  adjacency: Map<string, ChannelEdge[]>;
  /** every directed edge */
  edges: ChannelEdge[];
  /** distinct assets seen on channels */
  assets: Map<AssetId, { label: string; channelCount: number; totalCapacity: bigint }>;
  /** ms timestamp when this snapshot was built */
  syncedAt: number;
}

export interface RouteHop {
  from: string;
  fromName: string;
  to: string;
  toName: string;
  channelOutpoint: string;
  capacity: bigint;
  feeRatePpm: bigint;
  /** fee this hop charges for forwarding the amount, in asset base units */
  fee: bigint;
  /** amount / capacity as a 0-1 ratio (higher = tighter) */
  utilisation: number;
}

export interface RouteCandidate {
  hops: RouteHop[];
  totalFee: bigint;
  /** amount + totalFee the sender must be able to commit */
  totalAmount: bigint;
  /** 0-100 per-route confidence */
  score: number;
  reasons: string[];
}

export type BottleneckKind =
  | "no_channels"
  | "low_target_inbound"
  | "tight_capacity"
  | "single_route"
  | "disabled_channels"
  | "asset_unavailable"
  | "stale_graph"
  | "below_tlc_minimum";

export interface Bottleneck {
  kind: BottleneckKind;
  severity: "info" | "warning" | "critical";
  message: string;
  /** node or channel the bottleneck refers to, when applicable */
  subject?: string;
}

export type PreflightVerdict = "likely" | "uncertain" | "unlikely" | "impossible";

export interface PreflightReport {
  verdict: PreflightVerdict;
  /** aggregate 0-100 confidence score */
  score: number;
  source: string;
  target: string;
  targetName: string;
  amount: bigint;
  asset: AssetId;
  assetLabel: string;
  routes: RouteCandidate[];
  bottlenecks: Bottleneck[];
  suggestions: string[];
  /** ms age of the graph snapshot used */
  graphAgeMs: number;
  generatedAt: number;
}

export type DiagnosticCategory =
  | "routing"
  | "liquidity"
  | "connectivity"
  | "invoice"
  | "asset_mismatch"
  | "fees"
  | "timeout"
  | "unknown";

export type DiagnosticSeverity = "info" | "warning" | "error";

export interface DiagnosticResult {
  /** stable machine-readable code, e.g. "NO_ROUTE_FOUND" */
  code: string;
  category: DiagnosticCategory;
  /** short human title, e.g. "No route to destination" */
  title: string;
  /** technical explanation for developers/operators */
  explanation: string;
  /** wallet-ready copy safe to show end users */
  userMessage: string;
  suggestions: string[];
  severity: DiagnosticSeverity;
  retryable: boolean;
  /** the raw error string that was matched */
  raw: string;
}
