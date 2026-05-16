import { Router, type IRouter } from "express";
import { eq, and, desc, lt } from "drizzle-orm";
import { db, usersTable, messagesTable, conversationMembersTable, starredMessagesTable } from "@workspace/db";
import { SendMessageBody, EditMessageBody, ReactToMessageBody } from "@workspace/api-zod";
import { requireAuth, getUser } from "../lib/auth";
import { sanitizeUser } from "./auth";

const router: IRouter = Router();

type Reaction = { emoji: string; count: number; userIds: number[] };

async function buildMessage(
  msg: typeof messagesTable.$inferSelect,
  currentUserId: number,
  starredSet: Set<number>
) {
  const [sender] = await db.select().from(usersTable).where(eq(usersTable.id, msg.senderId)).limit(1);

  let replyTo = null;
  if (msg.replyToId) {
    const [replyMsg] = await db.select().from(messagesTable).where(eq(messagesTable.id, msg.replyToId)).limit(1);
    if (replyMsg) {
      const [replySender] = await db.select().from(usersTable).where(eq(usersTable.id, replyMsg.senderId)).limit(1);
      replyTo = {
        id: replyMsg.id,
        content: replyMsg.isDeleted ? "This message was deleted" : replyMsg.content,
        type: replyMsg.type,
        senderId: replyMsg.senderId,
        senderName: replySender?.displayName ?? "Unknown",
      };
    }
  }

  return {
    id: msg.id,
    conversationId: msg.conversationId,
    senderId: msg.senderId,
    sender: sender ? sanitizeUser(sender) : null,
    content: msg.isDeleted ? "This message was deleted" : msg.content,
    type: msg.type,
    status: msg.status,
    replyToId: msg.replyToId ?? null,
    replyTo,
    mediaUrl: msg.mediaUrl ?? null,
    mediaType: msg.mediaType ?? null,
    mediaSize: msg.mediaSize ?? null,
    mediaName: msg.mediaName ?? null,
    isEdited: msg.isEdited,
    isPinned: msg.isPinned,
    isStarred: starredSet.has(msg.id),
    isDeleted: msg.isDeleted,
    reactions: (msg.reactions as Reaction[]) ?? [],
    createdAt: msg.createdAt.toISOString(),
    editedAt: msg.editedAt?.toISOString() ?? null,
  };
}

router.get("/conversations/:conversationId/messages", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const conversationId = parseInt(raw, 10);

  const [member] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, conversationId), eq(conversationMembersTable.userId, userId)))
    .limit(1);
  if (!member) {
    res.status(403).json({ error: "Not a member of this conversation" });
    return;
  }

  const messages = await db.select().from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
    .orderBy(desc(messagesTable.createdAt))
    .limit(50);

  const starred = await db.select().from(starredMessagesTable).where(eq(starredMessagesTable.userId, userId));
  const starredSet = new Set(starred.map(s => s.messageId));

  const result = await Promise.all(messages.reverse().map(m => buildMessage(m, userId, starredSet)));
  res.json(result);
});

router.post("/conversations/:conversationId/messages", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const conversationId = parseInt(raw, 10);

  const parsed = SendMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [member] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, conversationId), eq(conversationMembersTable.userId, userId)))
    .limit(1);
  if (!member) {
    res.status(403).json({ error: "Not a member of this conversation" });
    return;
  }

  const [msg] = await db.insert(messagesTable).values({
    conversationId,
    senderId: userId,
    content: parsed.data.content,
    type: parsed.data.type as "text" | "image" | "video" | "audio" | "file" | "sticker" | "gif",
    status: "sent",
    replyToId: parsed.data.replyToId ?? null,
    mediaUrl: parsed.data.mediaUrl ?? null,
    mediaType: parsed.data.mediaType ?? null,
    mediaSize: parsed.data.mediaSize ?? null,
    mediaName: parsed.data.mediaName ?? null,
    reactions: [],
  }).returning();

  await db.update(conversationMembersTable)
    .set({ unreadCount: 0 })
    .where(and(eq(conversationMembersTable.conversationId, conversationId), eq(conversationMembersTable.userId, userId)));

  const result = await buildMessage(msg, userId, new Set());
  res.status(201).json(result);
});

