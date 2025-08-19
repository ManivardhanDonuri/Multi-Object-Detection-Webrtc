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
