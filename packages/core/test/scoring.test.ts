import { describe, expect, it, beforeAll } from "vitest";
import {
  buildGraph,
  preflight,
  canPay,
  MockFiberClient,
  MOCK_ASSET_LABELS,
  MOCK_SELF_ID,
  RUSD_ASSET_ID,
  mockNodeId,
  SHANNONS_PER_CKB,
  type NetworkGraph,
} from "../src/index.js";

let graph: NetworkGraph;
beforeAll(async () => {
  graph = await buildGraph(new MockFiberClient(), { assetLabels: MOCK_ASSET_LABELS });
});

const CKB = (n: number) => BigInt(n) * SHANNONS_PER_CKB;

describe("preflight scoring", () => {
  it("healthy route -> likely with high score", () => {
    const r = preflight(graph, { source: MOCK_SELF_ID, target: mockNodeId(3), amount: CKB(100) });
    expect(r.verdict).toBe("likely");
    expect(r.score).toBeGreaterThanOrEqual(70);
    expect(r.routes.length).toBeGreaterThanOrEqual(2);
    expect(r.routes[0]!.totalFee).toBeGreaterThan(0n);
    expect(r.routes[0]!.totalAmount).toBe(CKB(100) + r.routes[0]!.totalFee);
  });

  it("chokepoint route -> low confidence with tight_capacity bottleneck", () => {
    const r = preflight(graph, { source: MOCK_SELF_ID, target: mockNodeId(9), amount: CKB(100) });
    expect(r.routes.length).toBeGreaterThan(0); // feasible...
    expect(r.verdict === "unlikely" || r.verdict === "uncertain").toBe(true); // ...but risky
    expect(r.score).toBeLessThan(70);
    expect(r.bottlenecks.some((b) => b.kind === "tight_capacity")).toBe(true);
    expect(r.bottlenecks.some((b) => b.kind === "single_route")).toBe(true);
  });

  it("island node -> impossible with no_channels bottleneck", () => {
    const r = preflight(graph, { source: MOCK_SELF_ID, target: mockNodeId(10), amount: CKB(1) });
    expect(r.verdict).toBe("impossible");
    expect(r.score).toBe(0);
    expect(r.routes).toEqual([]);
    expect(r.bottlenecks.some((b) => b.kind === "no_channels" && b.severity === "critical")).toBe(true);
    expect(r.suggestions.length).toBeGreaterThan(0);
  });

  it("wrong asset -> impossible (target has no RUSD channels)", () => {
    const r = preflight(graph, {
      source: MOCK_SELF_ID,
      target: mockNodeId(3),
      amount: CKB(10),
      asset: RUSD_ASSET_ID,
      assetLabels: MOCK_ASSET_LABELS,
    });
    expect(r.verdict).toBe("impossible");
    expect(r.assetLabel).toBe("RUSD");
    expect(r.bottlenecks.some((b) => b.kind === "no_channels")).toBe(true);
  });

  it("RUSD payment over the stablecoin subnet works", () => {
    const r = preflight(graph, {
      source: MOCK_SELF_ID,
      target: mockNodeId(12),
      amount: CKB(50),
      asset: RUSD_ASSET_ID,
      assetLabels: MOCK_ASSET_LABELS,
    });
    expect(r.verdict === "likely" || r.verdict === "uncertain").toBe(true);
    expect(r.routes.length).toBeGreaterThan(0);
  });

  it("amount larger than any capacity -> impossible with inbound bottleneck", () => {
    const r = preflight(graph, { source: MOCK_SELF_ID, target: mockNodeId(3), amount: CKB(50_000) });
    expect(r.verdict).toBe("impossible");
    expect(r.bottlenecks.some((b) => b.kind === "low_target_inbound" && b.severity === "critical")).toBe(true);
  });

  it("stale graph reduces confidence", () => {
    const stale: NetworkGraph = { ...graph, syncedAt: Date.now() - 3 * 60 * 60 * 1000 };
    const fresh = preflight(graph, { source: MOCK_SELF_ID, target: mockNodeId(3), amount: CKB(100) });
    const staleR = preflight(stale, { source: MOCK_SELF_ID, target: mockNodeId(3), amount: CKB(100) });
    expect(staleR.score).toBeLessThan(fresh.score);
    expect(staleR.bottlenecks.some((b) => b.kind === "stale_graph")).toBe(true);
  });

  it("canPay helper", () => {
    expect(canPay(graph, { source: MOCK_SELF_ID, target: mockNodeId(3), amount: CKB(100) })).toBe(true);
    expect(canPay(graph, { source: MOCK_SELF_ID, target: mockNodeId(10), amount: CKB(1) })).toBe(false);
  });

  it("route candidates carry human-readable reasons", () => {
    const r = preflight(graph, { source: MOCK_SELF_ID, target: mockNodeId(3), amount: CKB(100) });
    expect(r.routes[0]!.reasons.length).toBeGreaterThan(0);
    expect(r.routes[0]!.hops[0]!.fromName).toBe("preflight-demo-node");
  });
});
