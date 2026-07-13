#!/usr/bin/env bash
# Fiber Preflight — droplet bootstrap (Ubuntu 24.04; works on the 512MB/$4 tier).
# Usage: bash deploy/setup.sh
set -euo pipefail
cd "$(dirname "$0")"

echo "==> Ensuring swap (small droplets cannot run the stack without it)"
if ! swapon --show | grep -q .; then
  fallocate -l 2G /swapfile
  chmod 600 /swapfile
  mkswap /swapfile
  swapon /swapfile
  grep -q '/swapfile' /etc/fstab || echo '/swapfile none swap sw 0 0' >> /etc/fstab
fi

echo "==> Installing Docker"
if ! command -v docker >/dev/null 2>&1; then
  curl -fsSL https://get.docker.com | sh
fi

echo "==> Firewall"
if command -v ufw >/dev/null 2>&1; then
  ufw allow 22/tcp >/dev/null
  ufw allow 80/tcp >/dev/null
  ufw allow 8228/tcp >/dev/null   # Fiber p2p; RPC 8227 stays internal
  yes | ufw enable >/dev/null || true
fi

echo "==> Secrets"
if [ ! -f .env ]; then
  echo "FIBER_SECRET_KEY_PASSWORD=$(openssl rand -hex 16)" > .env
  echo "FIBER_MOCK=false" >> .env
  echo "    wrote deploy/.env with a generated node key password (keep it safe!)"
fi

echo "==> Fiber node key + config"
mkdir -p fiber-node/ckb
if [ ! -f fiber-node/ckb/key ]; then
  # 32-byte secp256k1 private key, hex-encoded — testnet only; fund via https://faucet.nervos.org
  openssl rand -hex 32 | tr -d '\n' > fiber-node/ckb/key
  chmod 600 fiber-node/ckb/key
  echo "    generated fiber-node/ckb/key"
fi

source .env
FIBER_IMAGE="${FIBER_IMAGE:-ghcr.io/nervosnetwork/fiber:v0.9.0-rc7}"
if [ ! -f fiber-node/config.yml ]; then
  echo "==> Materialising bundled testnet config from the image"
  docker run --rm -v "$(pwd)/fiber-node:/fiber" --entrypoint sh "$FIBER_IMAGE" \
    -c 'cp /usr/local/share/fiber/config/testnet/config.yml /fiber/config.yml'
  # RPC must listen on the docker network (still never published to the internet)
  sed -i 's/127\.0\.0\.1:8227/0.0.0.0:8227/' fiber-node/config.yml
fi

echo "==> Starting the stack"
# --no-build lets a pre-loaded fiber-preflight-web:latest image be used as-is
# (build on the droplet only if the image is absent AND you have >=2GB RAM+swap)
docker compose up -d --no-build || docker compose up -d --build

cat <<'EOF'

==> Done. Next steps:
  1. Watch the node:            docker compose logs -f fiber-node
  2. Fund the node with testnet CKB from the Pudge faucet: https://faucet.nervos.org
     (get the node's address from: docker compose exec fiber-node fnn-cli info)
  3. Open a channel to a public Fiber testnet node for live payment demos.
  4. The app is live on http://<droplet-ip>/ — the Fiber RPC port is NOT
     exposed publicly; only the web container can reach it.

Graph data (nodes/channels) flows in via gossip even before funding; payments
need a funded, open channel. To demo with the built-in fixture network instead,
set FIBER_MOCK=true in deploy/.env and: docker compose up -d web
EOF
