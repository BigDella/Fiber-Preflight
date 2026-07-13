# Fiber Preflight

**Payment route confidence & failure diagnostics infrastructure for [Fiber Network](https://www.fiber.world/) (Nervos CKB).**

> *Gone in 60ms* Fiber Infrastructure Hackathon — Category 2: Node, Routing, Cross-Chain & Diagnostics Infrastructure.

Fiber payments today fail with opaque low-level errors, and there is no way to check whether a payment
is likely to succeed *before* attempting it. Fiber Preflight closes both gaps:

1. **`@fiber-preflight/core`** — a reusable, zero-UI TypeScript library:
   - syncs the public channel graph from any Fiber node (`graph_nodes` / `graph_channels`)
   - finds k-shortest candidate routes (Dijkstra + Yen) for an amount + asset (CKB or any UDT)
   - scores payment success likelihood 0–100 with named bottlenecks and actionable suggestions
   - translates raw Fiber payment errors into structured, **wallet-ready** diagnostics
2. **Web app** (`apps/web`) — a hosted demo + REST wrapper any service can call.

```
┌─────────────┐   JSON-RPC    ┌──────────────────┐   REST    ┌─────────────┐
│ Fiber node   │ ───────────▶ │ @fiber-preflight │ ────────▶ │  Web UI /   │
│ (8227)       │  graph sync   │      /core       │  Next.js  │  your app   │
└─────────────┘               │ graph·routes·    │           └─────────────┘
                              │ score·diagnose   │
                              └──────────────────┘
```

## Quickstart (zero infrastructure)

```bash
git clone https://github.com/BigDella/Fiber-Preflight.git
cd Fiber-Preflight
pnpm install
pnpm build          # builds the core library
pnpm dev            # http://localhost:3000 — runs on the built-in mock network
```

No Fiber node needed: with `FIBER_RPC_URL` unset (or `FIBER_MOCK=true`) the app runs against a
deterministic fixture network — 30 nodes, ~40 channels, CKB + a "RUSD" stablecoin UDT, including a
low-capacity chokepoint, an unreachable island node and a disabled channel, so every verdict class is
demonstrable. Pick a **demo scenario** from the dropdown and hit *Run preflight*.

### Against a real node

```bash
cp apps/web/.env.example apps/web/.env
# set FIBER_RPC_URL=http://127.0.0.1:8227 and FIBER_MOCK=false
pnpm dev
```

## Using the library

```bash
pnpm add @fiber-preflight/core
```

```ts
import { FiberRpcClient, buildGraph, preflight, canPay, explainFailure } from "@fiber-preflight/core";

const client = new FiberRpcClient({ url: "http://127.0.0.1:8227" });
const graph = await buildGraph(client);
const me = (await client.nodeInfo()).node_id!;

// "Can I pay?" before attempting:
const report = preflight(graph, {
  source: me,
  target: "0x03f1...",          // node id
  amount: 100_00000000n,        // 100 CKB in shannons (bigint everywhere)
});
report.verdict;      // 'likely' | 'uncertain' | 'unlikely' | 'impossible'
report.score;        // 0–100
report.routes;       // hop-by-hop candidates with fees + per-route scores
report.bottlenecks;  // typed, named constraints (e.g. 'tight_capacity')
report.suggestions;  // actionable copy

// Translate any raw Fiber failure into wallet-ready copy:
const diag = explainFailure("Failed to send payment: no route found to destination node");
diag.code;          // 'NO_ROUTE_FOUND'
diag.userMessage;   // "No payment path to the recipient could be found right now."
diag.retryable;     // true
```

Multi-asset: pass `asset: assetIdOf(udtTypeScript)` to route over a UDT (stablecoin) sub-network.

## REST API (served by the web app)

| Route | Method | Purpose |
|---|---|---|
| `/api/health` | GET | node reachability + `node_info` summary |
| `/api/graph/summary` | GET | node/channel counts, per-asset capacity, snapshot age |
| `/api/preflight` | POST `{ target, amount?, asset? }` | full `PreflightReport`; `target` may be a node id **or a Fiber invoice** (parsed via `parse_invoice`) |
| `/api/explain` | POST `{ error }` | translate a raw error (pure; works without a node). GET returns sample errors |
| `/api/pay` | POST `{ target, amount?, asset? }` | **demo/testnet only**: preflight → `send_payment` → poll `get_payment` → on failure, raw error **and** translated diagnostic |

Amounts are decimal display-unit strings (8 decimals), e.g. `"100"` = 100 CKB.
The graph is cached server-side and refreshed at most every 60 s; responses carry the snapshot age.

## What is real vs mocked

| Piece | Status |
|---|---|
| Graph sync, pagination, hex decoding, UDT parsing | **Real** — runs against any Fiber node RPC |
| Pathfinding, scoring, bottleneck analysis | **Real** — pure computation on the synced graph |
| Error translation catalog | **Real** — regex catalog built from Fiber's error surface; unknown errors fall back safely |
| Confidence scores | **Heuristic by design** — gossip announces *total* channel capacity, not directional balance (same limitation Lightning tools have). A score improves odds; it is never a guarantee |
| `FIBER_MOCK=true` network | **Mocked** — deterministic fixture graph + canned payment outcomes (`fixtures/`) so the repo runs with zero infrastructure |
| `/api/pay` | Real `send_payment`/`get_payment` in live mode; canned outcomes in mock mode |

## Deployment (single $4 droplet)

```bash
scp -r deploy user@droplet:~/fiber-preflight-deploy
ssh user@droplet "cd fiber-preflight-deploy && bash setup.sh"
```

`deploy/` contains `docker-compose.yml` (Fiber testnet node + web app + nginx), with the **RPC port
never exposed publicly** — only the web container reaches it over the internal docker network.
See [deploy/setup.sh](deploy/setup.sh); fund the node from the [Pudge faucet](https://faucet.nervos.org)
and open one channel for live routing data.

## Repo layout

```
packages/core/   @fiber-preflight/core — the library (tsup, ESM+CJS, typed)
apps/web/        Next.js demo + REST wrapper (standalone output)
fixtures/        mock graph + error samples (JSON exports of the fixture module)
deploy/          docker-compose, nginx, droplet setup script
docs/            error-catalog.md (full mapping table), scoring.md (heuristics)
```

## Tests

```bash
pnpm test   # 51 vitest tests: graph builder, Dijkstra/Yen, scoring scenarios, every error mapping
```

## Docs

- [docs/error-catalog.md](docs/error-catalog.md) — every diagnostic code, trigger patterns and copy
- [docs/scoring.md](docs/scoring.md) — the confidence heuristics, spelled out
- [demo-script.md](demo-script.md) — 3-minute video walkthrough sequence

## Roadmap

- Probe-based liquidity estimation (learn directional balance from payment attempts, LDK-style)
- Persist failure telemetry to sharpen scoring weights over time
- Multi-part payment planning (split across disjoint routes)
- CCH awareness: score Fiber→Lightning cross-chain hops
- Publish `@fiber-preflight/core` to npm; error catalog as community-maintained data

## License

MIT
