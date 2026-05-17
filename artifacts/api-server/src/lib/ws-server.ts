import { WebSocketServer, WebSocket } from "ws";
import type { IncomingMessage } from "http";
import type { Server } from "http";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { verifyToken } from "./auth";

export interface NexusClient {
  ws: WebSocket;
  userId: number;
  role: string;
  rooms: Set<number>;
}

export type PresenceStatus = "online" | "away" | "offline";

export interface PresencePayload {
  userId: number;
  presence: PresenceStatus;
  lastSeenAt: string | null;
}

export type WsEvent =
  | { type: "message:new"; payload: Record<string, unknown> }
  | { type: "message:edit"; payload: Record<string, unknown> }
  | { type: "message:delete"; payload: { messageId: number; conversationId: number } }
  | { type: "typing:start"; payload: { conversationId: number; userId: number; displayName: string } }
  | { type: "typing:stop"; payload: { conversationId: number; userId: number } }
  | { type: "presence:update"; payload: PresencePayload }
  | { type: "notification:new"; payload: Record<string, unknown> }
  | { type: "connected"; payload: { userId: number } };

const clients = new Map<WebSocket, NexusClient>();
const rooms = new Map<number, Set<WebSocket>>();
/** Users actively viewing a conversation (chat pane open) — not background WS listeners. */
const activeViewers = new Map<number, Set<number>>();
const connectionCountByUser = new Map<number, number>();
/** Last client activity timestamp (heartbeat / typing / join). */
const lastActivityByUser = new Map<number, number>();

const AWAY_AFTER_MS = 2 * 60 * 1000;
const IDLE_CHECK_MS = 30 * 1000;

/** In-memory presence cache to avoid redundant DB writes. */
const presenceByUser = new Map<number, PresenceStatus>();

export async function updateUserPresence(
  userId: number,
  presence: PresenceStatus,
): Promise<PresencePayload> {
  const now = new Date();
  const updates: { presence: PresenceStatus; lastSeenAt?: Date } = { presence };

  if (presence === "offline") {
    updates.lastSeenAt = now;
  }

  await db.update(usersTable).set(updates).where(eq(usersTable.id, userId));

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  const payload: PresencePayload = {
    userId,
    presence: (user?.presence ?? presence) as PresenceStatus,
    lastSeenAt: user?.lastSeenAt?.toISOString() ?? null,
  };

  presenceByUser.set(userId, payload.presence);
  broadcastAll({ type: "presence:update", payload });
  return payload;
}

function touchActivity(userId: number): void {
  lastActivityByUser.set(userId, Date.now());
}

function trackConnection(userId: number): boolean {
  const next = (connectionCountByUser.get(userId) ?? 0) + 1;
  connectionCountByUser.set(userId, next);
  touchActivity(userId);
  return next === 1;
}

function untrackConnection(userId: number): boolean {
  const current = connectionCountByUser.get(userId) ?? 0;
  if (current <= 1) {
    connectionCountByUser.delete(userId);
    lastActivityByUser.delete(userId);
    presenceByUser.delete(userId);
    return true;
  }
  connectionCountByUser.set(userId, current - 1);
  return false;
}

function getRoomId(conversationId: number): Set<WebSocket> {
  if (!rooms.has(conversationId)) {
    rooms.set(conversationId, new Set());
  }
  return rooms.get(conversationId)!;
}

/** User IDs with the chat pane open for this conversation (excludes background listeners). */
export function getActiveViewerIds(conversationId: number): number[] {
  const viewers = activeViewers.get(conversationId);
  return viewers ? [...viewers] : [];
}

function addActiveViewer(conversationId: number, userId: number): void {
  if (!activeViewers.has(conversationId)) {
    activeViewers.set(conversationId, new Set());
  }
  activeViewers.get(conversationId)!.add(userId);
}

function removeActiveViewer(conversationId: number, userId: number): void {
  activeViewers.get(conversationId)?.delete(userId);
  if (activeViewers.get(conversationId)?.size === 0) {
    activeViewers.delete(conversationId);
  }
}

function removeUserFromAllActiveViews(userId: number): void {
  for (const [conversationId, viewers] of activeViewers) {
    viewers.delete(userId);
    if (viewers.size === 0) activeViewers.delete(conversationId);
  }
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

/** Send an event to every connection owned by a specific user (all tabs). */
export function broadcastToUser(userId: number, event: WsEvent): void {
  const payload = JSON.stringify(event);
  for (const [ws, client] of clients) {
    if (client.userId !== userId) continue;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(payload);
    }
  }
}

function startIdleWatcher(): void {
  setInterval(() => {
    const now = Date.now();
    for (const userId of connectionCountByUser.keys()) {
      const last = lastActivityByUser.get(userId) ?? 0;
      const current = presenceByUser.get(userId) ?? "offline";

      if (now - last > AWAY_AFTER_MS && current === "online") {
        void updateUserPresence(userId, "away");
      }
    }
  }, IDLE_CHECK_MS);
}

export function createWsServer(httpServer: Server): WebSocketServer {
  startIdleWatcher();

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

    if (trackConnection(payload.userId)) {
      void updateUserPresence(payload.userId, "online");
    } else {
      touchActivity(payload.userId);
      const current = presenceByUser.get(payload.userId);
      if (current === "away" || current === "offline") {
        void updateUserPresence(payload.userId, "online");
      }
    }

    ws.send(JSON.stringify({ type: "connected", payload: { userId: payload.userId } }));

    ws.on("message", (raw) => {
      try {
        const msg = JSON.parse(raw.toString()) as {
          type: string;
          conversationId?: number;
          displayName?: string;
        };

        touchActivity(client.userId);

        if (msg.type === "presence:heartbeat" || msg.type === "presence:active") {
          const current = presenceByUser.get(client.userId);
          if (current === "away") {
            void updateUserPresence(client.userId, "online");
          }
          return;
        }

        if (msg.type === "presence:idle") {
          const current = presenceByUser.get(client.userId);
          if (current === "online") {
            void updateUserPresence(client.userId, "away");
          }
          return;
        }

        if (msg.type === "join" && msg.conversationId) {
          const room = getRoomId(msg.conversationId);
          room.add(ws);
          client.rooms.add(msg.conversationId);
        }

        if (msg.type === "leave" && msg.conversationId) {
          rooms.get(msg.conversationId)?.delete(ws);
          client.rooms.delete(msg.conversationId);
        }

        if (msg.type === "view" && msg.conversationId) {
          addActiveViewer(msg.conversationId, client.userId);
        }

        if (msg.type === "unview" && msg.conversationId) {
          removeActiveViewer(msg.conversationId, client.userId);
        }

        if (msg.type === "typing:start" && msg.conversationId) {
          broadcast(
            msg.conversationId,
            {
              type: "typing:start",
              payload: {
                conversationId: msg.conversationId,
                userId: client.userId,
                displayName: msg.displayName || "Someone",
              },
            },
            client.userId,
          );
        }

        if (msg.type === "typing:stop" && msg.conversationId) {
          broadcast(
            msg.conversationId,
            {
              type: "typing:stop",
              payload: { conversationId: msg.conversationId, userId: client.userId },
            },
            client.userId,
          );
        }
      } catch {
        // ignore malformed messages
      }
    });

    ws.on("close", () => {
      for (const convId of client.rooms) {
        rooms.get(convId)?.delete(ws);
      }
      removeUserFromAllActiveViews(client.userId);
      clients.delete(ws);

      if (untrackConnection(client.userId)) {
        void updateUserPresence(client.userId, "offline");
      }
    });

    ws.on("error", () => {
      ws.terminate();
    });
  });

  return wss;
}
