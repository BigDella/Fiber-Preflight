import type { RawGraphChannel, RawGraphNode, RawScript } from "../rpc/types.js";
import { bigIntToHex, SHANNONS_PER_CKB } from "../hex.js";
import { assetIdOf } from "../graph.js";

/**
 * Deterministic synthetic testnet graph: ~30 nodes, ~90 directed edges.
 * Deliberately includes:
 *  - a well-connected hub pair (hub-alpha / hub-beta)
 *  - a low-capacity chokepoint (chokepoint-bridge -> remote-village, 120 CKB)
 *  - an island node with no channels (unreachable)
 *  - a disabled channel direction (sleepy-peer)
 *  - a RUSD (UDT stablecoin) sub-network alongside CKB channels
 */

export const RUSD_SCRIPT: RawScript = {
  code_hash: "0x1142755a044bf2ee358cba9f2da187ce928c91cd4dc8692ded0337efa677d21a",
  hash_type: "type",
  args: "0x878fcc6f1f08d48e87bb1c3b3d5083f23f8a39c5d5c764f253b55b998526439b",
};

export const RUSD_ASSET_ID = assetIdOf(RUSD_SCRIPT);
export const MOCK_ASSET_LABELS: Record<string, string> = { [RUSD_ASSET_ID]: "RUSD" };

const NAMES = [
  "preflight-demo-node", // 0 — "our" node
  "hub-alpha", // 1
  "hub-beta", // 2
  "merchant-cafe", // 3
  "merchant-books", // 4
  "exchange-gate", // 5
  "relay-one", // 6
  "relay-two", // 7
  "chokepoint-bridge", // 8
  "remote-village", // 9
  "island-node", // 10 — no channels
  "rusd-hub", // 11
  "rusd-merchant", // 12
  "rusd-user", // 13
  "sleepy-peer", // 14 — disabled inbound
] as const;

export function mockNodeId(i: number): string {
  return `0x02${i.toString(16).padStart(2, "0")}${"ab".repeat(31)}`;
}

export const MOCK_SELF_ID = mockNodeId(0);

function ckb(n: number): string {
  return bigIntToHex(BigInt(n) * SHANNONS_PER_CKB);
}

const NOW = 1_752_300_000_000; // fixed ms timestamp for determinism

export function mockGraphNodes(): RawGraphNode[] {
  const nodes: RawGraphNode[] = [];
  const total = 30;
  for (let i = 0; i < total; i++) {
    nodes.push({
      node_id: mockNodeId(i),
      node_name: i < NAMES.length ? NAMES[i] : `peer-${i}`,
      addresses: [`/ip4/10.0.0.${i + 1}/tcp/8228/p2p/mock${i}`],
      timestamp: bigIntToHex(BigInt(NOW - i * 60_000)),
      chain_hash: "0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606",
    });
  }
  return nodes;
}

interface ChanSpec {
  a: number;
  b: number;
  capacityCkb: number;
  feePpmA?: number; // fee charged by node a forwarding a->b
  feePpmB?: number;
  udt?: RawScript;
  disabledB?: boolean; // direction b-side update disabled (i.e. b -> a disabled)
  tlcMinShannons?: number;
}

