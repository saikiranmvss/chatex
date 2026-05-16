import { useEffect, useRef, useCallback, useState } from "react";

export type WsEvent =
  | { type: "connected"; payload: { userId: number } }
  | { type: "message:new"; payload: Record<string, unknown> }
  | { type: "message:edit"; payload: Record<string, unknown> }
  | { type: "message:delete"; payload: { messageId: number; conversationId: number } }
  | { type: "typing:start"; payload: { conversationId: number; userId: number; displayName: string } }
  | { type: "typing:stop"; payload: { conversationId: number; userId: number } }
  | { type: "presence:update"; payload: { userId: number; presence: string } };

type EventHandler = (event: WsEvent) => void;

interface UseWebSocketOptions {
  onEvent?: EventHandler;
}

export function useWebSocket({ onEvent }: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const onEventRef = useRef(onEvent);
  const joinedRooms = useRef<Set<number>>(new Set());

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const connect = useCallback(() => {
    const token = localStorage.getItem("nexus_token");
    if (!token) return;

    const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
    const host = window.location.host;
    const url = `${proto}//${host}/api/ws?token=${encodeURIComponent(token)}`;

    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => {
      setConnected(true);
      // Rejoin all rooms after reconnect
      for (const id of joinedRooms.current) {
        ws.send(JSON.stringify({ type: "join", conversationId: id }));
      }
    };

    ws.onmessage = (e) => {
      try {
        const event = JSON.parse(e.data) as WsEvent;
        onEventRef.current?.(event);
      } catch {
        // ignore
      }
    };

    ws.onclose = () => {
      setConnected(false);
      wsRef.current = null;
      // Reconnect with backoff
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(connect, 2500);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, []);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  const joinRoom = useCallback((conversationId: number) => {
    joinedRooms.current.add(conversationId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "join", conversationId }));
    }
  }, []);

  const leaveRoom = useCallback((conversationId: number) => {
    joinedRooms.current.delete(conversationId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "leave", conversationId }));
    }
  }, []);

  const sendTypingStart = useCallback((conversationId: number, displayName: string) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "typing:start", conversationId, displayName }));
    }
  }, []);

  const sendTypingStop = useCallback((conversationId: number) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "typing:stop", conversationId }));
    }
  }, []);

  return { connected, joinRoom, leaveRoom, sendTypingStart, sendTypingStop };
}
