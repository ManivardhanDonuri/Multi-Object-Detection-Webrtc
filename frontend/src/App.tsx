import React, { useEffect, useMemo, useRef, useState } from 'react';
import QRCode from 'qrcode';
import { Role, setupPeer, Facing } from './webrtc';
import { shortId, isMobile, nowMs, dataURLFromCanvas, bytesFromDataURL, sleep, isInAppBrowser } from './utils';
import { drawDetections, Detection } from './overlay';
import { WasmDetector, inferServer } from './detect';

const backend = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const defaultMode = (import.meta.env.VITE_DEFAULT_MODE || 'wasm') as 'wasm' | 'server';

export const App: React.FC = () => {
  const [room] = useState(() => new URLSearchParams(location.search).get('room') || shortId());
  const [role, setRole] = useState<Role>(() => (isMobile() ? 'sender' : 'viewer'));
  const [mode, setMode] = useState<'wasm'|'server'>(defaultMode);
  const [facing] = useState<Facing>('environment');
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<RTCDataChannel | undefined>();
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const wasm = useMemo(() => new WasmDetector(), []);
  const [stats, setStats] = useState<{fps:number, e2e:number}>({fps:0,e2e:0});
  const [started, setStarted] = useState<boolean>(false);

  useEffect(() => {
    const baseUrl = location.origin;
    const url = `${baseUrl}/?room=${room}`;
    QRCode.toDataURL(url, { margin: 1, width: 200 }).then(setQrDataUrl);
  }, [room]);

  useEffect(() => {
    if (!started) return;
    (async () => {
      await wasm.init();
      const video = videoRef.current!;
      const overlay = overlayRef.current!;
      overlay.width = 640; overlay.height = 480;
      const { data } = await setupPeer(room, role, video, facing);
      dataRef.current = data;
      if (role === 'sender' && data) {
        // Send frame meta periodically
        let frameId = 0;
        const loop = async () => {
          if (data.readyState === 'open') {
            frameId += 1;
            const capture_ts = nowMs();
            data.send(JSON.stringify({ frame_id: frameId, capture_ts }));
          }
          await sleep(1000/15);
          requestAnimationFrame(loop);
        };
        loop();
      }
      if (role === 'viewer') startRenderLoop();
    })();
  }, [role, room, facing, started]);

  async function startRenderLoop() {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const overlay = overlayRef.current!;
    const ctx = overlay.getContext('2d')!;
    canvas.width = 320; canvas.height = 240;
    overlay.width = 640; overlay.height = 480;

    const state: { lastMeta?: {frame_id:number, capture_ts:number}, lastTime:number, frames:number } = { lastTime: performance.now(), frames:0 };

    if (dataRef.current) {
      dataRef.current.onmessage = (ev) => {
        try { state.lastMeta = JSON.parse(ev.data); } catch {}
      };
    }

    async function tick() {
      if (video.readyState >= 2) {
        const cctx = canvas.getContext('2d')!;
        cctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        let dets: Detection[] = [];
        if (mode === 'wasm') {
          dets = await wasm.inferFromCanvas(canvas);
        } else {
          const meta = state.lastMeta || { frame_id: 0, capture_ts: nowMs() };
          const dataUrl = dataURLFromCanvas(canvas, 0.6);
          const resp = await inferServer(dataUrl, meta.frame_id, meta.capture_ts);
          dets = resp.detections;
          const e2e = nowMs() - meta.capture_ts;
          ingestMetric(e2e, bytesFromDataURL(dataUrl), 0);
          setStats((s)=>({ ...s, e2e }));
        }
        drawDetections(ctx, dets, overlay.width, overlay.height);
      }
      state.frames += 1;
      const now = performance.now();
      if (now - state.lastTime >= 1000) {
        setStats((s)=>({ ...s, fps: state.frames }));
        state.frames = 0; state.lastTime = now;
      }
      requestAnimationFrame(tick);
    }
    tick();
  }

  async function ingestMetric(e2e_latency_ms: number, bytes_uplink: number, bytes_downlink: number) {
    try {
      await fetch(`${backend}/metrics/ingest`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ ts: nowMs(), e2e_latency_ms, bytes_uplink, bytes_downlink }),
      });
    } catch {}
  }

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', padding: 16 }}>
      <h2>WebRTC VLM Multi-Object Detection</h2>
      <div style={{ display: 'flex', gap: 16, flexWrap: 'wrap' }}>
        <div>
          <div>Room: <code>{room}</code></div>
          <div>Role: 
            <select name="role" value={role} onChange={(e)=>setRole(e.target.value as Role)}>
              <option value="viewer">viewer (desktop)</option>
              <option value="sender">sender (phone)</option>
            </select>
          </div>
          {!started && (
            <div style={{marginTop:8}}>
              {isInAppBrowser() && (
                <div style={{ color: '#b45309', background: '#fffbeb', border: '1px solid #f59e0b', padding: 8, borderRadius: 6, marginBottom: 8 }}>
                  Detected an in-app browser. Camera may not work. Please open this link in your system browser (Chrome/Safari).
                </div>
              )}
              <button onClick={() => setStarted(true)}>Start</button>
            </div>
          )}
          <div>Mode: 
            <select name="mode" value={mode} onChange={(e)=>setMode(e.target.value as any)}>
              <option value="wasm">wasm (on-device)</option>
              <option value="server">server (HTTP infer)</option>
            </select>
          </div>
          
          {role === 'viewer' && qrDataUrl && (
            <div>
              <div>Scan on phone to join:</div>
              <img src={qrDataUrl} width={200} height={200} />
            </div>
          )}
          <div style={{marginTop:8}}>
            <div><b>FPS</b>: {stats.fps.toFixed(0)} | <b>E2E</b>: {stats.e2e.toFixed(0)} ms</div>
          </div>
        </div>
        <div style={{ position: 'relative' }}>
          <video ref={videoRef} playsInline muted={role==='sender'} style={{ width: 640, height: 480, background: '#000' }} />
          <canvas ref={overlayRef} style={{ position: 'absolute', left: 0, top: 0 }} />
          <canvas ref={canvasRef} style={{ display: 'none' }} />
        </div>
      </div>
    </div>
  );
};
