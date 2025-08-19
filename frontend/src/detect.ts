import * as ort from 'onnxruntime-web';
import { Detection } from './overlay';

// Configure ONNX Runtime Web
ort.env.wasm.numThreads = 1; // Reduce threads to avoid cross-origin issues
ort.env.wasm.simd = false; // Disable SIMD for better compatibility

// Set the path to WASM files
ort.env.wasm.wasmPaths = {
  'ort-wasm.wasm': '/ort-wasm.wasm',
  'ort-wasm-simd.wasm': '/ort-wasm-simd.wasm',
  'ort-wasm-threaded.wasm': '/ort-wasm-threaded.wasm'
};

// WASM: simple heuristic fallback if model not loaded to keep CPU modest
export class WasmDetector {
  private session: ort.InferenceSession | null = null;
  private inputName: string | null = null;

  async init(modelUrl?: string) {
    try {
      if (modelUrl) {
        // Configure execution providers - use CPU as fallback if WASM fails
        const executionProviders = ['wasm', 'cpu'];
        
        this.session = await ort.InferenceSession.create(modelUrl, { 
          executionProviders,
          graphOptimizationLevel: 'all'
        });
        this.inputName = this.session.inputNames[0];
        console.log('ONNX Runtime session created successfully');
      }
    } catch (e) {
      console.warn('WASM model load failed, using heuristic fallback', e);
      this.session = null;
    }
  }

  async inferFromCanvas(canvas: HTMLCanvasElement): Promise<Detection[]> {
    const w = 320, h = 240;
    const ctx = canvas.getContext('2d')!;
    const tmp = document.createElement('canvas');
    tmp.width = w; tmp.height = h;
    const tctx = tmp.getContext('2d')!;
    tctx.drawImage(canvas, 0, 0, w, h);
    const img = tctx.getImageData(0, 0, w, h);
    if (!this.session || !this.inputName) {
      // Heuristic: find bright regions
      const dets: Detection[] = [];
      const thresh = 200;
      for (let y = 0; y < h; y += 40) {
        for (let x = 0; x < w; x += 40) {
          let s = 0;
          for (let yy = 0; yy < 40; yy += 8) {
            for (let xx = 0; xx < 40; xx += 8) {
              const i = ((y + yy) * w + (x + xx)) * 4;
              const r = img.data[i], g = img.data[i+1], b = img.data[i+2];
              s += (r + g + b) / 3;
            }
          }
          s /= (5*5);
          if (s > thresh) {
            dets.push({ label: 'object', score: 0.6, xmin: x/w, ymin: y/h, xmax: (x+40)/w, ymax: (y+40)/h });
          }
        }
      }
      return dets.slice(0, 5);
    }
    // Placeholder: real ONNX preprocessing would go here
    return [];
  }
}

export async function inferServer(dataUrl: string, frameId: string | number, captureTs: number): Promise<{frame_id: any, capture_ts: number, recv_ts: number, inference_ts: number, detections: Detection[]}> {
  const { getBackendOrigin } = await import('./utils');
  const backend = getBackendOrigin();
  const res = await fetch(`${backend}/infer`, {
    method: 'POST',
    body: toFormData(dataUrl, frameId, captureTs),
  });
  if (!res.ok) throw new Error('infer failed');
  return res.json();
}

function toFormData(dataUrl: string, frameId: string | number, captureTs: number): FormData {
  const fd = new FormData();
  const bin = dataURLtoBlob(dataUrl);
  fd.append('image', bin, 'frame.jpg');
  fd.append('frame_id', String(frameId));
  fd.append('capture_ts', String(captureTs));
  return fd;
}

function dataURLtoBlob(dataURL: string): Blob {
  const arr = dataURL.split(','), mime = arr[0].match(/:(.*?);/)![1], bstr = atob(arr[1]);
  let n = bstr.length; const u8arr = new Uint8Array(n);
  while (n--) { u8arr[n] = bstr.charCodeAt(n); }
  return new Blob([u8arr], { type: mime });
}
