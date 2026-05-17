import type { Message, Notification } from "@workspace/api-client-react";

export function parseWsMessage(payload: Record<string, unknown>): Message | null {
  if (typeof payload.id !== "number" || typeof payload.conversationId !== "number") {
    return null;
  }
  return payload as unknown as Message;
}

export function parseWsNotification(payload: Record<string, unknown>): Notification | null {
  if (typeof payload.id !== "number" || typeof payload.type !== "string") {
    return null;
  }
  return payload as unknown as Notification;
}
