#!/usr/bin/env bash
# Fiber Preflight — droplet bootstrap (Ubuntu 24.04; works on the 512MB/$4 tier).
# Usage (from the repository root): sudo bash deploy/setup.sh
set -euo pipefail

die() {
  echo "ERROR: $*" >&2
  exit 1
}

if [ "${EUID}" -ne 0 ]; then
  die "this bootstrap needs root for swap, Docker, and firewall setup; rerun with: sudo bash deploy/setup.sh"
fi

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(cd -- "${SCRIPT_DIR}/.." && pwd)"

# Dockerfile.web builds the monorepo, so a deploy/-only upload cannot work.
for required in \
  package.json \
  pnpm-lock.yaml \
  pnpm-workspace.yaml \
  tsconfig.base.json \
  packages/core/package.json \
  packages/core/src/index.ts \
  apps/web/package.json \
  apps/web/app/page.tsx \
  apps/web/next.config.mjs \
  deploy/Dockerfile.web \
  deploy/docker-compose.yml \
  deploy/nginx.conf; do
  [ -f "${REPO_ROOT}/${required}" ] || \
    die "missing ${REPO_ROOT}/${required}; clone or copy the complete repository, not only deploy/"
done

cd "${SCRIPT_DIR}"

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
if ! docker compose version >/dev/null 2>&1; then
  die "Docker Compose v2 is required; install the docker-compose-plugin and rerun this script"
fi
if ! docker info >/dev/null 2>&1; then
  die "the Docker daemon is not running or is not reachable"
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
chmod 600 .env

echo "==> Fiber node key + config"
mkdir -p fiber-node/ckb
if [ ! -f fiber-node/ckb/key ]; then
  # 32-byte secp256k1 private key, hex-encoded — testnet only; fund via https://faucet.nervos.org
  openssl rand -hex 32 | tr -d '\n' > fiber-node/ckb/key
  chmod 600 fiber-node/ckb/key
  echo "    generated fiber-node/ckb/key"
fi

source .env
FIBER_IMAGE="${FIBER_IMAGE:-nervos/fiber:0.9.0-rc7}"
if [ ! -f fiber-node/config.yml ]; then
  echo "==> Materialising bundled testnet config from the image"
  docker run --rm -v "$(pwd)/fiber-node:/fiber" --entrypoint sh "$FIBER_IMAGE" \
    -c 'cp /usr/local/share/fiber/config/testnet/config.yml /fiber/config.yml'
fi

echo "==> Enforcing loopback-only Fiber RPC"
# The web container shares the Fiber node's network namespace, so it can use
# loopback without making the unauthenticated RPC reachable on the bridge.
sed -i 's/0\.0\.0\.0:8227/127.0.0.1:8227/g' fiber-node/config.yml
grep -Fq '127.0.0.1:8227' fiber-node/config.yml || \
  die "could not verify Fiber RPC at 127.0.0.1:8227; the image config format may have changed"
if grep -Fq '0.0.0.0:8227' fiber-node/config.yml; then
  die "refusing to start: Fiber RPC is configured on a non-loopback address"
fi

COMPOSE=(docker compose --project-directory "${SCRIPT_DIR}" --env-file "${SCRIPT_DIR}/.env" -f "${SCRIPT_DIR}/docker-compose.yml")

echo "==> Validating the stack"
"${COMPOSE[@]}" config >/dev/null

echo "==> Building the web app from ${REPO_ROOT}"
"${COMPOSE[@]}" build web

echo "==> Starting the stack"
COMPOSE_UP_HELP="$("${COMPOSE[@]}" up --help 2>&1)"
if grep -q -- '--wait-timeout' <<<"${COMPOSE_UP_HELP}"; then
  "${COMPOSE[@]}" up -d --remove-orphans --wait --wait-timeout 300
elif grep -q -- '--wait' <<<"${COMPOSE_UP_HELP}"; then
  "${COMPOSE[@]}" up -d --remove-orphans --wait
else
  "${COMPOSE[@]}" up -d --remove-orphans
fi

echo "==> Service status"
"${COMPOSE[@]}" ps

cat <<'EOF'

==> Done. Next steps:
  1. Enter the deployment dir:  cd deploy
  2. Watch the node:            docker compose logs -f fiber-node
  3. Fund the node with testnet CKB from the Pudge faucet: https://faucet.nervos.org
     (get the node's address from: docker compose exec fiber-node fnn-cli info)
  4. Open a channel to a public Fiber testnet node for live payment demos.
  5. The app is live on http://<droplet-ip>/ — the Fiber RPC port is NOT
     exposed publicly; only the web container can reach it.

Graph data (nodes/channels) flows in via gossip even before funding; payments
need a funded, open channel. To demo with the built-in fixture network instead,
set FIBER_MOCK=true in deploy/.env and rerun from the repository root:
  bash deploy/setup.sh
EOF
