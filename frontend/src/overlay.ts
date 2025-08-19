export type Detection = { label: string; score: number; xmin: number; ymin: number; xmax: number; ymax: number };

export function drawDetections(ctx: CanvasRenderingContext2D, dets: Detection[], w: number, h: number) {
  ctx.clearRect(0, 0, w, h);
  ctx.lineWidth = 2;
  for (const d of dets) {
    const x = d.xmin * w;
    const y = d.ymin * h;
    const ww = (d.xmax - d.xmin) * w;
    const hh = (d.ymax - d.ymin) * h;
    ctx.strokeStyle = '#00e0ff';
    ctx.strokeRect(x, y, ww, hh);
    const label = `${d.label} ${(d.score*100).toFixed(0)}%`;
    ctx.fillStyle = 'rgba(0,0,0,0.6)';
    ctx.fillRect(x, Math.max(0, y - 18), ctx.measureText(label).width + 8, 18);
    ctx.fillStyle = '#fff';
    ctx.font = '14px sans-serif';
    ctx.fillText(label, x + 4, Math.max(12, y - 4));
  }
}
