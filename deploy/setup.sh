#!/usr/bin/env bash
# Fiber Preflight — droplet bootstrap (Ubuntu 24.04, 1GB RAM is enough).
# Usage: bash deploy/setup.sh
set -euo pipefail

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

cd "$(dirname "$0")"

echo "==> Preparing Fiber node config"
mkdir -p fiber-config fiber-data
if [ ! -f fiber-config/config.yml ]; then
  cat > fiber-config/config.yml <<'YAML'
# Minimal Fiber testnet config — see github.com/nervosnetwork/fiber/tree/develop/docker
# and https://www.fiber.world/docs/quick-start/run-a-node/rust for full reference.
fiber:
  listening_addr: "/ip4/0.0.0.0/tcp/8228"
  announce_listening_addr: true
  chain: testnet
  # bootnodes for the Fiber testnet (verify current values in the Fiber docs):
  bootnode_addrs:
    - "/ip4/18.162.235.225/tcp/8119/p2p/QmXen3eUHhywmutEzydCsW4hXBoeVmdET2FJvMX69XJ1Eo"
    - "/ip4/18.163.235.54/tcp/8119/p2p/QmbKyzq9qUmymW2Gi8Zq7kKVWjq2wgK4tL1BSVJfvmQZWg"
rpc:
  listening_addr: "0.0.0.0:8227"
ckb:
  rpc_url: "https://testnet.ckb.dev/"
  udt_whitelist: []
YAML
  echo "    wrote fiber-config/config.yml — REVIEW bootnodes/UDT whitelist before going live"
fi

if [ ! -f .env ]; then
  echo "FIBER_SECRET_KEY_PASSWORD=$(openssl rand -hex 16)" > .env
  echo "FIBER_MOCK=false" >> .env
  echo "    wrote deploy/.env with a generated node key password (keep it safe!)"
fi

echo "==> Building and starting the stack"
docker compose up -d --build

cat <<'EOF'

==> Done. Next steps:
  1. Watch the node sync:        docker compose logs -f fiber-node
  2. Fund the node with testnet CKB from the Pudge faucet: https://faucet.nervos.org
  3. Open a channel to a public Fiber testnet node (open_channel RPC via
     docker compose exec, or use fiber-pay CLI).
  4. The app is live on http://<droplet-ip>/ — the Fiber RPC port is NOT
     exposed publicly; only the web container can reach it.

Until a channel is open, live routing data may be sparse. To demo with the
built-in fixture network instead, set FIBER_MOCK=true in deploy/.env and
`docker compose up -d web`.
EOF
