import { describe, expect, it } from "vitest";
import {
  buildGraph,
  buildGraphFromRaw,
  graphSummary,
  hexToBigInt,
  bigIntToHex,
  formatCkb,
  parseCkb,
  MockFiberClient,
  MOCK_ASSET_LABELS,
  MOCK_SELF_ID,
  RUSD_ASSET_ID,
  mockNodeId,
  CKB_ASSET,
  SHANNONS_PER_CKB,
} from "../src/index.js";

describe("hex helpers", () => {
  it("decodes hex strings to bigint", () => {
    expect(hexToBigInt("0x5f5e100")).toBe(100_000_000n);
    expect(hexToBigInt("0x0")).toBe(0n);
  });
  it("tolerates junk, null and decimal strings", () => {
    expect(hexToBigInt(null)).toBe(0n);
    expect(hexToBigInt(undefined)).toBe(0n);
    expect(hexToBigInt("")).toBe(0n);
    expect(hexToBigInt("not-hex")).toBe(0n);
    expect(hexToBigInt("12345")).toBe(12345n);
    expect(hexToBigInt(42)).toBe(42n);
  });
  it("round-trips bigIntToHex", () => {
    expect(hexToBigInt(bigIntToHex(123456789n))).toBe(123456789n);
    expect(() => bigIntToHex(-1n)).toThrow();
  });
  it("formats and parses CKB amounts", () => {
    expect(formatCkb(150_000_000n)).toBe("1.5");
    expect(formatCkb(100n * SHANNONS_PER_CKB)).toBe("100");
    expect(parseCkb("1.5")).toBe(150_000_000n);
    expect(parseCkb("100")).toBe(100n * SHANNONS_PER_CKB);
    expect(() => parseCkb("abc")).toThrow();
  });
});

describe("graph builder", () => {
  it("builds the full mock graph via the client (pagination path)", async () => {
    const graph = await buildGraph(new MockFiberClient(), { assetLabels: MOCK_ASSET_LABELS });
    expect(graph.nodes.size).toBe(30);
    // every channel produces two directed edges
    expect(graph.edges.length % 2).toBe(0);
    expect(graph.edges.length).toBeGreaterThan(60);
    expect(graph.nodes.get(MOCK_SELF_ID)?.name).toBe("preflight-demo-node");
  });

  it("decodes hex capacities into bigint shannons", async () => {
    const graph = await buildGraph(new MockFiberClient());
    const selfEdges = graph.adjacency.get(MOCK_SELF_ID) ?? [];
    const toHub = selfEdges.find((e) => e.to === mockNodeId(1));
    expect(toHub?.capacity).toBe(10_000n * SHANNONS_PER_CKB);
  });

  it("tracks CKB and RUSD assets separately", async () => {
    const graph = await buildGraph(new MockFiberClient(), { assetLabels: MOCK_ASSET_LABELS });
    expect(graph.assets.has(CKB_ASSET)).toBe(true);
    expect(graph.assets.has(RUSD_ASSET_ID)).toBe(true);
    expect(graph.assets.get(RUSD_ASSET_ID)?.label).toBe("RUSD");
    expect(graph.assets.get(RUSD_ASSET_ID)?.channelCount).toBe(4);
  });

  it("respects disabled channel directions", async () => {
    const graph = await buildGraph(new MockFiberClient());
    const sleepy = mockNodeId(14);
    const fromSleepy = graph.adjacency.get(sleepy) ?? [];
    expect(fromSleepy.some((e) => !e.enabled)).toBe(true);
  });

  it("survives malformed channel records", () => {
    const graph = buildGraphFromRaw(
      [{ node_id: "0xaa", node_name: "a" }],
      [
        { node1: "0xaa" }, // missing node2/outpoint -> dropped
        { channel_outpoint: "0x01", node1: "0xaa", node2: "0xbb", capacity: "0x64" },
      ],
    );
    expect(graph.edges.length).toBe(2);
    // endpoint 0xbb synthesised even without a node announcement
    expect(graph.nodes.has("0xbb")).toBe(true);
  });

  it("produces a summary", async () => {
    const graph = await buildGraph(new MockFiberClient(), { assetLabels: MOCK_ASSET_LABELS });
    const summary = graphSummary(graph);
    expect(summary.nodeCount).toBe(30);
    expect(summary.channelCount).toBeGreaterThan(30);
    expect(summary.assets.length).toBe(2);
  });
});
