import React, { useEffect, useMemo, useRef, useState } from 'react';
import * as QRCode from 'qrcode';
import { Role, setupPeer, Facing } from './webrtc';
import { shortId, isMobile, nowMs, dataURLFromCanvas, bytesFromDataURL, sleep, isInAppBrowser, getBackendOrigin } from './utils';
import { drawDetections, Detection } from './overlay';
import { WasmDetector, inferServer } from './detect';

const backend = import.meta.env.VITE_BACKEND_URL || 'http://localhost:8000';
const defaultMode = (import.meta.env.VITE_DEFAULT_MODE || 'wasm') as 'wasm' | 'server';

interface Stats {
  fps: number;
  e2e: number;
  detections: number;
  confidence: number;
  uptime: number;
}

interface DetectionStats {
  total: number;
  byLabel: Record<string, number>;
  averageConfidence: number;
}

export const App: React.FC = () => {
  const [room] = useState(() => new URLSearchParams(location.search).get('room') || shortId());
  const [role, setRole] = useState<Role>(() => (isMobile() ? 'sender' : 'viewer'));
  const [mode, setMode] = useState<'wasm'|'server'>(defaultMode);
  const [facing, setFacing] = useState<Facing>('environment');
  const [isStarted, setIsStarted] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [connectionStatus, setConnectionStatus] = useState<'disconnected' | 'connecting' | 'connected'>('disconnected');
  
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const overlayRef = useRef<HTMLCanvasElement>(null);
  const dataRef = useRef<RTCDataChannel | undefined>();
  
  const [qrDataUrl, setQrDataUrl] = useState<string>('');
  const wasm = useMemo(() => new WasmDetector(), []);
  const [stats, setStats] = useState<Stats>({ fps: 0, e2e: 0, detections: 0, confidence: 0, uptime: 0 });
  const [detectionStats, setDetectionStats] = useState<DetectionStats>({ total: 0, byLabel: {}, averageConfidence: 0 });
  const [recentDetections, setRecentDetections] = useState<Detection[]>([]);
  const [showStats, setShowStats] = useState(true);
  const [showQR, setShowQR] = useState(true);
  const [error, setError] = useState<string>('');

  const startTime = useRef<number>(Date.now());

  useEffect(() => {
    const baseUrl = location.origin;
    const url = `${baseUrl}/?room=${room}`;
    QRCode.toDataURL(url, { margin: 1, width: 200 }).then(setQrDataUrl);
  }, [room]);

  useEffect(() => {
    if (!isStarted) return;
    
    setIsConnecting(true);
    setError('');
    
    (async () => {
      try {
        // WASM default without a bundled model; safe fallback inside
        await wasm.init();
        const video = videoRef.current!;
        const overlay = overlayRef.current!;
        // Set initial overlay size - will be updated in render loop
        overlay.width = 640; overlay.height = 480;
        
        setConnectionStatus('connecting');
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
            if (isStarted) requestAnimationFrame(loop);
          };
          loop();
        }
        
        if (role === 'viewer') {
          startRenderLoop();
        }
        
        setConnectionStatus('connected');
        setIsConnecting(false);
      } catch (err) {
        setError(`Connection failed: ${err instanceof Error ? err.message : 'Unknown error'}`);
        setConnectionStatus('disconnected');
        setIsConnecting(false);
        setIsStarted(false);
      }
    })();
  }, [role, room, facing, isStarted]);

  async function startRenderLoop() {
    const video = videoRef.current!;
    const canvas = canvasRef.current!;
    const overlay = overlayRef.current!;
    const ctx = overlay.getContext('2d')!;
    
    // Make canvas responsive to video size
    const videoWidth = video.videoWidth || 640;
    const videoHeight = video.videoHeight || 480;
    const maxWidth = 800; // Maximum width for the canvas
    const maxHeight = 600; // Maximum height for the canvas
    
    let canvasWidth = videoWidth;
    let canvasHeight = videoHeight;
    
    // Scale down if video is too large
    if (canvasWidth > maxWidth) {
      const scale = maxWidth / canvasWidth;
      canvasWidth = maxWidth;
      canvasHeight = videoHeight * scale;
    }
    if (canvasHeight > maxHeight) {
      const scale = maxHeight / canvasHeight;
      canvasHeight = maxHeight;
      canvasWidth = canvasWidth * scale;
    }
    
    canvas.width = canvasWidth; 
    canvas.height = canvasHeight;
    overlay.width = canvasWidth; 
    overlay.height = canvasHeight;

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
          // Original static HTTP infer path
          const meta = state.lastMeta || { frame_id: 0, capture_ts: nowMs() };
          const dataUrl = dataURLFromCanvas(canvas, 0.6);
          const resp = await inferServer(dataUrl, meta.frame_id, meta.capture_ts);
          dets = resp.detections;
          const e2e = nowMs() - meta.capture_ts;
          ingestMetric(e2e, bytesFromDataURL(dataUrl), 0);
          setStats((s)=>({ ...s, e2e }));
        }
        
        // Update detection stats
        if (dets.length > 0) {
          const newStats = { total: dets.length, byLabel: {} as Record<string, number>, averageConfidence: 0 };
          let totalConfidence = 0;
          
          dets.forEach(det => {
            newStats.byLabel[det.label] = (newStats.byLabel[det.label] || 0) + 1;
            totalConfidence += det.score;
          });
          
          newStats.averageConfidence = totalConfidence / dets.length;
          setDetectionStats(newStats);
          setRecentDetections(dets.slice(0, 5));
        }
        
        drawDetections(ctx, dets, overlay.width, overlay.height);
        setStats(s => ({ ...s, detections: dets.length, confidence: dets.length > 0 ? dets.reduce((sum, d) => sum + d.score, 0) / dets.length : 0 }));
      }
      
      state.frames += 1;
      const now = performance.now();
      if (now - state.lastTime >= 1000) {
        const newStats = { ...stats, fps: state.frames, uptime: Math.floor((Date.now() - startTime.current) / 1000) };
        setStats(newStats);
        state.frames = 0; state.lastTime = now;
      }
      
      if (isStarted) requestAnimationFrame(tick);
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

  const handleStart = () => {
    setIsStarted(true);
    startTime.current = Date.now();
  };

  const handleStop = () => {
    setIsStarted(false);
    setConnectionStatus('disconnected');
    setStats({ fps: 0, e2e: 0, detections: 0, confidence: 0, uptime: 0 });
    setDetectionStats({ total: 0, byLabel: {}, averageConfidence: 0 });
    setRecentDetections([]);
  };

  const getStatusColor = () => {
    switch (connectionStatus) {
      case 'connected': return 'text-green-600';
      case 'connecting': return 'text-yellow-600';
      default: return 'text-red-600';
    }
  };

  const getStatusText = () => {
    switch (connectionStatus) {
      case 'connected': return 'Connected';
      case 'connecting': return 'Connecting...';
      default: return 'Disconnected';
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 p-4">
      <div className="max-w-7xl mx-auto">
        {/* Header */}
        <div className="bg-white rounded-lg shadow-lg p-6 mb-6">
          <h1 className="text-3xl font-bold text-gray-800 mb-2">WebRTC VLM Multi-Object Detection</h1>
          <p className="text-gray-600">Real-time object detection with WebRTC and ONNX Runtime Web</p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Control Panel */}
          <div className="lg:col-span-1 space-y-6">
            {/* Connection Status */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Connection Status</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Status:</span>
                  <span className={`font-semibold ${getStatusColor()}`}>{getStatusText()}</span>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Room:</span>
                  <code className="bg-gray-100 px-2 py-1 rounded text-sm">{room}</code>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-gray-600">Backend:</span>
                  <code className="bg-gray-100 px-2 py-1 rounded text-sm">{getBackendOrigin()}</code>
                </div>
              </div>
            </div>

            {/* Configuration */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Configuration</h2>
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Role</label>
                  <select 
                    value={role} 
                    onChange={(e) => setRole(e.target.value as Role)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isStarted}
                  >
                    <option value="viewer">Viewer (Desktop)</option>
                    <option value="sender">Sender (Mobile)</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Camera</label>
                  <select 
                    value={facing} 
                    onChange={(e) => setFacing(e.target.value as Facing)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isStarted}
                  >
                    <option value="environment">Back Camera</option>
                    <option value="user">Front Camera</option>
                  </select>
                </div>
                
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-2">Mode</label>
                  <select 
                    value={mode} 
                    onChange={(e) => setMode(e.target.value as any)}
                    className="w-full p-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                    disabled={isStarted}
                  >
                    <option value="wasm">WASM (On-device)</option>
                    <option value="server">Server (HTTP infer)</option>
                  </select>
                </div>
              </div>
            </div>

            {/* Controls */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Controls</h2>
              <div className="space-y-4">
                {!isStarted ? (
                  <button 
                    onClick={handleStart}
                    disabled={isConnecting}
                    className="w-full bg-blue-600 hover:bg-blue-700 disabled:bg-gray-400 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                  >
                    {isConnecting ? 'Starting...' : 'Start Detection'}
                  </button>
                ) : (
                  <button 
                    onClick={handleStop}
                    className="w-full bg-red-600 hover:bg-red-700 text-white font-semibold py-3 px-4 rounded-lg transition-colors"
                  >
                    Stop Detection
                  </button>
                )}
                
                <div className="flex space-x-2">
                  <button 
                    onClick={() => setShowStats(!showStats)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    {showStats ? 'Hide' : 'Show'} Stats
                  </button>
                  <button 
                    onClick={() => setShowQR(!showQR)}
                    className="flex-1 bg-gray-600 hover:bg-gray-700 text-white font-semibold py-2 px-4 rounded-lg transition-colors"
                  >
                    {showQR ? 'Hide' : 'Show'} QR
                  </button>
                </div>
              </div>
            </div>

            {/* QR Code */}
            {showQR && role === 'viewer' && qrDataUrl && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h2 className="text-xl font-semibold mb-4">Join Room</h2>
                <p className="text-gray-600 mb-4">Scan this QR code on your phone to join:</p>
                <div className="flex justify-center">
                  <img src={qrDataUrl} alt="QR Code" className="border-2 border-gray-200 rounded-lg" />
                </div>
              </div>
            )}

            {/* Error Display */}
            {error && (
              <div className="bg-red-50 border border-red-200 rounded-lg p-4">
                <h3 className="text-red-800 font-semibold mb-2">Error</h3>
                <p className="text-red-700">{error}</p>
              </div>
            )}
          </div>

          {/* Main Content */}
          <div className="lg:col-span-2 space-y-6">
            {/* Video Feed */}
            <div className="bg-white rounded-lg shadow-lg p-6">
              <h2 className="text-xl font-semibold mb-4">Live Feed</h2>
              <div className="flex flex-col xl:flex-row gap-6">
                {/* Video Container */}
                <div className="flex-1 min-w-0">
                  <div className="video-container w-full max-w-full">
                    <video 
                      ref={videoRef} 
                      playsInline 
                      muted={role==='sender'} 
                      className="bg-black rounded-lg shadow-lg"
                    />
                    <canvas 
                      ref={overlayRef} 
                      className="overlay"
                    />
                    <canvas ref={canvasRef} className="hidden" />
                  </div>
                </div>
                
                {/* Detection Info Panel */}
                <div className="xl:w-80 space-y-4 flex-shrink-0">
                  {/* Performance Stats */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Performance</h4>
                    <div className="grid grid-cols-2 gap-3">
                      <div className="text-center">
                        <div className="text-xl font-bold text-blue-600">{stats.fps}</div>
                        <div className="text-xs text-gray-600">FPS</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-green-600">{stats.e2e}ms</div>
                        <div className="text-xs text-gray-600">Latency</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-purple-600">{stats.detections}</div>
                        <div className="text-xs text-gray-600">Objects</div>
                      </div>
                      <div className="text-center">
                        <div className="text-xl font-bold text-orange-600">{stats.uptime}s</div>
                        <div className="text-xs text-gray-600">Uptime</div>
                      </div>
                    </div>
                  </div>
                  
                  {/* Detection Stats */}
                  <div className="bg-gray-50 rounded-lg p-4">
                    <h4 className="text-sm font-semibold text-gray-700 mb-3">Detections</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Total Objects:</span>
                        <span className="font-semibold">{detectionStats.total}</span>
                      </div>
                      <div className="flex justify-between text-sm">
                        <span className="text-gray-600">Avg Confidence:</span>
                        <span className="font-semibold">{(detectionStats.averageConfidence * 100).toFixed(1)}%</span>
                      </div>
                      {Object.entries(detectionStats.byLabel).length > 0 && (
                        <div>
                          <div className="text-xs text-gray-600 mb-2">By Type:</div>
                          {Object.entries(detectionStats.byLabel).map(([label, count]) => (
                            <div key={label} className="flex justify-between text-xs">
                              <span className="capitalize">{label}:</span>
                              <span>{count}</span>
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {/* Recent Detections */}
                  {recentDetections.length > 0 && (
                    <div className="bg-gray-50 rounded-lg p-4">
                      <h4 className="text-sm font-semibold text-gray-700 mb-3">Recent Detections</h4>
                      <div className="space-y-2">
                        {recentDetections.slice(0, 3).map((det, index) => (
                          <div key={index} className="bg-white rounded p-2 border-l-4 border-blue-500">
                            <div className="flex justify-between items-center mb-1">
                              <span className="text-sm font-medium capitalize">{det.label}</span>
                              <span className="text-xs text-gray-600">{(det.score * 100).toFixed(1)}%</span>
                            </div>
                            <div className="text-xs text-gray-500">
                              Box: ({det.xmin.toFixed(2)}, {det.ymin.toFixed(2)}) - ({det.xmax.toFixed(2)}, {det.ymax.toFixed(2)})
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Statistics */}
            {showStats && (
              <div className="bg-white rounded-lg shadow-lg p-6">
                <h3 className="text-lg font-semibold mb-4">Detailed Statistics</h3>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                  {/* Additional Performance Metrics */}
                  <div>
                    <h4 className="text-md font-semibold mb-3 text-gray-700">System Metrics</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Video Resolution:</span>
                        <span className="font-mono text-sm">{videoRef.current?.videoWidth || 0} x {videoRef.current?.videoHeight || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Canvas Size:</span>
                        <span className="font-mono text-sm">{canvasRef.current?.width || 0} x {canvasRef.current?.height || 0}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Connection Type:</span>
                        <span className="font-semibold capitalize">{role}</span>
                      </div>
                    </div>
                  </div>
                  
                  {/* Connection Info */}
                  <div>
                    <h4 className="text-md font-semibold mb-4">Connection Info</h4>
                    <div className="space-y-2">
                      <div className="flex justify-between">
                        <span className="text-gray-600">Mode:</span>
                        <span className="font-semibold capitalize">{mode}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Camera:</span>
                        <span className="font-semibold capitalize">{facing === 'environment' ? 'Back' : 'Front'}</span>
                      </div>
                      <div className="flex justify-between">
                        <span className="text-gray-600">Status:</span>
                        <span className={`font-semibold ${getStatusColor()}`}>{getStatusText()}</span>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            )}


          </div>
        </div>
      </div>
    </div>
  );
};
