import type { AssetId, ChannelEdge, NetworkGraph, RouteHop } from "./types.js";

/**
 * Pathfinding over the public channel graph.
 *
 * Dijkstra + Yen's algorithm for k loopless shortest paths. Costs are bigint:
 * cost(edge) = proportionalFee(amount) + HOP_PENALTY, so cheaper AND shorter
 * routes win. Feasibility is approximate by design — public gossip announces
 * total channel capacity, not directional balance (same limitation Lightning
 * pathfinders face); the scoring layer converts tight headroom into risk.
 */

/** Flat per-hop penalty (in asset base units) so hop count matters even at zero fee. */
export const HOP_PENALTY = 1_000n;
export const FEE_PPM_DENOMINATOR = 1_000_000n;

export function edgeFee(edge: ChannelEdge, amount: bigint): bigint {
  return (amount * edge.feeRatePpm) / FEE_PPM_DENOMINATOR;
}

export function edgeFeasible(edge: ChannelEdge, amount: bigint, asset: AssetId): boolean {
  if (!edge.enabled) return false;
  if (edge.asset !== asset) return false;
  // amount + this hop's fee must fit in the channel
  if (edge.capacity < amount + edgeFee(edge, amount)) return false;
  if (edge.tlcMinimumValue > 0n && amount < edge.tlcMinimumValue) return false;
  if (edge.tlcMaximumValue > 0n && amount > edge.tlcMaximumValue) return false;
  return true;
}

export interface FoundPath {
  edges: ChannelEdge[];
  cost: bigint;
}

interface DijkstraOptions {
  bannedEdges?: Set<string>; // key: `${channelOutpoint}|${from}`
  bannedNodes?: Set<string>;
  maxHops?: number;
}

export function edgeKey(e: ChannelEdge): string {
  return `${e.channelOutpoint}|${e.from}`;
}

/** Simple binary min-heap keyed on bigint cost. */
class MinHeap<T> {
  private items: { cost: bigint; value: T }[] = [];
  get size() {
    return this.items.length;
  }
  push(cost: bigint, value: T) {
    this.items.push({ cost, value });
    let i = this.items.length - 1;
    while (i > 0) {
      const parent = (i - 1) >> 1;
      if (this.items[parent]!.cost <= this.items[i]!.cost) break;
      [this.items[parent], this.items[i]] = [this.items[i]!, this.items[parent]!];
      i = parent;
    }
  }
  pop(): { cost: bigint; value: T } | undefined {
    const n = this.items.length;
    if (n === 0) return undefined;
    const top = this.items[0]!;
    const last = this.items.pop()!;
    if (n > 1) {
      this.items[0] = last;
      let i = 0;
      for (;;) {
        const l = 2 * i + 1;
        const r = 2 * i + 2;
        let smallest = i;
        if (l < this.items.length && this.items[l]!.cost < this.items[smallest]!.cost) smallest = l;
        if (r < this.items.length && this.items[r]!.cost < this.items[smallest]!.cost) smallest = r;
        if (smallest === i) break;
        [this.items[smallest], this.items[i]] = [this.items[i]!, this.items[smallest]!];
        i = smallest;
      }
    }
    return top;
  }
}

/**
 * Dijkstra from source to target for a fixed amount/asset.
 * Returns null when no feasible path exists.
 */
