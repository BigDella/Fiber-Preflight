import { describe, expect, it } from "vitest";
import { explainFailure, ERROR_CATALOG, SAMPLE_ERRORS } from "../src/index.js";

const CASES: [raw: string, expectedCode: string][] = [
  ["Failed to send payment: no route found to destination node 0x03f1a2", "NO_ROUTE_FOUND"],
  ["PathFinding error: failed to build route", "NO_ROUTE_FOUND"],
  ["SendPaymentError: insufficient local balance to cover amount plus fees", "INSUFFICIENT_LOCAL_BALANCE"],
  ["not enough balance in channel", "INSUFFICIENT_LOCAL_BALANCE"],
  ["PaymentSessionError: target node unreachable, node has no channels in graph", "TARGET_UNREACHABLE"],
  ["TlcErr: amount exceeds channel capacity on outbound channel", "CHANNEL_CAPACITY_EXCEEDED"],
  ["InvoiceError: invoice expired at 1720000000", "INVOICE_EXPIRED"],
  ["InvoiceError: invoice already paid, duplicated payment rejected", "INVOICE_ALREADY_PAID"],
  ["failed to parse invoice: malformed bech32 string", "INVOICE_INVALID"],
  ["ChannelError: UDT type script mismatch between payment and channel", "UDT_ASSET_MISMATCH"],
  ["TlcErr: TLC timed out waiting for preimage reveal", "TLC_TIMEOUT"],
  ["payment timed out: deadline exceeded", "PAYMENT_TIMEOUT"],
  ["PeerError: peer not connected, connection reset by remote", "PEER_DISCONNECTED"],
  ["channel not ready: awaiting funding confirmation", "CHANNEL_NOT_READY"],
  ["SendPaymentError: route fee 5200 shannons exceeds max fee limit 1000", "FEE_LIMIT_EXCEEDED"],
  ["fetch failed: connect ECONNREFUSED 127.0.0.1:8227", "NODE_UNREACHABLE_RPC"],
  ["amount too small: below tlc minimum", "BELOW_TLC_MINIMUM"],
];

describe("explainFailure", () => {
  it.each(CASES)("%s -> %s", (raw, code) => {
    const d = explainFailure(raw);
    expect(d.code).toBe(code);
    expect(d.raw).toBe(raw);
    expect(d.userMessage.length).toBeGreaterThan(0);
    expect(d.suggestions.length).toBeGreaterThan(0);
  });

  it("falls back to UNKNOWN with generic next steps", () => {
    const d = explainFailure("some totally novel failure xyz-42");
    expect(d.code).toBe("UNKNOWN");
    expect(d.category).toBe("unknown");
    expect(d.retryable).toBe(true);
    expect(d.suggestions.length).toBeGreaterThan(0);
  });

  it("accepts Error objects", () => {
    expect(explainFailure(new Error("no route found")).code).toBe("NO_ROUTE_FOUND");
  });

  it("accepts JSON-RPC error objects and payment objects", () => {
    expect(explainFailure({ code: -32000, message: "peer not connected" }).code).toBe("PEER_DISCONNECTED");
    expect(explainFailure({ failed_error: "invoice expired" }).code).toBe("INVOICE_EXPIRED");
  });

  it("every catalog entry has wallet-ready copy and stable code", () => {
    const codes = new Set<string>();
    for (const entry of ERROR_CATALOG) {
      expect(entry.userMessage.length).toBeGreaterThan(10);
      expect(entry.suggestions.length).toBeGreaterThan(0);
      expect(codes.has(entry.code)).toBe(false);
      codes.add(entry.code);
    }
  });

  it("every documented sample error resolves to a non-UNKNOWN code", () => {
    for (const s of SAMPLE_ERRORS) {
      expect(explainFailure(s.raw).code).not.toBe("UNKNOWN");
    }
  });
});
