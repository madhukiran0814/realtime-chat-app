import { useRef, useEffect, useCallback, useState } from 'react';

const WS_URL = import.meta.env.VITE_WS_URL || 'ws://localhost:3000/ws';

export function useWebSocket(token, onMessage) {
  const wsRef = useRef(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef(null);
  const lastDisconnect = useRef(null);
  const tokenRef = useRef(token);
  tokenRef.current = token;

  const connect = useCallback(() => {
    if (wsRef.current?.readyState === WebSocket.OPEN) return;
    const ws = new WebSocket(`${WS_URL}?token=${encodeURIComponent(tokenRef.current)}`);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      if (lastDisconnect.current) {
        ws.send(JSON.stringify({ type: 'sync:request', payload: { since: lastDisconnect.current } }));
        lastDisconnect.current = null;
      }
    };

    ws.onmessage = (e) => {
      try {
        const msg = JSON.parse(e.data);
        onMessage(msg);
      } catch {}
    };

    ws.onclose = (e) => {
      setConnected(false);
      lastDisconnect.current = new Date().toISOString();
      if (e.code !== 4001) {
        reconnectTimer.current = setTimeout(() => connect(), 3000);
      }
    };

    ws.onerror = () => {};
  }, [onMessage]);

  useEffect(() => {
    if (token) connect();
    return () => {
      clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [token, connect]);

  const send = useCallback((type, payload) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type, payload }));
    }
  }, []);

  return { connected, send, ws: wsRef };
}
