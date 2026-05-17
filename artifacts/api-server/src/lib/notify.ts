import { eq } from "drizzle-orm";
import {
  db,
  insertOne,
  notificationsTable,
  conversationMembersTable,
  conversationsTable,
  usersTable,
} from "@workspace/db";
import { broadcastToUser } from "./ws-server";
import { sanitizeUser } from "../routes/auth";

function messagePreview(content: string, type: string, mediaName?: string | null): string {
  if (type === "image") return "📷 Photo";
  if (type === "video") return "🎬 Video";
  if (type === "audio") return "🎵 Audio";
  if (type === "file") return `📎 ${mediaName ?? "File"}`;
  const text = content.trim();
  return text.length > 80 ? `${text.slice(0, 80)}…` : text;
}

/** Create in-app (+ WS) notifications for new messages. Skips sender, muted members, and active viewers. */
export async function notifyNewMessage(
  conversationId: number,
  senderId: number,
  message: {
    id: number;
    content: string;
    type: string;
    mediaName?: string | null;
  },
  viewingUserIds: Set<number>,
): Promise<void> {
  const [conv] = await db
    .select()
    .from(conversationsTable)
    .where(eq(conversationsTable.id, conversationId))
    .limit(1);
  if (!conv) return;

  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, senderId)).limit(1);
  if (!sender) return;

  const senderName = sender.displayName || sender.username;
  const preview = messagePreview(message.content, message.type, message.mediaName);
  const title =
    conv.type === "group" && conv.name
      ? `${senderName} in ${conv.name}`
      : senderName;

  const members = await db
    .select()
    .from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, conversationId));

  for (const member of members) {
    if (member.userId === senderId) continue;
    if (member.isMuted) continue;
    if (viewingUserIds.has(member.userId)) continue;

    const notification = await insertOne(notificationsTable, {
      userId: member.userId,
      actorUserId: senderId,
      type: "message",
      title,
      body: preview,
      referenceId: conversationId,
      referenceType: "conversation",
    });

    const actorUser = sanitizeUser(sender);
    broadcastToUser(member.userId, {
      type: "notification:new",
      payload: {
        id: notification.id,
        type: notification.type,
        title: notification.title,
        body: notification.body,
        isRead: false,
        referenceId: conversationId,
        referenceType: "conversation",
        actorUser,
        createdAt: notification.createdAt.toISOString(),
      },
    });
  }
}
