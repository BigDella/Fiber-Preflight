import { hexToBigInt } from "./hex.js";
import type {
  FiberClient,
  RawGraphChannel,
  RawGraphNode,
  RawChannelUpdateInfo,
  RawScript,
} from "./rpc/types.js";
import { CKB_ASSET, type AssetId, type ChannelEdge, type GraphNode, type NetworkGraph } from "./types.js";

/** Derive a stable AssetId from a UDT type script (or CKB when absent). */
export function assetIdOf(udt: RawScript | null | undefined): AssetId {
  if (!udt) return CKB_ASSET;
  return `udt:${udt.code_hash}:${udt.hash_type}:${udt.args}`;
}

/** Human label for an asset id; `labels` lets callers register known UDT symbols. */
export function assetLabelOf(assetId: AssetId, labels?: Record<string, string>): string {
  if (assetId === CKB_ASSET) return "CKB";
  const known = labels?.[assetId];
  if (known) return known;
  const args = assetId.split(":").pop() ?? "";
  return `UDT(${args.slice(0, 10)}…)`;
}

function toMs(ts: string | number | undefined): number {
  if (ts === undefined || ts === null) return 0;
  const n = typeof ts === "number" ? ts : Number(hexToBigInt(ts));
  // Fiber timestamps are ms already; guard against seconds-precision values.
  return n > 0 && n < 10_000_000_000 ? n * 1000 : n;
}

function pickUpdate(ch: RawGraphChannel, side: 1 | 2): RawChannelUpdateInfo | null {
  const a = side === 1 ? ch.update_info_of_node1 : ch.update_info_of_node2;
  const b = side === 1 ? ch.update_of_node1 : ch.update_of_node2;
  return a ?? b ?? null;
}

/** Build directed edges (both directions) from one announced channel. */
function edgesFromChannel(
  ch: RawGraphChannel,
  labels?: Record<string, string>,
): ChannelEdge[] {
  const node1 = ch.node1;
  const node2 = ch.node2;
  const outpoint = ch.channel_outpoint;
  if (!node1 || !node2 || !outpoint) return [];

  const capacity = hexToBigInt(ch.capacity);
  const asset = assetIdOf(ch.udt_type_script);
  const assetLabel = assetLabelOf(asset, labels);

  const build = (from: string, to: string, side: 1 | 2): ChannelEdge => {
    const upd = pickUpdate(ch, side);
    const legacyFee = side === 1 ? ch.fee_rate_of_node1 : ch.fee_rate_of_node2;
    const legacyTs = side === 1 ? ch.last_updated_timestamp_of_node1 : ch.last_updated_timestamp_of_node2;
    return {
      channelOutpoint: outpoint,
      from,
      to,
      capacity,
      asset,
      assetLabel,
      feeRatePpm: upd?.fee_rate !== undefined ? hexToBigInt(upd.fee_rate) : hexToBigInt(legacyFee),
      tlcMinimumValue: hexToBigInt(upd?.tlc_minimum_value),
      tlcMaximumValue: hexToBigInt(upd?.tlc_maximum_value),
      tlcExpiryDelta: hexToBigInt(upd?.tlc_expiry_delta),
      // Absent update info means "no evidence it's disabled" — treat as enabled.
      enabled: upd?.enabled !== false,
      lastUpdated: toMs(upd?.timestamp ?? legacyTs ?? ch.last_updated_timestamp ?? ch.created_timestamp),
    };
  };

  return [build(node1, node2, 1), build(node2, node1, 2)];
}

function normaliseNode(raw: RawGraphNode): GraphNode | null {
  const nodeId = raw.node_id ?? raw.public_key;
  if (!nodeId) return null;
  return {
    nodeId,
    name: raw.node_name || `${nodeId.slice(0, 12)}…`,
    addresses: raw.addresses ?? [],
    timestamp: toMs(raw.timestamp),
  };
}

export interface BuildGraphOptions {
  /** known UDT symbol registry: assetId -> label (e.g. "RUSD") */
  assetLabels?: Record<string, string>;
  /** page size for graph_nodes / graph_channels pagination */
  pageSize?: number;
}

/** Fetch the full gossip graph (paginated) and build the in-memory network graph. */
export async function buildGraph(client: FiberClient, opts: BuildGraphOptions = {}): Promise<NetworkGraph> {
  const pageSize = opts.pageSize ?? 500;

  const rawNodes: RawGraphNode[] = [];
  let cursor: string | undefined;
  for (;;) {
    const page = await client.graphNodes(pageSize, cursor);
    rawNodes.push(...(page.nodes ?? []));
    if (!page.last_cursor || (page.nodes ?? []).length < pageSize) break;
    if (page.last_cursor === cursor) break; // defensive: cursor not advancing
    cursor = page.last_cursor;
  }

  const rawChannels: RawGraphChannel[] = [];
  cursor = undefined;
  for (;;) {
    const page = await client.graphChannels(pageSize, cursor);
    rawChannels.push(...(page.channels ?? []));
    if (!page.last_cursor || (page.channels ?? []).length < pageSize) break;
    if (page.last_cursor === cursor) break;
    cursor = page.last_cursor;
  }

  return buildGraphFromRaw(rawNodes, rawChannels, opts);
}

/** Pure builder — used directly by tests and the mock client. */
export function buildGraphFromRaw(
  rawNodes: RawGraphNode[],
  rawChannels: RawGraphChannel[],
  opts: BuildGraphOptions = {},
): NetworkGraph {
  const nodes = new Map<string, GraphNode>();
  for (const raw of rawNodes) {
    const node = normaliseNode(raw);
    if (node) nodes.set(node.nodeId, node);
  }

  const adjacency = new Map<string, ChannelEdge[]>();
  const edges: ChannelEdge[] = [];
  const assets = new Map<AssetId, { label: string; channelCount: number; totalCapacity: bigint }>();

  for (const ch of rawChannels) {
    const chEdges = edgesFromChannel(ch, opts.assetLabels);
    if (chEdges.length === 0) continue;

    // ensure endpoint nodes exist even if their announcement wasn't seen
    for (const e of chEdges) {
      for (const id of [e.from, e.to]) {
        if (!nodes.has(id)) {
          nodes.set(id, { nodeId: id, name: `${id.slice(0, 12)}…`, addresses: [], timestamp: 0 });
        }
      }
    }

    const first = chEdges[0]!;
    const entry = assets.get(first.asset) ?? { label: first.assetLabel, channelCount: 0, totalCapacity: 0n };
    entry.channelCount += 1;
    entry.totalCapacity += first.capacity;
    assets.set(first.asset, entry);

    for (const e of chEdges) {
      edges.push(e);
      const list = adjacency.get(e.from);
      if (list) list.push(e);
      else adjacency.set(e.from, [e]);
    }
  }

  return { nodes, adjacency, edges, assets, syncedAt: Date.now() };
}

/** Summary counters for dashboards / API responses. */
export function graphSummary(graph: NetworkGraph) {
  return {
    nodeCount: graph.nodes.size,
    channelCount: graph.edges.length / 2,
    assets: [...graph.assets.entries()].map(([id, a]) => ({
      assetId: id,
      label: a.label,
      channelCount: a.channelCount,
      totalCapacity: a.totalCapacity,
    })),
    syncedAt: graph.syncedAt,
  };
}
