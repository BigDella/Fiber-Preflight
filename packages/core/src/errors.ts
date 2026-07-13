import type { DiagnosticCategory, DiagnosticResult, DiagnosticSeverity } from "./types.js";

/**
 * Fiber payment failure translator.
 *
 * Maps raw error strings from `send_payment` / `get_payment` (`failed_error`)
 * and JSON-RPC error messages into structured, wallet-ready diagnostics.
 *
 * The catalog is a regex table built from Fiber's error surface
 * (github.com/nervosnetwork/fiber — src/errors.rs, payment/session code and
 * rpc modules) plus errors observed on testnet. Matching is case-insensitive
 * and first-match-wins, ordered most-specific-first. Anything unmatched falls
 * back to a safe UNKNOWN entry that still gives generic next steps.
 *
 * The full human-readable table lives in docs/error-catalog.md — keep both in sync.
 */

interface CatalogEntry {
  code: string;
  pattern: RegExp;
  category: DiagnosticCategory;
  title: string;
  explanation: string;
  userMessage: string;
  suggestions: string[];
  severity: DiagnosticSeverity;
  retryable: boolean;
}

export const ERROR_CATALOG: CatalogEntry[] = [
  // ---- invoice ----------------------------------------------------------
  {
    code: "INVOICE_EXPIRED",
    pattern: /invoice.*(expired|expiry.*(passed|reached))|expired.*invoice/i,
    category: "invoice",
    title: "Invoice expired",
    explanation:
      "The payment invoice's expiry timestamp has passed. Fiber nodes reject TLCs for expired invoices to protect the recipient from stale payment attempts.",
    userMessage: "This payment request has expired. Ask the recipient for a new one.",
    suggestions: ["Request a fresh invoice from the recipient", "Pay promptly after receiving an invoice — they are time-limited"],
    severity: "error",
    retryable: false,
  },
  {
    code: "INVOICE_ALREADY_PAID",
    pattern: /invoice.*already\s*paid|already\s*paid.*invoice|duplicate(d)?\s*payment/i,
    category: "invoice",
    title: "Invoice already paid",
    explanation:
      "A payment for this invoice's payment hash has already settled. Paying the same invoice twice is rejected to prevent double-spends of the preimage.",
    userMessage: "This request was already paid — you don't need to pay again.",
    suggestions: ["Check your payment history for the earlier settlement", "If you need to pay again, request a new invoice"],
    severity: "info",
    retryable: false,
  },
  {
    code: "INVOICE_INVALID",
    pattern: /(invalid|malformed|failed to (parse|decode)).*(invoice)|invoice.*(invalid|malformed|parse error)/i,
    category: "invoice",
    title: "Invalid invoice",
    explanation:
      "The invoice string could not be decoded. It may be truncated, corrupted, for a different network (mainnet 'fibb' vs testnet 'fibt'), or not a Fiber invoice at all.",
    userMessage: "This payment request looks invalid or incomplete. Ask the sender to reshare it.",
    suggestions: [
      "Re-copy the full invoice string — check nothing was truncated",
      "Verify the invoice matches your network (testnet invoices start with 'fibt')",
    ],
    severity: "error",
    retryable: false,
  },
  // ---- asset mismatch (before generic liquidity/routing) -----------------
  {
    code: "UDT_ASSET_MISMATCH",
    pattern: /(udt|token|asset).*(mismatch|not\s*match|incompatible|not\s*supported|unsupported)|mismatch.*(udt|asset|type\s*script)|wrong\s*(udt|asset)/i,
    category: "asset_mismatch",
    title: "Asset mismatch",
    explanation:
      "The payment's asset (UDT type script) does not match what the route or recipient channel carries. Fiber channels are asset-specific: a CKB channel cannot forward a UDT payment and vice versa, and different UDTs are not interchangeable.",
    userMessage: "You're trying to pay with a different asset than the recipient accepts.",
    suggestions: [
      "Check which asset the invoice is denominated in",
      "Open or use a channel that carries the required asset",
    ],
    severity: "error",
    retryable: false,
  },
  // ---- liquidity ----------------------------------------------------------
  {
    code: "INSUFFICIENT_LOCAL_BALANCE",
    pattern: /insufficient.*(local|outbound)?\s*(balance|funds|capacity)|not\s*enough\s*(balance|funds|capacity)|balance\s*not\s*enough/i,
    category: "liquidity",
    title: "Insufficient local balance",
    explanation:
      "Your node's outbound balance across usable channels is less than amount + fees. Channel balance is distinct from on-chain balance — funds must already be inside an open channel on your side.",
    userMessage: "You don't have enough spendable balance in your payment channels for this amount.",
    suggestions: [
      "Open a new channel or add funds to an existing one",
      "Try a smaller amount",
      "Remember on-chain CKB must be moved into a channel before it can be spent over Fiber",
    ],
    severity: "error",
    retryable: false,
  },
  {
    code: "CHANNEL_CAPACITY_EXCEEDED",
    pattern: /(exceed|above|larger than|greater than).*(channel)?\s*capacity|capacity.*(exceeded|too\s*(low|small))|amount.*too\s*large/i,
    category: "liquidity",
    title: "Amount exceeds channel capacity",
    explanation:
      "The payment amount (plus fees) is larger than the capacity of a channel it must traverse. No single TLC can exceed the channel's capacity or its announced tlc_maximum_value.",
    userMessage: "This amount is too large for the available payment channels.",
    suggestions: ["Split the payment into smaller parts", "Try a smaller amount", "Open a larger channel for payments of this size"],
    severity: "error",
    retryable: false,
  },
  // ---- routing ------------------------------------------------------------
  {
    code: "NO_ROUTE_FOUND",
    pattern: /no\s*(feasible\s*)?(route|path)\s*(found|available|to)?|failed to (find|build).*(route|path)|route\s*not\s*found|PathFind(ing)?\s*error|no.*usable.*channels?.*route/i,
    category: "routing",
    title: "No route to destination",
    explanation:
      "The pathfinder could not assemble a route from your node to the target with enough capacity for the amount. Causes: the target is poorly connected, intermediate channels lack capacity/liquidity, channels are disabled, or your node's graph view is incomplete (still syncing gossip).",
    userMessage: "No payment path to the recipient could be found right now.",
    suggestions: [
      "Run a preflight check to see where the route breaks down",
      "Try a smaller amount — capacity constraints shrink the routable graph",
      "Ask the recipient to open a channel with a well-connected node",
      "If your node just started, wait for gossip sync to complete and retry",
    ],
    severity: "error",
    retryable: true,
  },
  {
    code: "TARGET_UNREACHABLE",
    pattern: /(target|destination|recipient|remote\s*node).*(unreachable|not\s*(found|reachable|in\s*(the\s*)?graph)|has\s*no\s*channels?|offline)|unreachable\s*(target|destination|node)/i,
    category: "routing",
    title: "Target unreachable",
    explanation:
      "The destination node is not reachable in the channel graph — it has no public channels, hasn't been announced via gossip yet, or is offline.",
    userMessage: "The recipient can't be reached on the network right now.",
    suggestions: [
      "Verify the recipient's node ID is correct",
      "Ask the recipient to confirm their node is online and has an open public channel",
    ],
    severity: "error",
    retryable: true,
  },
  {
    code: "FEE_LIMIT_EXCEEDED",
    pattern: /fee.*(exceed|too\s*(high|large)|limit|above\s*(the\s*)?(max|limit))|(max|maximum)\s*fee.*(exceeded|reached)|exceed.*fee/i,
    category: "fees",
    title: "Fee limit exceeded",
    explanation:
      "Every discovered route costs more in forwarding fees than the payment's configured maximum fee, so the payment was abandoned rather than overpaying.",
    userMessage: "Routing this payment would cost more in fees than your limit allows.",
    suggestions: [
      "Raise the max fee tolerance and retry",
      "Try a route through cheaper channels (preflight shows per-route fees)",
      "For small amounts, fees are proportionally larger — consider batching",
    ],
    severity: "warning",
    retryable: true,
  },
  // ---- timeouts / TLC ------------------------------------------------------
  {
    code: "TLC_TIMEOUT",
    pattern: /tlc.*(timeout|timed?\s*out|expired|failure|failed)|(timeout|timed?\s*out).*tlc|htlc.*(timeout|expired)/i,
    category: "timeout",
    title: "TLC timed out",
    explanation:
      "A TLC (the HTLC-equivalent in Fiber) expired before the payment settled. Typically a hop stopped responding mid-payment or the preimage was not revealed in time; funds are safe and return after the timeout.",
    userMessage: "The payment timed out along the way. Your funds are safe.",
    suggestions: ["Retry — the next attempt may pick a different route", "If it keeps failing on the same route, report it via preflight diagnostics"],
    severity: "warning",
    retryable: true,
  },
  {
    code: "PAYMENT_TIMEOUT",
    pattern: /payment.*(timeout|timed?\s*out)|(timeout|timed?\s*out).*payment|deadline\s*exceeded/i,
    category: "timeout",
    title: "Payment timed out",
    explanation: "The payment did not complete within the allowed time window and was abandoned. Funds in unresolved TLCs return automatically.",
    userMessage: "The payment took too long and was cancelled. You have not been charged.",
    suggestions: ["Retry the payment", "Check node connectivity if timeouts persist"],
    severity: "warning",
    retryable: true,
  },
  // ---- connectivity --------------------------------------------------------
  {
    code: "PEER_DISCONNECTED",
    pattern: /peer.*(disconnect|not\s*(connected|found|online)|unavailable|offline)|(disconnect|connection).*(peer|closed|refused|reset)|not\s*connected\s*to\s*peer/i,
    category: "connectivity",
    title: "Peer disconnected",
    explanation:
      "A peer needed for this payment (the first hop or a forwarding node) is not currently connected. Channels with disconnected peers cannot forward TLCs.",
    userMessage: "A node needed for this payment is offline. Try again shortly.",
    suggestions: ["Retry in a few moments — peers often reconnect automatically", "Check your node's peer connections (`list_channels` / peers)"],
    severity: "warning",
    retryable: true,
  },
  {
    code: "CHANNEL_NOT_READY",
    pattern: /channel.*(not\s*(ready|found|active|open)|closed|closing|pending|shutting)|no\s*such\s*channel/i,
    category: "connectivity",
    title: "Channel not ready",
    explanation:
      "The channel selected for the payment is not in an operational state — still opening (awaiting funding confirmations), closing, or already closed.",
    userMessage: "Your payment channel isn't ready yet. Wait for it to activate and retry.",
    suggestions: ["Wait for channel funding to confirm on-chain", "Check the channel state via list_channels"],
    severity: "warning",
    retryable: true,
  },
  {
    code: "NODE_UNREACHABLE_RPC",
    pattern: /(ECONNREFUSED|ENOTFOUND|ETIMEDOUT|ECONNRESET|EHOSTUNREACH|fetch failed|socket hang up|network\s*error|failed\s*to\s*fetch)/i,
    category: "connectivity",
    title: "Fiber node unreachable",
    explanation:
      "The Fiber node's RPC endpoint did not respond — this is an infrastructure failure between your application and the node, not a payment failure.",
    userMessage: "Can't reach the payment service right now. Please try again shortly.",
    suggestions: ["Check the Fiber node process is running", "Verify FIBER_RPC_URL points at the node's RPC port (default 8227)"],
    severity: "error",
    retryable: true,
  },
  // ---- amount edge cases ---------------------------------------------------
  {
    code: "BELOW_TLC_MINIMUM",
    pattern: /(below|less\s*than|under).*(tlc\s*)?minimum|amount\s*too\s*small|minimum.*(tlc|amount).*not\s*met/i,
    category: "liquidity",
    title: "Amount below channel minimum",
    explanation: "The amount is below the tlc_minimum_value announced by a channel on the route; nodes refuse to forward dust-sized TLCs.",
    userMessage: "This amount is too small to send over the network.",
    suggestions: ["Increase the amount above the route's minimum", "Batch several micro-payments into one"],
    severity: "error",
    retryable: false,
  },
];

