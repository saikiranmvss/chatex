import { useEffect, useRef, useCallback, useState } from "react";

export type PresenceUpdatePayload = {
  userId: number;
  presence: string;
  lastSeenAt: string | null;
};

export type WsEvent =
  | { type: "connected"; payload: { userId: number } }
  | { type: "message:new"; payload: Record<string, unknown> }
  | { type: "message:edit"; payload: Record<string, unknown> }
  | { type: "message:delete"; payload: { messageId: number; conversationId: number } }
  | { type: "typing:start"; payload: { conversationId: number; userId: number; displayName: string } }
  | { type: "typing:stop"; payload: { conversationId: number; userId: number } }
  | { type: "presence:update"; payload: PresenceUpdatePayload }
  | { type: "notification:new"; payload: Record<string, unknown> };

type EventHandler = (event: WsEvent) => void;

interface UseWebSocketOptions {
  onEvent?: EventHandler;
}

const HEARTBEAT_MS = 25_000;

export function useWebSocket({ onEvent }: UseWebSocketOptions = {}) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const reconnectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const heartbeatTimer = useRef<ReturnType<typeof setInterval> | null>(null);
  const onEventRef = useRef(onEvent);
  const joinedRooms = useRef<Set<number>>(new Set());
  const viewingRooms = useRef<Set<number>>(new Set());

  useEffect(() => {
    onEventRef.current = onEvent;
  }, [onEvent]);

  const sendPresenceState = useCallback((state: "active" | "idle") => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    wsRef.current.send(
      JSON.stringify({ type: state === "active" ? "presence:active" : "presence:idle" }),
    );
  }, []);

  const sendHeartbeat = useCallback(() => {
    if (wsRef.current?.readyState !== WebSocket.OPEN) return;
    if (document.visibilityState !== "visible") return;
    wsRef.current.send(JSON.stringify({ type: "presence:heartbeat" }));
  }, []);

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
      sendPresenceState("active");
      sendHeartbeat();

      for (const id of joinedRooms.current) {
        ws.send(JSON.stringify({ type: "join", conversationId: id }));
      }
      for (const id of viewingRooms.current) {
        ws.send(JSON.stringify({ type: "view", conversationId: id }));
      }

      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      heartbeatTimer.current = setInterval(sendHeartbeat, HEARTBEAT_MS);
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
      if (heartbeatTimer.current) {
        clearInterval(heartbeatTimer.current);
        heartbeatTimer.current = null;
      }
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      reconnectTimer.current = setTimeout(connect, 2500);
    };

    ws.onerror = () => {
      ws.close();
    };
  }, [sendHeartbeat, sendPresenceState]);

  useEffect(() => {
    connect();
    return () => {
      if (reconnectTimer.current) clearTimeout(reconnectTimer.current);
      if (heartbeatTimer.current) clearInterval(heartbeatTimer.current);
      wsRef.current?.close();
    };
  }, [connect]);

  useEffect(() => {
    const onVisibility = () => {
      sendPresenceState(document.visibilityState === "visible" ? "active" : "idle");
      if (document.visibilityState === "visible") sendHeartbeat();
    };
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
  }, [sendPresenceState, sendHeartbeat]);

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

  const viewConversation = useCallback((conversationId: number) => {
    viewingRooms.current.add(conversationId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "view", conversationId }));
    }
  }, []);

  const unviewConversation = useCallback((conversationId: number) => {
    viewingRooms.current.delete(conversationId);
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify({ type: "unview", conversationId }));
    }
  }, []);

  return {
    connected,
    joinRoom,
    leaveRoom,
    viewConversation,
    unviewConversation,
    sendTypingStart,
    sendTypingStop,
  };
}
