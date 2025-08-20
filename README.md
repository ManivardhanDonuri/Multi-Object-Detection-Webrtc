## WebRTC VLM Multi-Object Detection Demo (Server + WASM)

One-command demo streaming from phone browser → desktop with real-time detection overlay.

### Live Demo
- Live demo: https://multi-object-detection-webrtc-production.up.railway.app/
- Deployed on Railway (https://railway.app/)

### Run
- One command: `./start.sh wasm` (or `./start.sh server`)
- Open frontend: `http://localhost:5173`
- Join from phone using QR in the page, or go to the short URL shown.

### Modes
- wasm: on-device detection via onnxruntime-web (quantized SSD/YOLO, 320x240 @ 10-15 FPS)
- server: server-side detection via aiortc + ONNX Runtime CPU

### Bench
```bash
./bench/run_bench.sh --duration 30 --mode server
```
Outputs `bench/metrics.json` with median/p95 E2E latency, FPS, and kbps.

### Deliverables
- docker-compose for frontend and backend
- start.sh for mode switching
- QR connect, overlay, contract-compliant JSON per frame
- Report appendix in this README

### API Contract (Server → Client per frame)
```json
{
  "frame_id": "string_or_int",
  "capture_ts": 1690000000000,
  "recv_ts": 1690000000100,
  "inference_ts": 1690000000120,
  "detections": [
    { "label": "person", "score": 0.93, "xmin": 0.12, "ymin": 0.08, "xmax": 0.34, "ymax": 0.67 }
  ]
}
```
Coordinates normalized [0..1].

### Troubleshooting
- If CPU is high, use 320x240 and 10 FPS in settings.
- If timestamps misalign, ensure phone and desktop use correct timezone; page applies capture_ts alignment.

### Appendix: Design, low-resource mode, backpressure
- Signaling via backend WebSocket; peer uses WebRTC.
- Backpressure: latest-frame only for inference; drop older frames.
- Low-resource: quantized model, 320x240, stride decode, NMS on CPU, cap FPS.

### QR Join Flow
- Desktop opens `http://localhost:5173` and shows a QR code containing the room URL.
- Phone scans QR and opens the same URL; it joins as `sender` automatically.
- Desktop acts as `viewer`. The two peers connect via backend WS signaling and exchange WebRTC offer/answer.

### Report Appendix (Design, Low-Resource Mode, Backpressure)
- Signaling: room-based WebSocket broadcast. Only peers in same room receive SDP/candidates.
- Transport: STUN-only ICE, no TURN by default for simplicity.
- Inference:
  - WASM: `onnxruntime-web` with quantized small model (hook point). Fallback heuristic ensures demo runs on any CPU.
  - Server: HTTP `/infer` with JPEG-compressed frames at 320×240, ~15 FPS.
- Backpressure: Viewer only submits latest frame for inference. Server retains only the latest result and drops older.
- Low-resource: 320×240, JPEG quality 0.6, 10–15 FPS, minimal drawing, single-thread JS.
- Metrics: Frontend reports e2e latency (capture_ts→now), uplink bytes; backend aggregates p50/p95, FPS, kbps.

### One-line Improvement
Use a tiny quantized YOLO (e.g., YOLOv5n-int8 ONNX) with postprocessing in WASM for higher precision at similar CPU.
