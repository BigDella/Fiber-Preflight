import type {
  FiberClient,
  RawGraphChannelsResult,
  RawGraphNodesResult,
  RawListChannelsResult,
  RawNodeInfo,
  RawParsedInvoice,
  RawPayment,
} from "./types.js";
import {
  MOCK_INVOICES,
  MOCK_SELF_ID,
  mockGraphChannels,
  mockGraphNodes,
  mockNodeId,
} from "../mock/fixture.js";
import { bigIntToHex, hexToBigInt, SHANNONS_PER_CKB } from "../hex.js";

/**
 * Fixture-backed FiberClient. Zero infrastructure: lets the whole stack
 * (graph sync, preflight, payments, failure translation) run with
 * FIBER_MOCK=true. Payment outcomes are deterministic per target so demos
 * are repeatable:
 *   - island-node (no channels)      -> "no route found"
 *   - remote-village + amount > 100  -> capacity exceeded
 *   - amount > 10000 CKB             -> insufficient local balance
 *   - anything else                  -> Success (after one Inflight poll)
 */
export class MockFiberClient implements FiberClient {
  private payments = new Map<string, { final: RawPayment; polls: number }>();
  private counter = 0;

  async nodeInfo(): Promise<RawNodeInfo> {
    return {
      node_id: MOCK_SELF_ID,
      node_name: "preflight-demo-node",
      addresses: ["/ip4/127.0.0.1/tcp/8228/p2p/mock0"],
      chain_hash: "0x10639e0895502b5688a6be8cf69460d76541bfa4821629d86d62ba0aae3f9606",
      peers_count: bigIntToHex(6n),
      channel_count: bigIntToHex(3n),
      pending_channel_count: "0x0",
      network_sync_status: "Done (mock)",
    };
  }

  async graphNodes(): Promise<RawGraphNodesResult> {
    return { nodes: mockGraphNodes() };
  }

  async graphChannels(): Promise<RawGraphChannelsResult> {
    return { channels: mockGraphChannels() };
  }

  async parseInvoice(invoice: string): Promise<RawParsedInvoice> {
    const known = MOCK_INVOICES[invoice.trim()];
    if (!known) {
      if (!invoice.trim().toLowerCase().startsWith("fibt")) {
        throw new Error("failed to parse invoice: malformed bech32 string");
      }
      throw new Error("failed to parse invoice: unknown mock invoice (use one of the demo invoices)");
    }
    return {
      currency: known.udt ? "Fibt(UDT)" : "Fibt",
      amount: bigIntToHex(known.amountShannons),
      payment_hash: `0x${(this.counter + 7).toString(16).padStart(64, "0")}`,
      data: {
        timestamp: Date.now(),
        attrs: [
          { PayeePublicKey: mockNodeId(known.targetIndex) },
          ...(known.udt ? [{ UdtScript: known.udt }] : []),
        ],
      },
    };
  }

  async sendPayment(params: Record<string, unknown>): Promise<RawPayment> {
    const target = typeof params.target_pubkey === "string" ? params.target_pubkey : "";
    const amount = hexToBigInt(params.amount);
    const hash = `0x${(++this.counter).toString(16).padStart(64, "0")}`;

    let failed: string | null = null;
    if (target === mockNodeId(10) || target === "") {
      failed = "Failed to send payment: no route found to destination node";
    } else if (target === mockNodeId(9) && amount > 100n * SHANNONS_PER_CKB) {
      failed = "TlcErr: amount exceeds channel capacity on outbound channel";
    } else if (amount > 10_000n * SHANNONS_PER_CKB) {
      failed = "SendPaymentError: insufficient local balance to cover amount plus fees";
    }

    const final: RawPayment = {
      payment_hash: hash,
      status: failed ? "Failed" : "Success",
      created_at: bigIntToHex(BigInt(Date.now())),
      last_updated_at: bigIntToHex(BigInt(Date.now())),
      failed_error: failed,
      fee: failed ? "0x0" : bigIntToHex((amount * 1000n) / 1_000_000n),
    };
    this.payments.set(hash, { final, polls: 0 });

    return { payment_hash: hash, status: "Created", created_at: final.created_at, failed_error: null };
  }

  async getPayment(paymentHash: string): Promise<RawPayment> {
    const entry = this.payments.get(paymentHash);
    if (!entry) throw new Error(`get_payment: payment not found: ${paymentHash}`);
    entry.polls += 1;
    // first poll shows Inflight so UIs can demonstrate progress states
    if (entry.polls === 1) {
      return { ...entry.final, status: "Inflight", failed_error: null };
    }
    return entry.final;
  }

  async listChannels(): Promise<RawListChannelsResult> {
    const ckb = (n: bigint) => bigIntToHex(n * SHANNONS_PER_CKB);
    return {
      channels: [
        {
          channel_id: "0x" + "11".repeat(32),
          peer_id: mockNodeId(1),
          state: { state_name: "CHANNEL_READY" },
          local_balance: ckb(6_000n),
          remote_balance: ckb(4_000n),
          udt_type_script: null,
        },
        {
          channel_id: "0x" + "22".repeat(32),
          peer_id: mockNodeId(2),
          state: { state_name: "CHANNEL_READY" },
          local_balance: ckb(5_000n),
          remote_balance: ckb(3_000n),
          udt_type_script: null,
        },
      ],
    };
  }
}