router.get("/messages/starred", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const starred = await db.select().from(starredMessagesTable)
    .where(eq(starredMessagesTable.userId, userId))
    .orderBy(desc(starredMessagesTable.createdAt))
    .limit(50);

  const starredSet = new Set(starred.map(s => s.messageId));
  const messages = await Promise.all(
    starred.map(async s => {
      const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, s.messageId)).limit(1);
      return msg ? buildMessage(msg, userId, starredSet) : null;
    })
  );

  res.json(messages.filter(Boolean));
});

router.get("/messages/:messageId", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId;
  const messageId = parseInt(raw, 10);

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId)).limit(1);
  if (!msg) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  const starred = await db.select().from(starredMessagesTable).where(eq(starredMessagesTable.userId, userId));
  const starredSet = new Set(starred.map(s => s.messageId));
  res.json(await buildMessage(msg, userId, starredSet));
});

router.patch("/messages/:messageId", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId;
  const messageId = parseInt(raw, 10);

  const parsed = EditMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId)).limit(1);
  if (!msg || msg.senderId !== userId) {
    res.status(403).json({ error: "Cannot edit this message" });
    return;
  }

  const [updated] = await db.update(messagesTable)
    .set({ content: parsed.data.content, isEdited: true, editedAt: new Date() })
    .where(eq(messagesTable.id, messageId)).returning();

  const starred = await db.select().from(starredMessagesTable).where(eq(starredMessagesTable.userId, userId));
  const starredSet = new Set(starred.map(s => s.messageId));
  res.json(await buildMessage(updated, userId, starredSet));
});

router.delete("/messages/:messageId", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId;
  const messageId = parseInt(raw, 10);

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId)).limit(1);
  if (!msg || msg.senderId !== userId) {
    res.status(403).json({ error: "Cannot delete this message" });
    return;
  }

  await db.update(messagesTable).set({ isDeleted: true, content: "This message was deleted" })
    .where(eq(messagesTable.id, messageId));
  res.sendStatus(204);
});

router.post("/messages/:messageId/react", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId;
  const messageId = parseInt(raw, 10);

  const parsed = ReactToMessageBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId)).limit(1);
  if (!msg) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  const reactions: Reaction[] = (msg.reactions as Reaction[]) ?? [];
  const existing = reactions.find(r => r.emoji === parsed.data.emoji);

  if (existing) {
    if (existing.userIds.includes(userId)) {
      existing.userIds = existing.userIds.filter(id => id !== userId);
      existing.count = existing.userIds.length;
    } else {
      existing.userIds.push(userId);
      existing.count = existing.userIds.length;
    }
    if (existing.count === 0) {
      const filtered = reactions.filter(r => r.emoji !== parsed.data.emoji);
      await db.update(messagesTable).set({ reactions: filtered }).where(eq(messagesTable.id, messageId));
    } else {
      await db.update(messagesTable).set({ reactions }).where(eq(messagesTable.id, messageId));
    }
  } else {
    reactions.push({ emoji: parsed.data.emoji, count: 1, userIds: [userId] });
    await db.update(messagesTable).set({ reactions }).where(eq(messagesTable.id, messageId));
  }

  const [updated] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId)).limit(1);
  const starred = await db.select().from(starredMessagesTable).where(eq(starredMessagesTable.userId, userId));
  const starredSet = new Set(starred.map(s => s.messageId));
  res.json(await buildMessage(updated, userId, starredSet));
});

router.post("/messages/:messageId/pin", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId;
  const messageId = parseInt(raw, 10);

  const [msg] = await db.select().from(messagesTable).where(eq(messagesTable.id, messageId)).limit(1);
  if (!msg) {
    res.status(404).json({ error: "Message not found" });
    return;
  }

  await db.update(messagesTable).set({ isPinned: !msg.isPinned }).where(eq(messagesTable.id, messageId));
  res.sendStatus(204);
});

router.post("/messages/:messageId/star", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.messageId) ? req.params.messageId[0] : req.params.messageId;
  const messageId = parseInt(raw, 10);

  const existing = await db.select().from(starredMessagesTable)
    .where(and(eq(starredMessagesTable.userId, userId), eq(starredMessagesTable.messageId, messageId)))
    .limit(1);

  if (existing.length > 0) {
    await db.delete(starredMessagesTable)
      .where(and(eq(starredMessagesTable.userId, userId), eq(starredMessagesTable.messageId, messageId)));
  } else {
    await db.insert(starredMessagesTable).values({ userId, messageId });
  }
  res.sendStatus(204);
});

export default router;