const CHANNELS: ChanSpec[] = [
  // self -> hubs
  { a: 0, b: 1, capacityCkb: 10_000, feePpmA: 0, feePpmB: 1000 },
  { a: 0, b: 2, capacityCkb: 8_000, feePpmA: 0, feePpmB: 1200 },
  // hub backbone
  { a: 1, b: 2, capacityCkb: 20_000, feePpmA: 1000, feePpmB: 1000 },
  { a: 1, b: 3, capacityCkb: 15_000, feePpmA: 1000, feePpmB: 500 },
  { a: 1, b: 4, capacityCkb: 12_000, feePpmA: 1000, feePpmB: 500 },
  { a: 1, b: 5, capacityCkb: 30_000, feePpmA: 800, feePpmB: 800 },
  { a: 1, b: 6, capacityCkb: 9_000, feePpmA: 1000, feePpmB: 2000 },
  { a: 1, b: 7, capacityCkb: 9_000, feePpmA: 1000, feePpmB: 2000 },
  { a: 2, b: 3, capacityCkb: 10_000, feePpmA: 1200, feePpmB: 500 },
  { a: 2, b: 5, capacityCkb: 25_000, feePpmA: 900, feePpmB: 800 },
  { a: 2, b: 7, capacityCkb: 8_000, feePpmA: 1200, feePpmB: 2000 },
  { a: 4, b: 5, capacityCkb: 6_000, feePpmA: 500, feePpmB: 800 },
  // chokepoint scenario: only path to remote-village is a 120 CKB channel
  { a: 6, b: 8, capacityCkb: 7_000, feePpmA: 2000, feePpmB: 5000 },
  { a: 7, b: 8, capacityCkb: 6_000, feePpmA: 2000, feePpmB: 5000 },
  { a: 8, b: 9, capacityCkb: 120, feePpmA: 5000, feePpmB: 0, tlcMinShannons: 1000 },
  // disabled direction: hub-alpha <-> sleepy-peer, sleepy side disabled
  { a: 1, b: 14, capacityCkb: 5_000, feePpmA: 1000, feePpmB: 0, disabledB: true },
  // RUSD stablecoin sub-network (amounts still expressed via ckb() helper as base units)
  { a: 0, b: 11, capacityCkb: 5_000, feePpmA: 0, feePpmB: 1000, udt: RUSD_SCRIPT },
  { a: 11, b: 12, capacityCkb: 4_000, feePpmA: 1000, feePpmB: 500, udt: RUSD_SCRIPT },
  { a: 11, b: 13, capacityCkb: 3_000, feePpmA: 1000, feePpmB: 500, udt: RUSD_SCRIPT },
  { a: 12, b: 13, capacityCkb: 250, feePpmA: 500, feePpmB: 500, udt: RUSD_SCRIPT },
];

// mesh peers 15..29 hang off the hubs plus a few peer-to-peer links
for (let i = 15; i < 30; i++) {
  CHANNELS.push({
    a: i % 2 === 0 ? 1 : 2,
    b: i,
    capacityCkb: 2_000 + (i - 15) * 150,
    feePpmA: 1000,
    feePpmB: 1500,
  });
  if (i > 15 && i % 3 === 0) {
    CHANNELS.push({ a: i - 1, b: i, capacityCkb: 800, feePpmA: 1500, feePpmB: 1500 });
  }
}

export function mockGraphChannels(): RawGraphChannel[] {
  return CHANNELS.map((c, idx) => ({
    channel_outpoint: `0x${(idx + 1).toString(16).padStart(64, "0")}01000000`,
    node1: mockNodeId(c.a),
    node2: mockNodeId(c.b),
    capacity: ckb(c.capacityCkb),
    chain_hash: "0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606",
    udt_type_script: c.udt ?? null,
    created_timestamp: bigIntToHex(BigInt(NOW - 86_400_000)),
    update_info_of_node1: {
      timestamp: bigIntToHex(BigInt(NOW - 120_000)),
      enabled: true,
      fee_rate: bigIntToHex(BigInt(c.feePpmA ?? 1000)),
      tlc_expiry_delta: "0x54600", // 345600 ~ 4 days in ms/1000? kept as opaque value
      tlc_minimum_value: bigIntToHex(BigInt(c.tlcMinShannons ?? 0)),
    },
    update_info_of_node2: {
      timestamp: bigIntToHex(BigInt(NOW - 120_000)),
      enabled: !c.disabledB,
      fee_rate: bigIntToHex(BigInt(c.feePpmB ?? 1000)),
      tlc_expiry_delta: "0x54600",
      tlc_minimum_value: bigIntToHex(BigInt(c.tlcMinShannons ?? 0)),
    },
  }));
}

/** Sample invoices the mock parse_invoice understands (testnet invoices start with "fibt"). */
export const MOCK_INVOICES: Record<string, { targetIndex: number; amountShannons: bigint; udt?: RawScript }> = {
  // 100 CKB to merchant-cafe
  fibt1cafe100ckbdemo0invoice0healthy0route0example0only: {
    targetIndex: 3,
    amountShannons: 100n * SHANNONS_PER_CKB,
  },
  // 100 CKB to remote-village (chokepoint stress)
  fibt1village100ckbdemo0invoice0chokepoint0example0only: {
    targetIndex: 9,
    amountShannons: 100n * SHANNONS_PER_CKB,
  },
  // 50 RUSD to rusd-merchant
  fibt1rusd50demo0invoice0stablecoin0example0only: {
    targetIndex: 12,
    amountShannons: 50n * SHANNONS_PER_CKB,
    udt: RUSD_SCRIPT,
  },
};
