import { useState, useEffect, useRef, useCallback } from 'react';

export function useWebSocket(url, { reconnectInterval = 3000, maxRetries = 10 } = {}) {
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState(null);
  const wsRef = useRef(null);
  const reconnectTimeoutRef = useRef(null);
  const listenersRef = useRef(new Map());
  const urlRef = useRef(url);
  const retriesRef = useRef(0);
  const reconnectIntervalRef = useRef(reconnectInterval);
  const maxRetriesRef = useRef(maxRetries);

  // Keep refs to latest options
  useEffect(() => { reconnectIntervalRef.current = reconnectInterval; }, [reconnectInterval]);
  useEffect(() => { maxRetriesRef.current = maxRetries; }, [maxRetries]);

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
        setError(null);
        retriesRef.current = 0;
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
          // Gracefully ignore parse errors
        }
      };

      ws.onclose = (e) => {
        setIsConnected(false);
        wsRef.current = null;
        // Auto-reconnect with exponential backoff (unless clean close)
        if (e.code !== 1000 && retriesRef.current < maxRetriesRef.current) {
          retriesRef.current++;
          const delay = reconnectIntervalRef.current * Math.min(retriesRef.current, 5);
          reconnectTimeoutRef.current = setTimeout(() => {
            if (urlRef.current === currentUrl) connect();
          }, delay);
        }
      };

      ws.onerror = (err) => {
        setError('Connection error');
        ws.close();
      };

      wsRef.current = ws;
    } catch (e) {
      setError(e.message);
      // Retry on connection failure
      if (retriesRef.current < maxRetriesRef.current) {
        retriesRef.current++;
        const delay = reconnectIntervalRef.current * Math.min(retriesRef.current, 5);
        reconnectTimeoutRef.current = setTimeout(connect, delay);
      }
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
    setError(null);
    retriesRef.current = 0;
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

  const reconnect = useCallback(() => {
    retriesRef.current = 0;
    if (reconnectTimeoutRef.current) clearTimeout(reconnectTimeoutRef.current);
    if (wsRef.current) {
      wsRef.current.onclose = null;
      wsRef.current.close(1000);
      wsRef.current = null;
    }
    setIsConnected(false);
    connect();
  }, [connect]);

  return { isConnected, error, send, subscribe, ws: wsRef, reconnect };
}
