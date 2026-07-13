import { describe, expect, it, beforeAll } from "vitest";
import {
  buildGraph,
  dijkstra,
  kShortestPaths,
  edgeFee,
  MockFiberClient,
  MOCK_SELF_ID,
  RUSD_ASSET_ID,
  mockNodeId,
  CKB_ASSET,
  SHANNONS_PER_CKB,
  type NetworkGraph,
} from "../src/index.js";

let graph: NetworkGraph;
beforeAll(async () => {
  graph = await buildGraph(new MockFiberClient());
});

const CKB = (n: number) => BigInt(n) * SHANNONS_PER_CKB;

describe("dijkstra", () => {
  it("finds a route to a well-connected merchant", () => {
    const path = dijkstra(graph, MOCK_SELF_ID, mockNodeId(3), CKB(100), CKB_ASSET);
    expect(path).not.toBeNull();
    expect(path!.edges.length).toBe(2); // self -> hub -> merchant
    expect(path!.edges[0]!.from).toBe(MOCK_SELF_ID);
    expect(path!.edges.at(-1)!.to).toBe(mockNodeId(3));
  });

  it("returns null for an island node with no channels", () => {
    expect(dijkstra(graph, MOCK_SELF_ID, mockNodeId(10), CKB(1), CKB_ASSET)).toBeNull();
  });

  it("respects channel capacity (chokepoint)", () => {
    // remote-village is only reachable via a 120 CKB channel
    expect(dijkstra(graph, MOCK_SELF_ID, mockNodeId(9), CKB(50), CKB_ASSET)).not.toBeNull();
    expect(dijkstra(graph, MOCK_SELF_ID, mockNodeId(9), CKB(200), CKB_ASSET)).toBeNull();
  });

  it("filters edges by asset", () => {
    // rusd-merchant reachable with RUSD, not with CKB
    expect(dijkstra(graph, MOCK_SELF_ID, mockNodeId(12), CKB(10), RUSD_ASSET_ID)).not.toBeNull();
    expect(dijkstra(graph, MOCK_SELF_ID, mockNodeId(12), CKB(10), CKB_ASSET)).toBeNull();
  });

  it("never routes through a disabled direction", () => {
    // sleepy-peer (14): inbound from hub is enabled, its own outbound is disabled;
    // a route TO sleepy-peer works, but nothing may exit through it.
    const to = dijkstra(graph, MOCK_SELF_ID, mockNodeId(14), CKB(10), CKB_ASSET);
    expect(to).not.toBeNull();
    for (const e of to!.edges) expect(e.enabled).toBe(true);
  });

  it("respects tlc_minimum_value", () => {
    // chokepoint channel has tlcMin 1000 shannons; below that no route
    expect(dijkstra(graph, MOCK_SELF_ID, mockNodeId(9), 500n, CKB_ASSET)).toBeNull();
  });
});

describe("kShortestPaths (Yen)", () => {
  it("finds multiple distinct routes to a merchant", () => {
    const paths = kShortestPaths(graph, MOCK_SELF_ID, mockNodeId(3), CKB(100), CKB_ASSET, 5);
    expect(paths.length).toBeGreaterThanOrEqual(2);
    const sigs = new Set(paths.map((p) => p.edges.map((e) => `${e.channelOutpoint}|${e.from}`).join(">")));
    expect(sigs.size).toBe(paths.length); // all unique
    // sorted by cost ascending
    for (let i = 1; i < paths.length; i++) {
      expect(paths[i]!.cost >= paths[i - 1]!.cost).toBe(true);
    }
  });

  it("paths are loopless", () => {
    const paths = kShortestPaths(graph, MOCK_SELF_ID, mockNodeId(5), CKB(100), CKB_ASSET, 5);
    for (const p of paths) {
      const visited = new Set<string>([MOCK_SELF_ID]);
      for (const e of p.edges) {
        expect(visited.has(e.to)).toBe(false);
        visited.add(e.to);
      }
    }
  });

  it("returns empty for unreachable target", () => {
    expect(kShortestPaths(graph, MOCK_SELF_ID, mockNodeId(10), CKB(1), CKB_ASSET)).toEqual([]);
  });
});

describe("fees", () => {
  it("computes proportional ppm fees", () => {
    const edge = graph.adjacency.get(mockNodeId(1))!.find((e) => e.to === mockNodeId(3))!;
    // hub-alpha charges 1000 ppm
    expect(edgeFee(edge, CKB(100))).toBe((CKB(100) * 1000n) / 1_000_000n);
  });
});
