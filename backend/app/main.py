import asyncio
import json
import os
import time
from typing import Dict, Any, Optional

from fastapi import FastAPI, WebSocket, WebSocketDisconnect, UploadFile, File, Form, Query
from fastapi.responses import HTMLResponse
from fastapi.middleware.cors import CORSMiddleware

from aiortc import RTCPeerConnection, RTCSessionDescription
from aiortc.contrib.media import MediaBlackhole

import numpy as np
import cv2
import onnxruntime as ort

MODE = os.getenv("MODE", "wasm")

app = FastAPI()

origins = os.getenv("CORS_ORIGINS", "").split(",") if os.getenv("CORS_ORIGINS") else ["*"]
app.add_middleware(
    CORSMiddleware,
    allow_origins=origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class SimpleDetector:
    def __init__(self) -> None:
        # Placeholder detector: returns empty list; replace with real ONNX model if MODE==server
        self.input_size = (240, 320)
        self.labels = ["person", "bottle", "cup", "phone"]
        self.last_frame: Optional[np.ndarray] = None
        self.session: Optional[ort.InferenceSession] = None
        self._maybe_init_model()

    def _maybe_init_model(self) -> None:
        if MODE == "server":
            # Load a tiny ONNX model if available (user can mount). For now, keep None and produce mock detections.
            try:
                model_path = os.getenv("ONNX_MODEL", "")
                if model_path and os.path.exists(model_path):
                    providers = ["CPUExecutionProvider"]
                    self.session = ort.InferenceSession(model_path, providers=providers)
            except Exception:
                self.session = None

    def infer(self, frame: np.ndarray) -> list[Dict[str, Any]]:
        # Downscale and simulate detection to keep CPU modest
        h, w = frame.shape[:2]
        resized = cv2.resize(frame, (self.input_size[1], self.input_size[0]))
        gray = cv2.cvtColor(resized, cv2.COLOR_BGR2GRAY)
        # Simple motion-like heuristic to fake some boxes for demo
        _, thresh = cv2.threshold(gray, 0, 255, cv2.THRESH_OTSU)
        contours, _ = cv2.findContours(thresh, cv2.RETR_EXTERNAL, cv2.CHAIN_APPROX_SIMPLE)
        detections: list[Dict[str, Any]] = []
        for c in contours[:3]:
            x, y, cw, ch = cv2.boundingRect(c)
            if cw * ch < 200:  # filter tiny
                continue
            xmin = x / self.input_size[1]
            ymin = y / self.input_size[0]
            xmax = (x + cw) / self.input_size[1]
            ymax = (y + ch) / self.input_size[0]
            detections.append({
                "label": np.random.choice(self.labels).item(),
                "score": float(np.random.uniform(0.5, 0.95)),
                "xmin": float(xmin),
                "ymin": float(ymin),
                "xmax": float(xmax),
                "ymax": float(ymax),
            })
        return detections


detector = SimpleDetector()
latest_result: Optional[Dict[str, Any]] = None


@app.get("/")
async def root():
    return {"status": "ok", "mode": MODE}


# Minimal signaling over WebSocket for WebRTC SDP exchange (room-based)
rooms: Dict[str, Dict[str, WebSocket]] = {}


@app.websocket("/ws")
async def ws_endpoint(ws: WebSocket, room: str = Query("default")):
    await ws.accept()
    client_id = str(id(ws))
    if room not in rooms:
        rooms[room] = {}
    rooms[room][client_id] = ws
    try:
        while True:
            message = await ws.receive_text()
            for cid, cws in list(rooms.get(room, {}).items()):
                if cid == client_id:
                    continue
                try:
                    await cws.send_text(message)
                except Exception:
                    pass
    except WebSocketDisconnect:
        try:
            rooms[room].pop(client_id, None)
            if not rooms[room]:
                rooms.pop(room, None)
        except KeyError:
            pass


# Minimal WebRTC endpoint for server-side inference pathway
@app.post("/offer")
async def offer(sdp: Dict[str, Any]):
    pc = RTCPeerConnection()
    media_blackhole = MediaBlackhole()
    result_queue: asyncio.Queue[Dict[str, Any]] = asyncio.Queue(maxsize=1)

    @pc.on("track")
    def on_track(track):
        async def recv_frames():
            frame_id = 0
            last_sent_ts = 0.0
            async for frame in track.recv():
                frame_id += 1
                capture_ts = int(time.time() * 1000)
                img = frame.to_ndarray(format="bgr24")
                recv_ts = int(time.time() * 1000)
                t0 = time.time()
                dets = detector.infer(img)
                inference_ts = int(time.time() * 1000)
                message = {
                    "frame_id": frame_id,
                    "capture_ts": capture_ts,
                    "recv_ts": recv_ts,
                    "inference_ts": inference_ts,
                    "detections": dets,
                }
                # Backpressure: keep only latest
                while not result_queue.empty():
                    try:
                        result_queue.get_nowait()
                    except Exception:
                        break
                await result_queue.put(message)
                global latest_result
                latest_result = message
                # Avoid overwhelming CPU
                elapsed = time.time() - t0
                await asyncio.sleep(max(0.0, 1.0 / 15.0 - elapsed))
        asyncio.create_task(recv_frames())

    @pc.on("connectionstatechange")
    async def on_connstate():
        if pc.connectionState in ("failed", "closed", "disconnected"):
            await pc.close()

    offer_obj = RTCSessionDescription(sdp=sdp["sdp"], type=sdp["type"])  # type: ignore
    await pc.setRemoteDescription(offer_obj)
    for t in pc.getTransceivers():
        if t.kind == "video":
            pass
    answer = await pc.createAnswer()
    await pc.setLocalDescription(answer)

    async def notifier():
        # Dummy notifier loop; in a full app we'd use datachannel; we keep REST pull in frontend
        while True:
            await asyncio.sleep(1)
            if pc.connectionState in ("closed", "failed", "disconnected"):
                break
    asyncio.create_task(notifier())

    return {"sdp": pc.localDescription.sdp, "type": pc.localDescription.type}


@app.get("/latest")
async def latest():
    # Pull latest inference result (for server mode). If none, return empty detections
    return latest_result or {"frame_id": -1, "capture_ts": 0, "recv_ts": 0, "inference_ts": 0, "detections": []}


@app.post("/infer")
async def infer_endpoint(
    image: UploadFile = File(...),
    frame_id: str = Form(...),
    capture_ts: int = Form(...),
):
    # Decode JPEG/PNG and run detection on server
    data = await image.read()
    buf = np.frombuffer(data, dtype=np.uint8)
    img = cv2.imdecode(buf, cv2.IMREAD_COLOR)
    recv_ts = int(time.time() * 1000)
    dets = detector.infer(img)
    inference_ts = int(time.time() * 1000)
    response = {
        "frame_id": frame_id,
        "capture_ts": capture_ts,
        "recv_ts": recv_ts,
        "inference_ts": inference_ts,
        "detections": dets,
    }
    global latest_result
    latest_result = response
    return response


# Simple in-memory metrics aggregation
metrics_store: list[Dict[str, Any]] = []


@app.post("/metrics/ingest")
async def metrics_ingest(payload: Dict[str, Any]):
    metrics_store.append(payload)
    # Limit memory
    if len(metrics_store) > 10000:
        del metrics_store[: len(metrics_store) - 10000]
    return {"ok": True}


@app.get("/metrics/summary")
async def metrics_summary(duration: int = 30):
    # duration is seconds window from now
    now_ms = int(time.time() * 1000)
    window_ms = duration * 1000
    window = [m for m in metrics_store if m.get("ts", 0) >= now_ms - window_ms]
    if not window:
        return {
            "count": 0,
            "median_latency_ms": None,
            "p95_latency_ms": None,
            "fps": 0.0,
            "kbps_uplink": 0.0,
            "kbps_downlink": 0.0,
        }
    lats = sorted([m.get("e2e_latency_ms", 0.0) for m in window])
    def pct(p: float) -> float:
        if not lats:
            return 0.0
        idx = min(len(lats) - 1, max(0, int(round(p * (len(lats) - 1)))))
        return float(lats[idx])
    duration_s = max(1.0, (window[-1]["ts"] - window[0]["ts"]) / 1000.0)
    fps = len(window) / duration_s
    kbps_uplink = sum(m.get("bytes_uplink", 0) for m in window) * 8.0 / 1000.0 / duration_s
    kbps_downlink = sum(m.get("bytes_downlink", 0) for m in window) * 8.0 / 1000.0 / duration_s
    return {
        "count": len(window),
        "median_latency_ms": pct(0.5),
        "p95_latency_ms": pct(0.95),
        "fps": fps,
        "kbps_uplink": kbps_uplink,
        "kbps_downlink": kbps_downlink,
    }
