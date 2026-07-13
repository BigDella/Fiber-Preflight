# Fiber error catalog

The diagnostic mapping table implemented in [`packages/core/src/errors.ts`](../packages/core/src/errors.ts)
(`ERROR_CATALOG`). Matching is case-insensitive regex, first-match-wins, ordered most-specific-first.
Anything unmatched resolves to `UNKNOWN` with generic recovery steps — the translator never throws.

Sources: Fiber's error surface (`github.com/nervosnetwork/fiber` — `src/errors.rs`, payment session and
RPC modules) plus failures observed on testnet. The catalog is deliberately data-like so the community
can extend it; PRs that add codes with tests are welcome.

| Code | Category | Severity | Retryable | Trigger (paraphrased) | Wallet-ready message |
|---|---|---|---|---|---|
| `INVOICE_EXPIRED` | invoice | error | no | "invoice … expired" | This payment request has expired. Ask the recipient for a new one. |
| `INVOICE_ALREADY_PAID` | invoice | info | no | "invoice already paid", "duplicated payment" | This request was already paid — you don't need to pay again. |
| `INVOICE_INVALID` | invoice | error | no | "failed to parse/decode invoice", "malformed" | This payment request looks invalid or incomplete. Ask the sender to reshare it. |
| `UDT_ASSET_MISMATCH` | asset_mismatch | error | no | "UDT/asset/type script mismatch", "unsupported UDT" | You're trying to pay with a different asset than the recipient accepts. |
| `INSUFFICIENT_LOCAL_BALANCE` | liquidity | error | no | "insufficient balance/funds/capacity", "not enough balance" | You don't have enough spendable balance in your payment channels for this amount. |
| `CHANNEL_CAPACITY_EXCEEDED` | liquidity | error | no | "exceeds channel capacity", "amount too large" | This amount is too large for the available payment channels. |
| `BELOW_TLC_MINIMUM` | liquidity | error | no | "below tlc minimum", "amount too small" | This amount is too small to send over the network. |
| `NO_ROUTE_FOUND` | routing | error | yes | "no route found", "failed to build route", "PathFind error" | No payment path to the recipient could be found right now. |
| `TARGET_UNREACHABLE` | routing | error | yes | "target/destination unreachable", "node has no channels" | The recipient can't be reached on the network right now. |
| `FEE_LIMIT_EXCEEDED` | fees | warning | yes | "fee exceeds limit/max fee" | Routing this payment would cost more in fees than your limit allows. |
| `TLC_TIMEOUT` | timeout | warning | yes | "TLC timed out/expired/failed" | The payment timed out along the way. Your funds are safe. |
| `PAYMENT_TIMEOUT` | timeout | warning | yes | "payment timed out", "deadline exceeded" | The payment took too long and was cancelled. You have not been charged. |
| `PEER_DISCONNECTED` | connectivity | warning | yes | "peer not connected/disconnected", "connection reset" | A node needed for this payment is offline. Try again shortly. |
| `CHANNEL_NOT_READY` | connectivity | warning | yes | "channel not ready/found/active", "channel closed/pending" | Your payment channel isn't ready yet. Wait for it to activate and retry. |
| `NODE_UNREACHABLE_RPC` | connectivity | error | yes | ECONNREFUSED / ETIMEDOUT / fetch failed … | Can't reach the payment service right now. Please try again shortly. |
| `UNKNOWN` | unknown | error | yes | (fallback) | The payment failed for an unexpected reason. |

Each entry also carries a **technical explanation** (for developers/operators) and 1–4 **suggestions**
(actionable next steps). See `SAMPLE_ERRORS` in the same module for one realistic raw error per entry —
these power the demo dropdown and the test suite (`packages/core/test/errors.test.ts` asserts every
sample resolves to a non-UNKNOWN code, and every catalog code is covered by at least one case).

## Input shapes accepted

`explainFailure(err)` accepts:

- a raw string (e.g. `failed_error` from `get_payment`)
- an `Error` instance
- a JSON-RPC error object `{ code, message, data? }`
- a payment object containing `failed_error`

## Extending the catalog

1. Add an entry to `ERROR_CATALOG` (place more-specific patterns above generic ones).
2. Add a test case to `errors.test.ts` and, if it's a common failure, a sample to `SAMPLE_ERRORS`.
3. Update this table.
