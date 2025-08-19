export interface Detection {
  label: string;
  score: number;
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

const colors = [
  '#FF6B6B', '#4ECDC4', '#45B7D1', '#96CEB4', '#FFEAA7',
  '#DDA0DD', '#98D8C8', '#F7DC6F', '#BB8FCE', '#85C1E9'
];

export function drawDetections(
  ctx: CanvasRenderingContext2D,
  detections: Detection[],
  canvasWidth: number,
  canvasHeight: number
) {
  // Clear the canvas
  ctx.clearRect(0, 0, canvasWidth, canvasHeight);
  
  if (!detections || detections.length === 0) return;

  detections.forEach((detection, index) => {
    const color = colors[index % colors.length];
    
    // Convert normalized coordinates to pixel coordinates
    const x = detection.xmin * canvasWidth;
    const y = detection.ymin * canvasHeight;
    const width = (detection.xmax - detection.xmin) * canvasWidth;
    const height = (detection.ymax - detection.ymin) * canvasHeight;
    
    // Draw bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth = 3;
    ctx.strokeRect(x, y, width, height);
    
    // Draw filled background for label
    const label = `${detection.label} ${(detection.score * 100).toFixed(1)}%`;
    const labelWidth = ctx.measureText(label).width + 10;
    const labelHeight = 20;
    
    ctx.fillStyle = color;
    ctx.fillRect(x, y - labelHeight, labelWidth, labelHeight);
    
    // Draw label text
    ctx.fillStyle = '#FFFFFF';
    ctx.font = 'bold 12px Arial';
    ctx.textBaseline = 'top';
    ctx.fillText(label, x + 5, y - labelHeight + 4);
    
    // Draw confidence bar
    const barWidth = width;
    const barHeight = 4;
    const barY = y + height + 2;
    
    // Background bar
    ctx.fillStyle = 'rgba(0, 0, 0, 0.3)';
    ctx.fillRect(x, barY, barWidth, barHeight);
    
    // Confidence bar
    ctx.fillStyle = color;
    ctx.fillRect(x, barY, barWidth * detection.score, barHeight);
  });
}

export function drawDetectionHeatmap(
  ctx: CanvasRenderingContext2D,
  detections: Detection[],
  canvasWidth: number,
  canvasHeight: number
) {
  // Create a heatmap effect for detection density
  const heatmap = new Array(canvasHeight).fill(0).map(() => new Array(canvasWidth).fill(0));
  
  detections.forEach(detection => {
    const x1 = Math.floor(detection.xmin * canvasWidth);
    const y1 = Math.floor(detection.ymin * canvasHeight);
    const x2 = Math.floor(detection.xmax * canvasWidth);
    const y2 = Math.floor(detection.ymax * canvasHeight);
    
    for (let y = y1; y <= y2; y++) {
      for (let x = x1; x <= x2; x++) {
        if (x >= 0 && x < canvasWidth && y >= 0 && y < canvasHeight) {
          heatmap[y][x] += detection.score;
        }
      }
    }
  });
  
  // Draw heatmap
  const imageData = ctx.createImageData(canvasWidth, canvasHeight);
  for (let y = 0; y < canvasHeight; y++) {
    for (let x = 0; x < canvasWidth; x++) {
      const intensity = Math.min(heatmap[y][x] * 255, 255);
      const index = (y * canvasWidth + x) * 4;
      imageData.data[index] = 255; // Red
      imageData.data[index + 1] = 255 - intensity; // Green
      imageData.data[index + 2] = 0; // Blue
      imageData.data[index + 3] = Math.min(intensity * 0.3, 255); // Alpha
    }
  }
  ctx.putImageData(imageData, 0, 0);
}

export function createDetectionAnimation(
  ctx: CanvasRenderingContext2D,
  detection: Detection,
  canvasWidth: number,
  canvasHeight: number,
  duration: number = 1000
) {
  const startTime = Date.now();
  const color = colors[Math.floor(Math.random() * colors.length)];
  
  return function animate() {
    const elapsed = Date.now() - startTime;
    const progress = Math.min(elapsed / duration, 1);
    
    // Easing function for smooth animation
    const easeOut = 1 - Math.pow(1 - progress, 3);
    
    const x = detection.xmin * canvasWidth;
    const y = detection.ymin * canvasHeight;
    const width = (detection.xmax - detection.xmin) * canvasWidth;
    const height = (detection.ymax - detection.ymin) * canvasHeight;
    
    // Animated bounding box
    ctx.strokeStyle = color;
    ctx.lineWidth = 3 * easeOut;
    ctx.strokeRect(x, y, width * easeOut, height * easeOut);
    
    if (progress < 1) {
      requestAnimationFrame(animate);
    }
  };
}
