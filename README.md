# Fiber Preflight

**Payment route confidence & failure diagnostics infrastructure for [Fiber Network](https://www.fiber.world/) (Nervos CKB).**

> Built for the *Gone in 60ms* Fiber Infrastructure Hackathon — Category 2: Node, Routing, Cross-Chain & Diagnostics Infrastructure.

Fiber payments today are fire-and-hope: there is **no way to check whether a payment will succeed before sending it**, and when it fails you get an opaque low-level error string. Fiber Preflight fixes both:

- ✅ **"Can I pay?"** — pre-flight any payment: route discovery, a 0–100 confidence score, hop-by-hop route candidates with fees, named bottlenecks, and actionable suggestions
- ✅ **"Why did it fail?"** — translate any raw Fiber error into a structured, wallet-ready diagnostic (category, severity, retryability, user-safe message, recovery steps)

```
┌─────────────┐   JSON-RPC    ┌──────────────────┐   REST    ┌─────────────┐
│ Fiber node   │ ───────────▶ │ @fiber-preflight │ ────────▶ │  Web UI /   │
│ (port 8227)  │  graph sync   │      /core       │  Next.js  │  your app   │
└─────────────┘               │ graph·routes·    │           └─────────────┘
                              │ score·diagnose   │
                              └──────────────────┘
```

---

## 🌐 Live demo (hosted on a real Fiber testnet node)

The hosted instance runs a **real Fiber testnet node** that syncs the public channel graph via gossip (~250+ nodes, ~1,000+ channels).

| What | Link |
|---|---|
| **Web app (Preflight UI)** | **http://137.184.103.156/** |
| Error decoder | http://137.184.103.156/decoder |
| Node health (JSON) | http://137.184.103.156/api/health |
| Network graph summary (JSON) | http://137.184.103.156/api/graph/summary |
| Sample errors for the decoder (JSON) | http://137.184.103.156/api/explain |

Try the API right now from any terminal:

```bash
# Is the Fiber node alive? How many peers?
curl http://137.184.103.156/api/health

# How big is the testnet graph this node sees?
curl http://137.184.103.156/api/graph/summary

# Pre-flight a payment between two real testnet nodes (50 CKB)
curl -X POST http://137.184.103.156/api/preflight \
  -H "content-type: application/json" \
  -d '{
    "source": "0293854f643b732f82245942146263089a9e4acc40423ec472577851e7cf65e4ca",
    "target": "030316914a75e8f18faf82e8e6dd166f2aaa1f96105f98c099be4f3be073140eaf",
    "amount": "50"
  }'

# Translate a raw Fiber error into a wallet-ready diagnostic
curl -X POST http://137.184.103.156/api/explain \
  -H "content-type: application/json" \
  -d '{"error": "Failed to send payment: no route found to destination node"}'
```

---

## 🚀 Quickstart — run it locally in 3 commands (zero infrastructure)

Requirements: **Node.js ≥ 20** and **pnpm** (`npm i -g pnpm`).

```bash
git clone https://github.com/BigDella/Fiber-Preflight.git
cd Fiber-Preflight
pnpm install && pnpm build && pnpm dev
```

Open **http://localhost:3000**. No Fiber node needed: with `FIBER_RPC_URL` unset the app automatically runs in **mock mode** against a deterministic fixture network (30 nodes, ~40 channels, CKB + a "RUSD" stablecoin UDT) that includes a low-capacity chokepoint, an unreachable island node and a disabled channel — so every verdict class is demonstrable.

**Try it:** pick a scenario from the *Demo scenarios* dropdown (e.g. "Chokepoint — 100 CKB to remote-village") and click **Run preflight**. Then click **Preflight + pay (testnet)** on the "Unreachable — island-node" scenario to see the prediction, the failed payment, and the translated diagnostic side by side.

Run the test suite (54 tests — graph builder, pathfinding, scoring scenarios, every error mapping):

```bash
pnpm test
```

---

## 🖥️ Set up your own Fiber node + Fiber Preflight (full stack)

This is exactly how the live demo is deployed. Works on any Ubuntu server — including a **$4 / 512MB DigitalOcean droplet** (the setup script adds swap automatically).

### Option A — one script (recommended)

```bash
git clone https://github.com/BigDella/Fiber-Preflight.git
cd Fiber-Preflight/deploy
bash setup.sh
```

The script: creates 2GB swap → installs Docker → opens firewall ports (22, 80, 8228) → generates a node key + password → materialises the official testnet config from the `nervos/fiber` image → starts three containers:

| Container | Purpose | Exposure |
|---|---|---|
| `fiber-node` | official Fiber testnet node (`nervos/fiber:0.9.0-rc7`) | p2p `:8228` public; **RPC `:8227` loopback-only, never public** |
| `web` | this app (Next.js) | internal only — shares the node's network namespace so it reaches RPC at `127.0.0.1:8227` |
| `nginx` | reverse proxy | `:80` public |

### Option B — step by step (understand every move)

```bash
# 1. (small servers) add swap
fallocate -l 2G /swapfile && chmod 600 /swapfile && mkswap /swapfile && swapon /swapfile

# 2. install docker
curl -fsSL https://get.docker.com | sh

# 3. clone and enter the deploy dir
git clone https://github.com/BigDella/Fiber-Preflight.git && cd Fiber-Preflight/deploy

# 4. secrets: node key password + mode
echo "FIBER_SECRET_KEY_PASSWORD=$(openssl rand -hex 16)" > .env
echo "FIBER_MOCK=false" >> .env

# 5. node private key (testnet!)
mkdir -p fiber-node/ckb
openssl rand -hex 32 | tr -d '\n' > fiber-node/ckb/key && chmod 600 fiber-node/ckb/key

# 6. materialise the official testnet config bundled in the image
docker run --rm -v "$(pwd)/fiber-node:/fiber" --entrypoint sh nervos/fiber:0.9.0-rc7 \
  -c 'cp /usr/local/share/fiber/config/testnet/config.yml /fiber/config.yml'

# 7. start everything (builds the web image on first run)
docker compose up -d --build
```

> **Building on a small server?** 512MB is too little RAM to build Next.js. Build the image on your own machine and ship it instead:
> ```bash
> docker build -f deploy/Dockerfile.web -t fiber-preflight-web:latest .
> docker save fiber-preflight-web:latest | gzip | ssh root@YOUR_SERVER 'gunzip | docker load'
> ssh root@YOUR_SERVER 'cd Fiber-Preflight/deploy && docker compose up -d --no-build'
> ```

### How do I know it's working?

```bash
# all three containers should say "Up"
docker compose ps

# node logs: peers connecting, gossip syncing
docker compose logs -f fiber-node

# from anywhere on the internet:
curl http://YOUR_SERVER_IP/api/health          # {"ok":true,"mock":false,...peersCount...}
curl http://YOUR_SERVER_IP/api/graph/summary   # nodeCount/channelCount grow as gossip syncs
```

Open `http://YOUR_SERVER_IP/` in a browser — the header badge shows **node online** with live node/channel counts and the graph snapshot age. Gossip takes a minute or two to warm up after first boot.

### Funding the node (optional — needed only for real payments)

Graph sync, preflight and diagnostics all work **without any funds**. To demo a real `send_payment`:

1. Get testnet CKB from the [Pudge faucet](https://faucet.nervos.org)
2. Open a channel to a public testnet node (via `open_channel` RPC or [fiber-pay CLI](https://github.com/RetricSu/fiber-pay))

---

## 📱 Using the application

### Preflight page (`/`)

1. Enter a **target** — a node ID (`02…`/`03…` hex) or a Fiber invoice (`fibt…`); invoices are parsed automatically (amount + asset come from the invoice)
2. Enter an **amount** (display units, e.g. `100` = 100 CKB) and pick an **asset** (CKB or any UDT seen on the graph, e.g. RUSD)
3. Click **Run preflight** → you get:
   - **Verdict**: `likely` / `uncertain` / `unlikely` / `impossible` + **score 0–100**
   - **Route candidates**: up to 5 routes, hop-by-hop with channel capacities, fee rates and per-route scores
   - **Bottlenecks**: named constraints (tight capacity, single route, no inbound, stale graph…)
   - **Suggestions**: what to do about it
4. **Preflight + pay (testnet)** additionally attempts the real payment and shows *prediction vs outcome* — on failure, the raw error **and** its translated diagnostic

In mock mode a **Demo scenarios** dropdown pre-fills six curated cases (healthy, chokepoint, unreachable, oversized, stablecoin, invoice).

### Error decoder page (`/decoder`)

Paste any raw Fiber error (or pick one of 12 built-in samples) → get the structured diagnostic: stable code, category, severity, retryability, technical explanation, wallet-ready user message and recovery suggestions.

### REST API

| Route | Method | Body | Purpose |
|---|---|---|---|
| `/api/health` | GET | — | node reachability + `node_info` summary ([live](http://137.184.103.156/api/health)) |
| `/api/graph/summary` | GET | — | node/channel counts, per-asset capacity, snapshot age ([live](http://137.184.103.156/api/graph/summary)) |
| `/api/preflight` | POST | `{ target, amount?, asset?, source? }` | full `PreflightReport`; `target` may be a node id or invoice; `source` defaults to the local node — override it to ask *"can node A pay node B?"* |
| `/api/explain` | GET / POST | `{ error }` | GET lists sample errors ([live](http://137.184.103.156/api/explain)); POST translates any raw error — pure function, works without a node |
| `/api/pay` | POST | `{ target, amount?, asset? }` | **testnet demo**: preflight → `send_payment` → poll `get_payment` → on failure returns raw error + translated diagnostic |

Amounts are decimal strings in display units (8 decimals): `"100"` = 100 CKB. The graph is cached server-side and refreshed at most every 60s.

---

## 📦 Using the library in your own project

`@fiber-preflight/core` is a pure TypeScript library (zero UI dependencies, ESM + CJS, fully typed):

```ts
import { FiberRpcClient, buildGraph, preflight, canPay, explainFailure } from "@fiber-preflight/core";

const client = new FiberRpcClient({ url: "http://127.0.0.1:8227" });
const graph = await buildGraph(client);            // paginated gossip sync
const me = (await client.nodeInfo()).pubkey!;

const report = preflight(graph, {
  source: me,
  target: "0x03f1...",           // node id
  amount: 100_00000000n,         // 100 CKB in shannons (bigint everywhere)
});
report.verdict;      // 'likely' | 'uncertain' | 'unlikely' | 'impossible'
report.score;        // 0–100
report.routes;       // hop-by-hop candidates with fees + per-route scores
report.bottlenecks;  // typed constraints, e.g. 'tight_capacity'

const diag = explainFailure("Failed to send payment: no route found");
diag.code;           // 'NO_ROUTE_FOUND'
diag.userMessage;    // "No payment path to the recipient could be found right now."
diag.retryable;      // true
```

Multi-asset: pass `asset: assetIdOf(udtTypeScript)` to route over a UDT (stablecoin) sub-network. For CI or apps without a node, `new MockFiberClient()` is a drop-in replacement.

---

## 🔍 What is real vs mocked

| Piece | Status |
|---|---|
| Graph sync, pagination, hex decoding, UDT parsing | **Real** — runs against any Fiber node RPC (verified on testnet: 250+ nodes, 1,000+ channels) |
| Pathfinding (Dijkstra + Yen k-shortest), scoring, bottleneck analysis | **Real** — pure computation on the synced graph |
| Error translation catalog (16 codes) | **Real** — built from Fiber's error surface; unknown errors fall back safely |
| Confidence scores | **Heuristic by design** — gossip announces *total* channel capacity, not directional balance (same limitation Lightning tools have). A score improves odds; it is never a guarantee |
| `FIBER_MOCK=true` network | **Mocked** — deterministic fixture graph + canned payment outcomes (`fixtures/`) so the repo runs with zero infrastructure |
| `/api/pay` | Real `send_payment` / `get_payment` in live mode; canned outcomes in mock mode |

---

## 🗂 Repo layout

```
packages/core/   @fiber-preflight/core — the library (tsup, ESM+CJS, typed, 54 tests)
apps/web/        Next.js demo + REST wrapper (standalone output for Docker)
fixtures/        mock graph + error samples (JSON exports of the fixture module)
deploy/          docker-compose, nginx, droplet setup script
docs/            error-catalog.md (full mapping table), scoring.md (heuristics)
demo-script.md   3-minute demo video walkthrough
```

## ⚙️ Environment variables (apps/web/.env.example)

| Var | Default | Meaning |
|---|---|---|
| `FIBER_RPC_URL` | — | Fiber node JSON-RPC endpoint (server-side only, never sent to the browser) |
| `FIBER_MOCK` | auto | `true` = fixture network; auto-enabled when `FIBER_RPC_URL` is unset |
| `FIBER_ASSET_LABELS` | — | label known UDTs, e.g. `udt:<code_hash>:<hash_type>:<args>=RUSD` |
| `FIBER_DEBUG` | `0` | `1` logs raw RPC payloads |

## 📚 Docs

- [docs/error-catalog.md](docs/error-catalog.md) — every diagnostic code, trigger patterns and copy
- [docs/scoring.md](docs/scoring.md) — the confidence heuristics, spelled out
- [demo-script.md](demo-script.md) — 3-minute video walkthrough sequence

## 🛣 Roadmap

- Probe-based liquidity estimation (learn directional balance from payment attempts, LDK-style)
- Persist failure telemetry to sharpen scoring weights over time
- Multi-part payment planning (split across disjoint routes)
- CCH awareness: score Fiber→Lightning cross-chain hops
- Publish `@fiber-preflight/core` to npm; error catalog as community-maintained data

## License

[MIT](LICENSE)
