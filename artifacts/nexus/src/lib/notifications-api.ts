import { customFetch } from "@workspace/api-client-react";
import type { Notification } from "@workspace/api-client-react";

export async function fetchUnreadNotificationCount(): Promise<number> {
  const data = await customFetch<{ count: number }>("/api/notifications/unread-count");
  return data.count;
}

export async function markNotificationRead(notificationId: number): Promise<void> {
  await customFetch<void>(`/api/notifications/${notificationId}/read`, { method: "PATCH" });
}

export type { Notification };
