#!/usr/bin/env bash
set -euo pipefail
MODE=${1:-wasm}
export MODE
export VITE_BACKEND_URL=${VITE_BACKEND_URL:-http://localhost:8000}
if [[ "$MODE" != "server" && "$MODE" != "wasm" ]]; then
  echo "Usage: ./start.sh [server|wasm]"; exit 1
fi
COMPOSE_PROFILES=
export COMPOSE_PROFILES

if command -v docker-compose >/dev/null 2>&1; then
  exec docker-compose -f docker-compose.yml up --build
else
  exec docker compose -f docker-compose.yml up --build
fi