const UNKNOWN_ENTRY: Omit<CatalogEntry, "pattern"> = {
  code: "UNKNOWN",
  category: "unknown",
  title: "Unrecognised payment error",
  explanation:
    "This error is not in the diagnostic catalog yet. The raw message is preserved below — please report it so the catalog can grow.",
  userMessage: "The payment failed for an unexpected reason.",
  suggestions: [
    "Retry the payment once — transient failures are common in payment-channel networks",
    "Run a preflight check to inspect route health before retrying",
    "Check the Fiber node logs for details around this timestamp",
  ],
  severity: "error",
  retryable: true,
};

/** Translate a raw Fiber error (string or Error or RPC error object) into a structured diagnostic. */
export function explainFailure(err: unknown): DiagnosticResult {
  const raw = normaliseError(err);
  for (const entry of ERROR_CATALOG) {
    if (entry.pattern.test(raw)) {
      const { pattern: _p, ...rest } = entry;
      return { ...rest, raw };
    }
  }
  return { ...UNKNOWN_ENTRY, raw };
}

function normaliseError(err: unknown): string {
  if (typeof err === "string") return err;
  if (err instanceof Error) return err.message;
  if (err && typeof err === "object") {
    const o = err as Record<string, unknown>;
    if (typeof o.failed_error === "string") return o.failed_error;
    if (typeof o.message === "string") {
      const data = o.data !== undefined ? ` ${JSON.stringify(o.data)}` : "";
      return `${o.message}${data}`;
    }
    try {
      return JSON.stringify(err);
    } catch {
      return String(err);
    }
  }
  return String(err);
}

