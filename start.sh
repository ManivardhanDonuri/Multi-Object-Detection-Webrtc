#!/usr/bin/env bash
set -euo pipefail

CMD=${1:-}

# Monolith mode: build and run single container serving frontend + backend
if [[ "${CMD}" == "monolith" || "${CMD}" == "mono" || "${CMD}" == "all" ]]; then
  echo "Building monolith image..."
  docker build -t webrtc-vlm-detect:all -f Dockerfile .
  echo "Starting container on http://localhost:9000 ..."
  docker rm -f webrtc-all >/dev/null 2>&1 || true
  docker run -d --name webrtc-all \
    -e MODE=${MODE:-wasm} \
    -p 9000:8000 \
    webrtc-vlm-detect:all
  echo "Health:    http://localhost:9000/health"
  echo "Frontend:  http://localhost:9000/"
  echo "WebSocket: ws://localhost:9000/ws?room=test"
  exit 0
fi

# Compose mode for two-container dev setup
MODE=${CMD:-wasm}
export MODE
export VITE_BACKEND_URL=${VITE_BACKEND_URL:-http://localhost:8000}
if [[ "$MODE" != "server" && "$MODE" != "wasm" ]]; then
  echo "Usage: ./start.sh [server|wasm|monolith]"; exit 1
fi
COMPOSE_PROFILES=
export COMPOSE_PROFILES

if command -v docker-compose >/dev/null 2>&1; then
  exec docker-compose -f docker-compose.yml up --build
else
  exec docker compose -f docker-compose.yml up --build
fi
