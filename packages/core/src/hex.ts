/**
 * Fiber RPC returns numeric values as hex-encoded strings (e.g. "0x5f5e100").
 * All amounts are handled as bigint. CKB amounts are in shannons (1 CKB = 10^8 shannons).
 */

/** Decode a hex string ("0x...") to bigint. Tolerant: accepts bigint/number/decimal strings, null/undefined -> 0n. */
export function hexToBigInt(value: unknown): bigint {
  if (value === null || value === undefined) return 0n;
  if (typeof value === "bigint") return value;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return 0n;
    return BigInt(Math.trunc(value));
  }
  if (typeof value === "string") {
    const v = value.trim();
    if (v === "" || v === "0x") return 0n;
    try {
      // BigInt() natively handles both "0x..." and decimal strings.
      return BigInt(v);
    } catch {
      return 0n;
    }
  }
  return 0n;
}

/** Encode a bigint (or number) as a "0x" hex string, as expected by Fiber RPC params. */
export function bigIntToHex(value: bigint | number): string {
  const v = typeof value === "number" ? BigInt(Math.trunc(value)) : value;
  if (v < 0n) throw new Error(`cannot hex-encode negative value: ${v}`);
  return `0x${v.toString(16)}`;
}

export const SHANNONS_PER_CKB = 100_000_000n;

/** Format shannons as a human-readable CKB string (e.g. 150000000n -> "1.5"). */
export function formatCkb(shannons: bigint, maxDecimals = 4): string {
  const whole = shannons / SHANNONS_PER_CKB;
  const frac = shannons % SHANNONS_PER_CKB;
  if (frac === 0n) return whole.toString();
  const fracStr = frac.toString().padStart(8, "0").slice(0, maxDecimals).replace(/0+$/, "");
  return fracStr.length > 0 ? `${whole}.${fracStr}` : whole.toString();
}

/** Parse a decimal CKB string (e.g. "1.5") into shannons. */
export function parseCkb(ckb: string): bigint {
  const s = ckb.trim();
  if (!/^\d+(\.\d+)?$/.test(s)) throw new Error(`invalid CKB amount: ${ckb}`);
  const [wholeRaw, fracRaw = ""] = s.split(".");
  const whole = BigInt(wholeRaw ?? "0");
  const frac = BigInt((fracRaw + "00000000").slice(0, 8));
  return whole * SHANNONS_PER_CKB + frac;
}