/** Example raw errors for demos/tests — one per major catalog entry. */
export const SAMPLE_ERRORS: { label: string; raw: string }[] = [
  { label: "No route found", raw: "Failed to send payment: no route found to destination node 0x03f1a2" },
  { label: "Insufficient balance", raw: "SendPaymentError: insufficient local balance to cover amount plus fees" },
  { label: "Target unreachable", raw: "PaymentSessionError: target node unreachable, node has no channels in graph" },
  { label: "Capacity exceeded", raw: "TlcErr: amount exceeds channel capacity on outbound channel" },
  { label: "Invoice expired", raw: "InvoiceError: invoice expired at 1720000000" },
  { label: "Invoice already paid", raw: "InvoiceError: invoice already paid, duplicated payment rejected" },
  { label: "Invalid invoice", raw: "failed to parse invoice: malformed bech32 string" },
  { label: "Asset mismatch", raw: "ChannelError: UDT type script mismatch between payment and channel" },
  { label: "TLC timeout", raw: "TlcErr: TLC timed out waiting for preimage reveal" },
  { label: "Peer disconnected", raw: "PeerError: peer not connected, connection reset by remote" },
  { label: "Fee limit exceeded", raw: "SendPaymentError: route fee 5200 shannons exceeds max fee limit 1000" },
  { label: "RPC unreachable", raw: "fetch failed: connect ECONNREFUSED 127.0.0.1:8227" },
];
