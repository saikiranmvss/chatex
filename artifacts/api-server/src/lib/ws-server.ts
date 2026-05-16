import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { verifyToken } from "./auth";

export interface NexusClient {
  ws: WebSocket;
  userId: number;
  role: string;
  rooms: Set<number>;
}

export type WsEvent =
  | { type: "message:new"; payload: Record<string, unknown> }
  | { type: "message:edit"; payload: Record<string, unknown> }
  | { type: "message:delete"; payload: { messageId: number; conversationId: number } }
  | { type: "typing:start"; payload: { conversationId: number; userId: number; displayName: string } }
  | { type: "typing:stop"; payload: { conversationId: number; userId: number } }
  | { type: "presence:update"; payload: { userId: number; presence: string } }
  | { type: "connected"; payload: { userId: number } };

const clients = new Map<WebSocket, NexusClient>();
const rooms = new Map<number, Set<WebSocket>>();

function getRoomId(conversationId: number): Set<WebSocket> {
  if (!rooms.has(conversationId)) {
    rooms.set(conversationId, new Set());
  }
  return rooms.get(conversationId)!;
}

export function broadcast(conversationId: number, event: WsEvent, excludeUserId?: number): void {
  const room = rooms.get(conversationId);
  if (!room) return;
  const payload = JSON.stringify(event);
  for (const ws of room) {
    const client = clients.get(ws);
    if (!client) continue;
    if (excludeUserId != null && client.userId === excludeUserId) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

export function broadcastAll(event: WsEvent, excludeUserId?: number): void {
  const payload = JSON.stringify(event);
  for (const [ws, client] of clients) {
    if (excludeUserId != null && client.userId === excludeUserId) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

export function createWsServer(httpServer: Server): WebSocketServer {
  const wss = new WebSocketServer({ server: httpServer, path: "/api/ws" });

  wss.on("connection", (ws: WebSocket, req: IncomingMessage) => {
    const url = new URL(req.url || "", "http://localhost");
    const token = url.searchParams.get("token");

    if (!token) {
      ws.close(1008, "Missing token");
      return;
    }

    let payload: { userId: number; role: string };
    try {
      payload = verifyToken(token) as { userId: number; role: string };
    } catch {
      ws.close(1008, "Invalid token");
      return;
    }

    const client: NexusClient = {
      ws,
      userId: payload.userId,
      role: payload.role,
      rooms: new Set(),
    };
    clients.set(ws, client);

    ws.send(JSON.stringify({ type: "connected", payload: { userId: payload.userId } }));

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as { type: string; conversationId?: number; displayName?: string };

        if (msg.type === "join" && msg.conversationId) {
          const room = getRoomId(msg.conversationId);
          room.add(ws);
          client.rooms.add(msg.conversationId);
        }

        if (msg.type === "leave" && msg.conversationId) {
          rooms.get(msg.conversationId)?.delete(ws);
          client.rooms.delete(msg.conversationId);
        }

        if (msg.type === "typing:start" && msg.conversationId) {
          broadcast(msg.conversationId, {
            type: "typing:start",
            payload: { conversationId: msg.conversationId, userId: client.userId, displayName: msg.displayName || "Someone" },
          }, client.userId);
        }

        if (msg.type === "typing:stop" && msg.conversationId) {
          broadcast(msg.conversationId, {
            type: "typing:stop",
            payload: { conversationId: msg.conversationId, userId: client.userId },
          }, client.userId);
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      for (const convId of client.rooms) {
        rooms.get(convId)?.delete(ws);
      }
      clients.delete(ws);
    });

    ws.on("error", () => {
      ws.terminate();
    });
  });

  return wss;
}
