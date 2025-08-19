import React, { useEffect, useRef } from 'react';

interface StatsChartProps {
  data: number[];
  label: string;
  color: string;
  maxValue?: number;
  height?: number;
}

export const StatsChart: React.FC<StatsChartProps> = ({ 
  data, 
  label, 
  color, 
  maxValue = 100, 
  height = 60 
}) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const width = canvas.width;
    const height = canvas.height;

    // Clear canvas
    ctx.clearRect(0, 0, width, height);

    if (data.length === 0) return;

    // Draw grid
    ctx.strokeStyle = '#e5e7eb';
    ctx.lineWidth = 1;
    for (let i = 0; i <= 4; i++) {
      const y = (height / 4) * i;
      ctx.beginPath();
      ctx.moveTo(0, y);
      ctx.lineTo(width, y);
      ctx.stroke();
    }

    // Draw chart line
    ctx.strokeStyle = color;
    ctx.lineWidth = 2;
    ctx.beginPath();

    const stepX = width / (data.length - 1);
    data.forEach((value, index) => {
      const x = index * stepX;
      const y = height - (value / maxValue) * height;
      
      if (index === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    });

    ctx.stroke();

    // Draw area fill
    ctx.fillStyle = color + '20';
    ctx.beginPath();
    ctx.moveTo(0, height);
    
    data.forEach((value, index) => {
      const x = index * stepX;
      const y = height - (value / maxValue) * height;
      ctx.lineTo(x, y);
    });
    
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();

  }, [data, color, maxValue, height]);

  return (
    <div className="bg-white rounded-lg p-4">
      <div className="flex justify-between items-center mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <span className="text-sm font-bold" style={{ color }}>
          {data.length > 0 ? data[data.length - 1].toFixed(1) : '0'}
        </span>
      </div>
      <canvas
        ref={canvasRef}
        width={200}
        height={height}
        className="w-full h-full"
      />
    </div>
  );
};

interface RealTimeStatsProps {
  fpsHistory: number[];
  latencyHistory: number[];
  detectionHistory: number[];
}

export const RealTimeStats: React.FC<RealTimeStatsProps> = ({
  fpsHistory,
  latencyHistory,
  detectionHistory
}) => {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      <StatsChart
        data={fpsHistory}
        label="FPS"
        color="#3B82F6"
        maxValue={30}
      />
      <StatsChart
        data={latencyHistory}
        label="Latency (ms)"
        color="#10B981"
        maxValue={1000}
      />
      <StatsChart
        data={detectionHistory}
        label="Detections"
        color="#8B5CF6"
        maxValue={10}
      />
    </div>
  );
};
