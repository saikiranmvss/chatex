import { Router, type IRouter } from "express";
import { eq, and, desc } from "drizzle-orm";
import { db, notificationsTable, usersTable } from "@workspace/db";
import { requireAuth, getUser } from "../lib/auth";
import { sanitizeUser } from "./auth";

const router: IRouter = Router();

router.get("/notifications", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const unreadOnly = req.query.unreadOnly === "true";
  const limit = Math.min(Number(req.query.limit) || 30, 100);

  const notifications = await db.select().from(notificationsTable)
    .where(
      unreadOnly
        ? and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false))
        : eq(notificationsTable.userId, userId)
    )
    .orderBy(desc(notificationsTable.createdAt))
    .limit(limit);

  const result = await Promise.all(
    notifications.map(async n => {
      let actorUser = null;
      if (n.actorUserId) {
        const [u] = await db.select().from(usersTable).where(eq(usersTable.id, n.actorUserId)).limit(1);
        actorUser = u ? sanitizeUser(u) : null;
      }
      return {
        id: n.id,
        type: n.type,
        title: n.title,
        body: n.body,
        isRead: n.isRead,
        referenceId: n.referenceId ?? null,
        referenceType: n.referenceType ?? null,
        actorUser,
        createdAt: n.createdAt.toISOString(),
      };
    })
  );

  res.json(result);
});

router.post("/notifications/read-all", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  await db.update(notificationsTable).set({ isRead: true }).where(eq(notificationsTable.userId, userId));
  res.sendStatus(204);
});

router.get("/notifications/unread-count", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const rows = await db
    .select()
    .from(notificationsTable)
    .where(and(eq(notificationsTable.userId, userId), eq(notificationsTable.isRead, false)));
  res.json({ count: rows.length });
});

router.patch("/notifications/:notificationId/read", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.notificationId)
    ? req.params.notificationId[0]
    : req.params.notificationId;
  const notificationId = parseInt(raw, 10);

  await db
    .update(notificationsTable)
    .set({ isRead: true })
    .where(
      and(eq(notificationsTable.id, notificationId), eq(notificationsTable.userId, userId)),
    );
  res.sendStatus(204);
});

export default router;
