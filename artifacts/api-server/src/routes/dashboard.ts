import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, usersTable, conversationsTable, conversationMembersTable, messagesTable } from "@workspace/db";
import { requireAuth, getUser } from "../lib/auth";
import { sanitizeUser } from "./auth";

const router: IRouter = Router();

router.get("/dashboard/summary", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);

  const memberships = await db.select().from(conversationMembersTable)
    .where(eq(conversationMembersTable.userId, userId));

  let totalUnread = 0;
  let pinnedConversations = 0;
  const recentConversations = [];

  for (const member of memberships) {
    if (member.isArchived) continue;
    totalUnread += member.unreadCount;
    if (member.isPinned) pinnedConversations++;

    const [conv] = await db.select().from(conversationsTable)
      .where(eq(conversationsTable.id, member.conversationId)).limit(1);
    if (!conv) continue;

    const allMembers = await db.select().from(conversationMembersTable)
      .where(eq(conversationMembersTable.conversationId, conv.id));

    const [lastMsg] = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, conv.id))
      .orderBy(desc(messagesTable.createdAt)).limit(1);

    let lastMsgSender = null;
    if (lastMsg) {
      const [s] = await db.select().from(usersTable).where(eq(usersTable.id, lastMsg.senderId)).limit(1);
      lastMsgSender = s ?? null;
    }

    let otherUser = null;
    if (conv.type === "direct") {
      const otherMem = allMembers.find(m => m.userId !== userId);
      if (otherMem) {
        const [u] = await db.select().from(usersTable).where(eq(usersTable.id, otherMem.userId)).limit(1);
        otherUser = u ?? null;
      }
    }

    recentConversations.push({
      id: conv.id,
      type: conv.type,
      name: conv.name ?? null,
      description: conv.description ?? null,
      avatarUrl: conv.avatarUrl ?? null,
      isArchived: member.isArchived,
      isMuted: member.isMuted,
      isPinned: member.isPinned,
      unreadCount: member.unreadCount,
      memberCount: allMembers.length,
      lastMessage: lastMsg ? {
        id: lastMsg.id,
        content: lastMsg.isDeleted ? "This message was deleted" : lastMsg.content,
        type: lastMsg.type,
        senderId: lastMsg.senderId,
        senderName: lastMsgSender?.displayName ?? "Unknown",
      } : null,
      otherUser: otherUser ? sanitizeUser(otherUser) : null,
      createdAt: conv.createdAt.toISOString(),
      updatedAt: conv.updatedAt.toISOString(),
    });
  }

  recentConversations.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  const onlineContacts = await db.select().from(usersTable)
    .where(eq(usersTable.presence, "online"))
    .limit(20);

  res.json({
    totalUnread,
    pinnedConversations,
    recentConversations: recentConversations.slice(0, 10),
    onlineContacts: onlineContacts.filter(u => u.id !== userId).map(sanitizeUser),
  });
});

export default router;