export function dijkstra(
  graph: NetworkGraph,
  source: string,
  target: string,
  amount: bigint,
  asset: AssetId,
  opts: DijkstraOptions = {},
): FoundPath | null {
  if (source === target) return { edges: [], cost: 0n };
  const maxHops = opts.maxHops ?? 8;

  const dist = new Map<string, bigint>();
  const prevEdge = new Map<string, ChannelEdge>();
  const hops = new Map<string, number>();
  const settled = new Set<string>();
  const heap = new MinHeap<string>();

  dist.set(source, 0n);
  hops.set(source, 0);
  heap.push(0n, source);

  while (heap.size > 0) {
    const { cost, value: u } = heap.pop()!;
    if (settled.has(u)) continue;
    settled.add(u);
    if (u === target) break;
    const uHops = hops.get(u) ?? 0;
    if (uHops >= maxHops) continue;

    for (const edge of graph.adjacency.get(u) ?? []) {
      if (opts.bannedEdges?.has(edgeKey(edge))) continue;
      if (opts.bannedNodes?.has(edge.to)) continue;
      if (settled.has(edge.to)) continue;
      if (!edgeFeasible(edge, amount, asset)) continue;

      const next = cost + edgeFee(edge, amount) + HOP_PENALTY;
      const known = dist.get(edge.to);
      if (known === undefined || next < known) {
        dist.set(edge.to, next);
        prevEdge.set(edge.to, edge);
        hops.set(edge.to, uHops + 1);
        heap.push(next, edge.to);
      }
    }
  }

  if (!prevEdge.has(target)) return null;

  const edges: ChannelEdge[] = [];
  let cur = target;
  while (cur !== source) {
    const e = prevEdge.get(cur);
    if (!e) return null;
    edges.unshift(e);
    cur = e.from;
  }
  return { edges, cost: dist.get(target)! };
}

/** Yen's algorithm: k loopless shortest paths. */
export function kShortestPaths(
  graph: NetworkGraph,
  source: string,
  target: string,
  amount: bigint,
  asset: AssetId,
  k = 5,
  maxHops = 8,
): FoundPath[] {
  const first = dijkstra(graph, source, target, amount, asset, { maxHops });
  if (!first || first.edges.length === 0) return first ? [first] : [];

  const paths: FoundPath[] = [first];
  const candidates: FoundPath[] = [];

  for (let ki = 1; ki < k; ki++) {
    const prevPath = paths[ki - 1]!;
    for (let i = 0; i < prevPath.edges.length; i++) {
      const spurNode = i === 0 ? source : prevPath.edges[i - 1]!.to;
      const rootEdges = prevPath.edges.slice(0, i);

      const bannedEdges = new Set<string>();
      for (const p of paths) {
        const pRoot = p.edges.slice(0, i);
        if (pRoot.length === rootEdges.length && pRoot.every((e, j) => edgeKey(e) === edgeKey(rootEdges[j]!))) {
          const spurEdge = p.edges[i];
          if (spurEdge) bannedEdges.add(edgeKey(spurEdge));
        }
      }
      const bannedNodes = new Set<string>();
      let node = source;
      for (const e of rootEdges) {
        bannedNodes.add(node);
        node = e.to;
      }

      const spur = dijkstra(graph, spurNode, target, amount, asset, {
        bannedEdges,
        bannedNodes,
        maxHops: maxHops - rootEdges.length,
      });
      if (!spur) continue;

      const totalEdges = [...rootEdges, ...spur.edges];
      let cost = 0n;
      for (const e of totalEdges) cost += edgeFee(e, amount) + HOP_PENALTY;

      const sig = totalEdges.map(edgeKey).join(">");
      const exists =
        paths.some((p) => p.edges.map(edgeKey).join(">") === sig) ||
        candidates.some((p) => p.edges.map(edgeKey).join(">") === sig);
      if (!exists) candidates.push({ edges: totalEdges, cost });
    }

    if (candidates.length === 0) break;
    candidates.sort((a, b) => (a.cost < b.cost ? -1 : a.cost > b.cost ? 1 : 0));
    paths.push(candidates.shift()!);
  }

  return paths;
}

/** Convert a found path into presentation-ready hops with per-hop fees. */
export function toRouteHops(graph: NetworkGraph, path: FoundPath, amount: bigint): RouteHop[] {
  return path.edges.map((e) => {
    const fee = edgeFee(e, amount);
    const nameOf = (id: string) => graph.nodes.get(id)?.name ?? `${id.slice(0, 12)}…`;
    return {
      from: e.from,
      fromName: nameOf(e.from),
      to: e.to,
      toName: nameOf(e.to),
      channelOutpoint: e.channelOutpoint,
      capacity: e.capacity,
      feeRatePpm: e.feeRatePpm,
      fee,
      utilisation: e.capacity > 0n ? Number((amount * 10_000n) / e.capacity) / 10_000 : 1,
    };
  });
}
