import {
  buildGraph,
  FiberRpcClient,
  MockFiberClient,
  MOCK_ASSET_LABELS,
  type FiberClient,
  type NetworkGraph,
  type RawNodeInfo,
} from "@fiber-preflight/core";

/**
 * Server-side singleton: one Fiber client + a cached graph snapshot refreshed
 * at most every GRAPH_TTL_MS. Stored on globalThis so it survives Next.js HMR
 * and is shared across route handlers.
 */

const GRAPH_TTL_MS = 60_000;

export const IS_MOCK =
  process.env.FIBER_MOCK === "true" || (!process.env.FIBER_RPC_URL && process.env.FIBER_MOCK !== "false");

interface FiberState {
  client: FiberClient;
  graph: NetworkGraph | null;
  graphFetchedAt: number;
  refreshing: Promise<NetworkGraph> | null;
  selfNodeId: string | null;
  nodeInfo: RawNodeInfo | null;
}

const g = globalThis as unknown as { __fiberState?: FiberState };

function state(): FiberState {
  if (!g.__fiberState) {
    const client: FiberClient = IS_MOCK
      ? new MockFiberClient()
      : new FiberRpcClient({ url: process.env.FIBER_RPC_URL ?? "http://127.0.0.1:8227" });
    g.__fiberState = {
      client,
      graph: null,
      graphFetchedAt: 0,
      refreshing: null,
      selfNodeId: null,
      nodeInfo: null,
    };
  }
  return g.__fiberState;
}

export function getClient(): FiberClient {
  return state().client;
}

export const ASSET_LABELS = IS_MOCK ? MOCK_ASSET_LABELS : parseAssetLabels(process.env.FIBER_ASSET_LABELS);

/** FIBER_ASSET_LABELS="udt:0x..:type:0x..=USDI,udt:..=RUSD" lets operators name known UDTs. */
function parseAssetLabels(raw?: string): Record<string, string> {
  if (!raw) return {};
  const out: Record<string, string> = {};
  for (const pair of raw.split(",")) {
    const idx = pair.lastIndexOf("=");
    if (idx > 0) out[pair.slice(0, idx).trim()] = pair.slice(idx + 1).trim();
  }
  return out;
}

/** Cached graph snapshot; concurrent callers share one refresh. */
export async function getGraph(force = false): Promise<NetworkGraph> {
  const s = state();
  const fresh = s.graph && Date.now() - s.graphFetchedAt < GRAPH_TTL_MS;
  if (fresh && !force) return s.graph!;
  if (!s.refreshing) {
    s.refreshing = buildGraph(s.client, { assetLabels: ASSET_LABELS })
      .then((graph) => {
        s.graph = graph;
        s.graphFetchedAt = Date.now();
        return graph;
      })
      .finally(() => {
        s.refreshing = null;
      });
  }
  // if we have a stale copy, serve it rather than blocking on refresh errors
  try {
    return await s.refreshing;
  } catch (e) {
    if (s.graph) return s.graph;
    throw e;
  }
}

export async function getSelfNodeId(): Promise<string> {
  const s = state();
  if (s.selfNodeId) return s.selfNodeId;
  const info = await s.client.nodeInfo();
  s.nodeInfo = info;
  s.selfNodeId = info.node_id ?? "";
  return s.selfNodeId;
}

export async function getNodeInfo(): Promise<RawNodeInfo> {
  const s = state();
  const info = await s.client.nodeInfo();
  s.nodeInfo = info;
  s.selfNodeId = info.node_id ?? s.selfNodeId;
  return info;
}

/** JSON.stringify replacer that renders bigint as decimal strings. */
export function jsonSafe<T>(value: T): unknown {
  return JSON.parse(
    JSON.stringify(value, (_k, v) => (typeof v === "bigint" ? v.toString() : v instanceof Map ? Object.fromEntries(v) : v)),
  );
}
