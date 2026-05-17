import { Router, type IRouter } from "express";
import { eq, count, like, and, gte, sql } from "drizzle-orm";
import { db, usersTable, messagesTable, conversationsTable, notificationsTable, reportsTable } from "@workspace/db";
import { AdminBroadcastBody, UpdateAdminSettingsBody } from "@workspace/api-zod";
import { requireAuth, requireAdmin, getUser } from "../lib/auth";
import { sanitizeUser } from "./auth";
import { platformSettingsTable } from "@workspace/db";

const router: IRouter = Router();

const DEFAULT_SETTINGS: Record<string, string> = {
  emailRegistration: "true",
  maintenanceMode: "false",
  maxFileUploadMb: "50",
  allowGuestBrowse: "false",
  requireEmailVerify: "false",
};

async function getSettings() {
  const rows = await db.select().from(platformSettingsTable);
  const map: Record<string, string> = { ...DEFAULT_SETTINGS };
  for (const row of rows) map[row.key] = row.value;
  return {
    emailRegistration: map.emailRegistration === "true",
    maintenanceMode: map.maintenanceMode === "true",
    maxFileUploadMb: parseInt(map.maxFileUploadMb),
    allowGuestBrowse: map.allowGuestBrowse === "true",
    requireEmailVerify: map.requireEmailVerify === "true",
  };
}

router.get("/admin/stats", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  const [totalUsers] = await db.select({ count: count() }).from(usersTable);
  const [activeUsers] = await db.select({ count: count() }).from(usersTable).where(eq(usersTable.status, "active"));
  const [totalMessages] = await db.select({ count: count() }).from(messagesTable);
  const [totalGroups] = await db.select({ count: count() }).from(conversationsTable).where(eq(conversationsTable.type, "group"));
  const [totalChannels] = await db.select({ count: count() }).from(conversationsTable).where(eq(conversationsTable.type, "channel"));

  const oneDayAgo = new Date(Date.now() - 86400000);
  const [newUsersToday] = await db.select({ count: count() }).from(usersTable).where(gte(usersTable.createdAt, oneDayAgo));
  const [messagesLast24h] = await db.select({ count: count() }).from(messagesTable).where(gte(messagesTable.createdAt, oneDayAgo));

  res.json({
    totalUsers: totalUsers?.count ?? 0,
    activeUsers: activeUsers?.count ?? 0,
    totalMessages: totalMessages?.count ?? 0,
    totalGroups: totalGroups?.count ?? 0,
    totalChannels: totalChannels?.count ?? 0,
    newUsersToday: newUsersToday?.count ?? 0,
    messagesLast24h: messagesLast24h?.count ?? 0,
    storageUsedMb: Math.random() * 1024,
  });
});

router.get("/admin/users", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const statusFilter = typeof req.query.status === "string" ? req.query.status : null;
  const limit = Math.min(Number(req.query.limit) || 50, 100);
  const offset = Number(req.query.offset) || 0;

  let users;
  if (q) {
    users = await db.select().from(usersTable)
      .where(like(usersTable.username, `%${q}%`))
      .limit(limit).offset(offset);
  } else if (statusFilter) {
    users = await db.select().from(usersTable)
      .where(eq(usersTable.status, statusFilter as "active" | "suspended" | "banned"))
      .limit(limit).offset(offset);
  } else {
    users = await db.select().from(usersTable).limit(limit).offset(offset);
  }

  const result = await Promise.all(users.map(async u => {
    const [msgCount] = await db.select({ count: count() }).from(messagesTable).where(eq(messagesTable.senderId, u.id));
    return {
      ...sanitizeUser(u),
      messageCount: msgCount?.count ?? 0,
    };
  }));

  res.json(result);
});

router.post("/admin/users/:userId/suspend", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const targetId = parseInt(raw, 10);
  await db.update(usersTable).set({ status: "suspended" }).where(eq(usersTable.id, targetId));
  res.sendStatus(204);
});

router.post("/admin/users/:userId/ban", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const targetId = parseInt(raw, 10);
  await db.update(usersTable).set({ status: "banned" }).where(eq(usersTable.id, targetId));
  res.sendStatus(204);
});

router.post("/admin/users/:userId/activate", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const targetId = parseInt(raw, 10);
  await db.update(usersTable).set({ status: "active" }).where(eq(usersTable.id, targetId));
  res.sendStatus(204);
});

router.get("/admin/reports", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const statusFilter = typeof req.query.status === "string" ? req.query.status : null;
  const limit = Math.min(Number(req.query.limit) || 30, 100);

  const reports = statusFilter
    ? await db.select().from(reportsTable).where(eq(reportsTable.status, statusFilter as "pending" | "resolved" | "dismissed")).limit(limit)
    : await db.select().from(reportsTable).limit(limit);

  const result = await Promise.all(reports.map(async r => {
    const [reporter] = await db.select().from(usersTable).where(eq(usersTable.id, r.reporterId)).limit(1);
    let targetUser = null;
    if (r.targetUserId) {
      const [u] = await db.select().from(usersTable).where(eq(usersTable.id, r.targetUserId)).limit(1);
      targetUser = u ? sanitizeUser(u) : null;
    }
    return {
      id: r.id,
      reporterId: r.reporterId,
      reporter: reporter ? sanitizeUser(reporter) : null,
      targetUserId: r.targetUserId ?? null,
      targetUser,
      messageId: r.messageId ?? null,
      reason: r.reason,
      description: r.description ?? null,
      status: r.status,
      createdAt: r.createdAt.toISOString(),
    };
  }));

  res.json(result);
});

router.post("/admin/broadcast", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = AdminBroadcastBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const allUsers = await db.select({ id: usersTable.id }).from(usersTable);
  await db.insert(notificationsTable).values(
    allUsers.map(u => ({
      userId: u.id,
      type: "system" as const,
      title: parsed.data.title,
      body: parsed.data.body,
    }))
  );

  res.sendStatus(204);
});

router.get("/admin/settings", requireAuth, requireAdmin, async (_req, res): Promise<void> => {
  res.json(await getSettings());
});

router.patch("/admin/settings", requireAuth, requireAdmin, async (req, res): Promise<void> => {
  const parsed = UpdateAdminSettingsBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const updates = parsed.data;
  const pairs: Array<{ key: string; value: string }> = [];

  if (updates.emailRegistration != null) pairs.push({ key: "emailRegistration", value: String(updates.emailRegistration) });
  if (updates.maintenanceMode != null) pairs.push({ key: "maintenanceMode", value: String(updates.maintenanceMode) });
  if (updates.maxFileUploadMb != null) pairs.push({ key: "maxFileUploadMb", value: String(updates.maxFileUploadMb) });
  if (updates.allowGuestBrowse != null) pairs.push({ key: "allowGuestBrowse", value: String(updates.allowGuestBrowse) });
  if (updates.requireEmailVerify != null) pairs.push({ key: "requireEmailVerify", value: String(updates.requireEmailVerify) });

  for (const pair of pairs) {
    const existing = await db.select().from(platformSettingsTable).where(eq(platformSettingsTable.key, pair.key)).limit(1);
    if (existing.length > 0) {
      await db.update(platformSettingsTable).set({ value: pair.value }).where(eq(platformSettingsTable.key, pair.key));
    } else {
      await db.insert(platformSettingsTable).values(pair);
    }
  }

  res.json(await getSettings());
});

export default router;
