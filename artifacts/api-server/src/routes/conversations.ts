import { Router, type IRouter } from "express";
import { eq, and, or, desc } from "drizzle-orm";
import { db, conversationsTable, conversationMembersTable, insertOne, messagesTable, updateOneById, usersTable } from "@workspace/db";
import { CreateConversationBody, UpdateConversationBody } from "@workspace/api-zod";
import { requireAuth, getUser } from "../lib/auth";
import { sanitizeUser } from "./auth";

const router: IRouter = Router();

function buildConversationResponse(
  conv: typeof conversationsTable.$inferSelect,
  member: typeof conversationMembersTable.$inferSelect,
  lastMsg: typeof messagesTable.$inferSelect | null,
  lastMsgSender: typeof usersTable.$inferSelect | null,
  otherUser: typeof usersTable.$inferSelect | null,
  memberCount: number
) {
  return {
    id: conv.id,
    type: conv.type,
    name: conv.name ?? null,
    description: conv.description ?? null,
    avatarUrl: conv.avatarUrl ?? null,
    isArchived: member.isArchived,
    isMuted: member.isMuted,
    isPinned: member.isPinned,
    unreadCount: member.unreadCount,
    memberCount,
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
  };
}

router.get("/conversations", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const typeFilter = typeof req.query.type === "string" ? req.query.type : null;

  const memberships = await db.select().from(conversationMembersTable)
    .where(eq(conversationMembersTable.userId, userId));

  const results = [];
  for (const member of memberships) {
    const [conv] = await db.select().from(conversationsTable)
      .where(eq(conversationsTable.id, member.conversationId)).limit(1);
    if (!conv) continue;

    if (typeFilter === "archived" && !member.isArchived) continue;
    if (typeFilter && typeFilter !== "archived" && conv.type !== typeFilter) continue;
    if (!typeFilter && member.isArchived) continue;

    const allMembers = await db.select().from(conversationMembersTable)
      .where(eq(conversationMembersTable.conversationId, conv.id));

    const [lastMsg] = await db.select().from(messagesTable)
      .where(eq(messagesTable.conversationId, conv.id))
      .orderBy(desc(messagesTable.createdAt))
      .limit(1);

    let lastMsgSender = null;
    if (lastMsg) {
      const [s] = await db.select().from(usersTable).where(eq(usersTable.id, lastMsg.senderId)).limit(1);
      lastMsgSender = s ?? null;
    }

    let otherUser = null;
    if (conv.type === "direct") {
      const otherMember = allMembers.find(m => m.userId !== userId);
      if (otherMember) {
        const [u] = await db.select().from(usersTable).where(eq(usersTable.id, otherMember.userId)).limit(1);
        otherUser = u ?? null;
      }
    }

    results.push(buildConversationResponse(conv, member, lastMsg ?? null, lastMsgSender, otherUser, allMembers.length));
  }

  results.sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.updatedAt).getTime() - new Date(a.updatedAt).getTime();
  });

  res.json(results);
});

router.post("/conversations", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const parsed = CreateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { type, targetUserId, name, description, avatarUrl, memberIds } = parsed.data;

  if (type === "direct") {
    if (!targetUserId) {
      res.status(400).json({ error: "targetUserId required for direct conversations" });
      return;
    }
    const existing = await db.select({ cm1: conversationMembersTable })
      .from(conversationMembersTable)
      .where(eq(conversationMembersTable.userId, userId));

    for (const { cm1 } of existing) {
      const [conv] = await db.select().from(conversationsTable)
        .where(and(eq(conversationsTable.id, cm1.conversationId), eq(conversationsTable.type, "direct"))).limit(1);
      if (!conv) continue;
      const members = await db.select().from(conversationMembersTable)
        .where(eq(conversationMembersTable.conversationId, conv.id));
      if (members.length === 2 && members.some(m => m.userId === targetUserId)) {
        const member = members.find(m => m.userId === userId)!;
        const otherMem = members.find(m => m.userId === targetUserId)!;
        const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.id, otherMem.userId)).limit(1);
        res.json(buildConversationResponse(conv, member, null, null, otherUser ?? null, 2));
        return;
      }
    }

    const conv = await insertOne(conversationsTable, { type: "direct" });
    await db.insert(conversationMembersTable).values([
      { conversationId: conv.id, userId, role: "member" },
      { conversationId: conv.id, userId: targetUserId, role: "member" },
    ]);
    const [otherUser] = await db.select().from(usersTable).where(eq(usersTable.id, targetUserId)).limit(1);
    const member = { conversationId: conv.id, userId, role: "member", isArchived: false, isMuted: false, isPinned: false, unreadCount: 0, joinedAt: new Date(), id: 0 };
    res.status(201).json(buildConversationResponse(conv, member, null, null, otherUser ?? null, 2));
    return;
  }

  const conv = await insertOne(conversationsTable, {
    type: type as "group" | "channel",
    name: name ?? null,
    description: description ?? null,
    avatarUrl: avatarUrl ?? null,
    ownerId: userId,
  });

  const allMemberIds = Array.from(new Set([userId, ...(memberIds ?? [])]));
  await db.insert(conversationMembersTable).values(
    allMemberIds.map((uid, i) => ({
      conversationId: conv.id,
      userId: uid,
      role: i === 0 ? "owner" : "member",
    }))
  );

  const member = { conversationId: conv.id, userId, role: "owner", isArchived: false, isMuted: false, isPinned: false, unreadCount: 0, joinedAt: new Date(), id: 0 };
  res.status(201).json(buildConversationResponse(conv, member, null, null, null, allMemberIds.length));
});

