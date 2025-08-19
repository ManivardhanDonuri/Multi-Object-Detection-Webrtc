export type Signal = { type: string; sdp?: string; candidate?: any };

import { getBackendOrigin } from './utils';

export function connectSignaling(room: string): WebSocket {
  const backendUrl = getBackendOrigin();
  const url = new URL(backendUrl);
  // Honor HTTPS → WSS
  url.protocol = (url.protocol === 'https:') ? 'wss:' : 'ws:';
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
