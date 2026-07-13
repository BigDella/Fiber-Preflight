# Demo video script (~3 minutes)

Target: show the infrastructure gap, the working tool, and the reusability story.

## 0:00 – 0:25 — The problem
- Screen: terminal with a raw Fiber error (`Failed to send payment: no route found…`).
- Voiceover: "Fiber payments fail with opaque errors, and there's no way to know if a payment will
  succeed *before* you send it. Wallets and merchants are flying blind. Fiber Preflight fixes both."

## 0:25 – 1:20 — Preflight in action
- Open the app (hosted URL). Point at the header: live node status + graph stats.
- Pick **"Healthy payment — 100 CKB to merchant-cafe"** → Run preflight.
  - Show: *Likely to succeed*, score, 5 route candidates hop-by-hop with fees, suggestions.
- Pick **"Chokepoint — remote-village"** → Run preflight.
  - Show: score collapses; *tight capacity* + *single route* bottlenecks name the exact constraint.
- Pick **"Unreachable — island-node"**.
  - Show: *Impossible*, critical bottleneck "target has no public channels", actionable suggestions.
- One line on multi-asset: run the **RUSD stablecoin** scenario.

## 1:20 – 2:00 — Prediction vs reality
- On the island scenario, click **Preflight + pay (testnet)**.
- Show the outcome panel: preflight predicted *impossible* → payment *Failed* → raw error AND the
  translated diagnostic side by side.
- Voiceover: "The preflight predicted it; the payment confirmed it — and the failure comes back as
  structured, wallet-ready copy instead of a raw string."

## 2:00 – 2:30 — Error decoder
- Open /decoder. Pick 2–3 samples from the dropdown (asset mismatch, TLC timeout).
- Voiceover: "Any wallet can drop this in: 16 diagnostic codes, categories, severity, retryability,
  user-safe copy, and recovery suggestions. Unknown errors degrade gracefully."

## 2:30 – 3:00 — Reusability + close
- Show README integration snippet (`import { preflight, explainFailure }`).
- Show the REST endpoints table; mention: TypeScript library, ESM+CJS, 51 tests, mock mode for CI,
  docker-compose deploy with the RPC port never exposed.
- Close: "Fiber Preflight — payment confidence and diagnosis as reusable infrastructure for the
  Fiber stack. Roadmap: probe-based liquidity estimation and multi-part payment planning."

## Recording notes
- Run in mock mode for deterministic scenarios OR against the droplet node for the live badge; both
  are honest (the UI labels mock mode explicitly).
- 1080p, dark room lighting matches the dark UI.