router.get("/conversations/:conversationId", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const conversationId = parseInt(raw, 10);

  const [member] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, conversationId), eq(conversationMembersTable.userId, userId)))
    .limit(1);
  if (!member) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const [conv] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId)).limit(1);
  if (!conv) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const allMembers = await db.select().from(conversationMembersTable).where(eq(conversationMembersTable.conversationId, conversationId));

  const [lastMsg] = await db.select().from(messagesTable)
    .where(eq(messagesTable.conversationId, conversationId))
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

  res.json(buildConversationResponse(conv, member, lastMsg ?? null, lastMsgSender, otherUser, allMembers.length));
});

router.patch("/conversations/:conversationId", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const conversationId = parseInt(raw, 10);

  const parsed = UpdateConversationBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [member] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, conversationId), eq(conversationMembersTable.userId, userId)))
    .limit(1);
  if (!member) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  const memberUpdates: Partial<typeof conversationMembersTable.$inferInsert> = {};
  if (parsed.data.isMuted != null) memberUpdates.isMuted = parsed.data.isMuted;
  if (parsed.data.isPinned != null) memberUpdates.isPinned = parsed.data.isPinned;
  if (parsed.data.isArchived != null) memberUpdates.isArchived = parsed.data.isArchived;

  if (Object.keys(memberUpdates).length > 0) {
    await db.update(conversationMembersTable).set(memberUpdates)
      .where(and(eq(conversationMembersTable.conversationId, conversationId), eq(conversationMembersTable.userId, userId)));
  }

  const convUpdates: Partial<typeof conversationsTable.$inferInsert> = {};
  if (parsed.data.name != null) convUpdates.name = parsed.data.name;
  if (parsed.data.description != null) convUpdates.description = parsed.data.description;
  if (parsed.data.avatarUrl != null) convUpdates.avatarUrl = parsed.data.avatarUrl;

  let conv;
  if (Object.keys(convUpdates).length > 0) {
    conv = await updateOneById(conversationsTable, conversationId, convUpdates);
  } else {
    const [existing] = await db.select().from(conversationsTable).where(eq(conversationsTable.id, conversationId)).limit(1);
    conv = existing;
  }

  const updatedMember = { ...member, ...memberUpdates };
  const allMembers = await db.select().from(conversationMembersTable).where(eq(conversationMembersTable.conversationId, conversationId));
  res.json(buildConversationResponse(conv, updatedMember, null, null, null, allMembers.length));
});

router.post("/conversations/:conversationId/archive", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const conversationId = parseInt(raw, 10);

  await db.update(conversationMembersTable).set({ isArchived: true })
    .where(and(eq(conversationMembersTable.conversationId, conversationId), eq(conversationMembersTable.userId, userId)));
  res.sendStatus(204);
});

router.post("/conversations/:conversationId/read", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.conversationId) ? req.params.conversationId[0] : req.params.conversationId;
  const conversationId = parseInt(raw, 10);

  await db.update(conversationMembersTable).set({ unreadCount: 0 })
    .where(and(eq(conversationMembersTable.conversationId, conversationId), eq(conversationMembersTable.userId, userId)));
  res.sendStatus(204);
});

export default router;
