#!/usr/bin/env bash
set -euo pipefail
DUR=30
MODE=server
while [[ $# -gt 0 ]]; do
  case "$1" in
    --duration) DUR="$2"; shift 2;;
    --mode) MODE="$2"; shift 2;;
    *) echo "Unknown arg $1"; exit 1;;
  esac
done

# Wait and sample metrics summary after DUR seconds
sleep "$DUR"
URL=${VITE_BACKEND_URL:-http://localhost:8000}
curl -s "$URL/metrics/summary?duration=$DUR" > /home/manivardhan-reddy/Projects/webrtc-vlm-detect/bench/metrics.json || echo '{"error":"no metrics"}' > /home/manivardhan-reddy/Projects/webrtc-vlm-detect/bench/metrics.json

echo "Wrote bench/metrics.json"
