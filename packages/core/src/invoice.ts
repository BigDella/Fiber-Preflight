import type { RawParsedInvoice, RawScript } from "./rpc/types.js";
import { hexToBigInt } from "./hex.js";
import { assetIdOf } from "./graph.js";
import { CKB_ASSET, type AssetId } from "./types.js";

export interface InvoiceTarget {
  target: string | null;
  amount: bigint;
  asset: AssetId;
  paymentHash: string | null;
}

/**
 * Extract routing-relevant fields from a `parse_invoice` result.
 * Invoice attrs are a list of single-key objects (e.g. { PayeePublicKey },
 * { UdtScript }); shapes are matched tolerantly.
 */
export function extractInvoiceTarget(parsed: RawParsedInvoice): InvoiceTarget {
  let target: string | null = null;
  let udt: RawScript | null = null;

  const attrs = parsed.data?.attrs;
  if (Array.isArray(attrs)) {
    for (const attr of attrs) {
      if (!attr || typeof attr !== "object") continue;
      const o = attr as Record<string, unknown>;
      const payee = o.PayeePublicKey ?? o.payee_public_key ?? o.PayeePubKey;
      if (typeof payee === "string") target = payee;
      const script = o.UdtScript ?? o.udt_script ?? o.UdtTypeScript;
      if (script && typeof script === "object") udt = script as RawScript;
      if (typeof script === "string") {
        // some versions serialise the script as a molecule hex string; treat as opaque UDT marker
        udt = { code_hash: script, hash_type: "type", args: "" };
      }
    }
  }

  return {
    target,
    amount: hexToBigInt(parsed.amount),
    asset: udt ? assetIdOf(udt) : CKB_ASSET,
    paymentHash: parsed.payment_hash ?? parsed.data?.payment_hash ?? null,
  };
}

/** Heuristic: does this string look like a Fiber invoice rather than a node id? */
export function looksLikeInvoice(input: string): boolean {
  const s = input.trim().toLowerCase();
  return s.startsWith("fib") && !s.startsWith("0x");
}
