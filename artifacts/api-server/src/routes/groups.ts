import { Router, type IRouter } from "express";
import { eq, and } from "drizzle-orm";
import { db, conversationMembersTable, insertOne, updateWhere, usersTable } from "@workspace/db";
import { AddGroupMemberBody, UpdateGroupMemberRoleBody } from "@workspace/api-zod";
import { requireAuth, getUser } from "../lib/auth";
import { sanitizeUser } from "./auth";

const router: IRouter = Router();

router.get("/groups/:groupId/members", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(raw, 10);

  const [myMembership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, groupId), eq(conversationMembersTable.userId, userId)))
    .limit(1);
  if (!myMembership) {
    res.status(403).json({ error: "Not a member of this group" });
    return;
  }

  const members = await db.select().from(conversationMembersTable)
    .where(eq(conversationMembersTable.conversationId, groupId));

  const result = await Promise.all(
    members.map(async m => {
      const [user] = await db.select().from(usersTable).where(eq(usersTable.id, m.userId)).limit(1);
      return {
        userId: m.userId,
        user: user ? sanitizeUser(user) : null,
        role: m.role,
        joinedAt: m.joinedAt.toISOString(),
      };
    })
  );

  res.json(result);
});

router.post("/groups/:groupId/members", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const groupId = parseInt(raw, 10);

  const parsed = AddGroupMemberBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [myMembership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, groupId), eq(conversationMembersTable.userId, userId)))
    .limit(1);
  if (!myMembership || !["owner", "admin"].includes(myMembership.role)) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  const existing = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, groupId), eq(conversationMembersTable.userId, parsed.data.userId)))
    .limit(1);
  if (existing.length > 0) {
    res.status(400).json({ error: "User is already a member" });
    return;
  }

  const newMember = await insertOne(conversationMembersTable, {
    conversationId: groupId,
    userId: parsed.data.userId,
    role: parsed.data.role ?? "member",
  });

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, newMember.userId)).limit(1);
  res.status(201).json({
    userId: newMember.userId,
    user: user ? sanitizeUser(user) : null,
    role: newMember.role,
    joinedAt: newMember.joinedAt.toISOString(),
  });
});

router.delete("/groups/:groupId/members/:userId", requireAuth, async (req, res): Promise<void> => {
  const { userId: requesterId } = getUser(req);
  const rawGroupId = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const rawUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const groupId = parseInt(rawGroupId, 10);
  const targetUserId = parseInt(rawUserId, 10);

  const [myMembership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, groupId), eq(conversationMembersTable.userId, requesterId)))
    .limit(1);
  if (!myMembership || (!["owner", "admin"].includes(myMembership.role) && requesterId !== targetUserId)) {
    res.status(403).json({ error: "Insufficient permissions" });
    return;
  }

  await db.delete(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, groupId), eq(conversationMembersTable.userId, targetUserId)));
  res.sendStatus(204);
});

router.patch("/groups/:groupId/members/:userId/role", requireAuth, async (req, res): Promise<void> => {
  const { userId: requesterId } = getUser(req);
  const rawGroupId = Array.isArray(req.params.groupId) ? req.params.groupId[0] : req.params.groupId;
  const rawUserId = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const groupId = parseInt(rawGroupId, 10);
  const targetUserId = parseInt(rawUserId, 10);

  const parsed = UpdateGroupMemberRoleBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const [myMembership] = await db.select().from(conversationMembersTable)
    .where(and(eq(conversationMembersTable.conversationId, groupId), eq(conversationMembersTable.userId, requesterId)))
    .limit(1);
  if (!myMembership || myMembership.role !== "owner") {
    res.status(403).json({ error: "Only the owner can change roles" });
    return;
  }

  const updated = await updateWhere(
    conversationMembersTable,
    { role: parsed.data.role },
    and(
      eq(conversationMembersTable.conversationId, groupId),
      eq(conversationMembersTable.userId, targetUserId),
    ),
  );

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, updated.userId)).limit(1);
  res.json({
    userId: updated.userId,
    user: user ? sanitizeUser(user) : null,
    role: updated.role,
    joinedAt: updated.joinedAt.toISOString(),
  });
});

export default router;
