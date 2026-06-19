import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(url) {
  const [isConnected, setIsConnected] = useState(false);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const listenersRef = useRef(new Map());
  const urlRef = useRef(url);

  // Track latest url so reconnect uses it
  useEffect(() => {
    urlRef.current = url;
  }, [url]);

  const connect = useCallback(() => {
    const currentUrl = urlRef.current;
    if (!currentUrl) return;
    if (wsRef.current?.readyState === WebSocket.OPEN) return;

    // Close existing connection if switching URLs
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }

    try {
      const ws = new WebSocket(currentUrl);

      ws.onopen = () => {
        setIsConnected(true);
        // WebSocket connected
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          // Notify type-specific listeners
          const type = msg.type;
          if (type && listenersRef.current.has(type)) {
            listenersRef.current.get(type).forEach(cb => cb(msg.data || msg));
          }
        } catch (e) {
          console.error('Failed to parse WebSocket message:', e);
        }
      };

      ws.onclose = () => {
        setIsConnected(false);
        wsRef.current = null;
        // Auto-reconnect after 3 seconds (only if url hasn't changed)
        reconnectTimeoutRef.current = setTimeout(() => {
          if (urlRef.current === currentUrl) connect();
        }, 3000);
      };

      ws.onerror = (err) => {
        console.error('WebSocket error:', err);
        ws.close();
      };

      wsRef.current = ws;
    } catch (e) {
      console.error('WebSocket connection failed:', e);
      reconnectTimeoutRef.current = setTimeout(connect, 3000);
    }
  }, []);

  // Reconnect when url changes
  useEffect(() => {
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close();
      wsRef.current = null;
    }
    setIsConnected(false);
    connect();

    return () => {
      if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
      if (wsRef.current) {
        wsRef.current.onclose = null;
        wsRef.current.close();
      }
    };
  }, [url, connect]);

  const send = useCallback((data) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(data));
    }
  }, []);

  const subscribe = useCallback((type, callback) => {
    if (!listenersRef.current.has(type)) {
      listenersRef.current.set(type, new Set());
    }
    listenersRef.current.get(type).add(callback);

    return () => {
      listenersRef.current.get(type)?.delete(callback);
    };
  }, []);

  return { isConnected, send, subscribe };
}
