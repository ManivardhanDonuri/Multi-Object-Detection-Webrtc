export type Signal = { type: string; sdp?: string; candidate?: any };

export function connectSignaling(room: string): WebSocket {
  // Use the same host as the frontend but connect to backend port for WebSocket
  const backendUrl = (import.meta as any).env?.VITE_BACKEND_URL || 'http://localhost:8000';
  const url = new URL(backendUrl);
  url.protocol = url.protocol.replace('http', 'ws');
  url.pathname = '/ws';
  url.searchParams.set('room', room);
  console.log('Connecting to WebSocket:', url.toString());
  const ws = new WebSocket(url.toString());
  
  ws.onerror = (error) => {
    console.error('WebSocket connection error:', error);
  };
  
  ws.onopen = () => {
    console.log('WebSocket connected successfully');
  };
  
  return ws;
}
