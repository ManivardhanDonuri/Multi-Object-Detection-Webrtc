export function shortId(): string {
  return Math.random().toString(36).slice(2, 8);
}

export function isMobile(): boolean {
  return /Android|iPhone|iPad|iPod/i.test(navigator.userAgent);
}

export function sleep(ms: number) {
  return new Promise((res) => setTimeout(res, ms));
}

export function nowMs(): number { return Date.now(); }

export function dataURLFromCanvas(canvas: HTMLCanvasElement, quality = 0.6): string {
  return canvas.toDataURL('image/jpeg', quality);
}

export function bytesFromDataURL(dataUrl: string): number {
  const i = dataUrl.indexOf(',');
  const b64 = dataUrl.slice(i + 1);
  return Math.ceil(b64.length * 3 / 4);
}

export function isInAppBrowser(): boolean {
  const ua = navigator.userAgent || navigator.vendor || (window as any).opera || '';
  // Common in-app browsers that restrict camera/web APIs
  const patterns = [
    /FBAN|FBAV|Facebook/i,     // Facebook
    /Instagram/i,              // Instagram
    /Line/i,                   // LINE
    /Snapchat/i,               // Snapchat
    /Twitter/i,                // Twitter/X
    /WhatsApp/i,               // WhatsApp
    /WeChat|MicroMessenger/i,  // WeChat
  ];
  return patterns.some((p) => p.test(ua));
}

export function getBackendOrigin(): string {
  try {
    const url = new URL(window.location.href);
    const q = url.searchParams.get('backend');
    if (q) {
      localStorage.setItem('backend_url', q);
      return q;
    }
    const stored = localStorage.getItem('backend_url');
    if (stored) return stored;
  } catch {}
  const envVal = (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
  if (envVal) return envVal;
  // Local dev default
  if (location.hostname === 'localhost' || location.hostname === '127.0.0.1') {
    return 'http://localhost:8000';
  }
  // As a last resort, fall back to same origin (only works if backend is reverse-proxied)
  return `${location.protocol}//${location.host}`;
}
