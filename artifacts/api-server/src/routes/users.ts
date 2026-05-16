import { Router, type IRouter } from "express";
import { eq, ilike, or, and, ne } from "drizzle-orm";
import { db, usersTable, blockedUsersTable } from "@workspace/db";
import { requireAuth, getUser } from "../lib/auth";
import { sanitizeUser } from "./auth";

const router: IRouter = Router();

router.get("/users", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const limit = Math.min(Number(req.query.limit) || 20, 50);
  const offset = Number(req.query.offset) || 0;

  const users = await db.select().from(usersTable)
    .where(
      q
        ? or(
            ilike(usersTable.username, `%${q}%`),
            ilike(usersTable.displayName, `%${q}%`),
            ilike(usersTable.email, `%${q}%`),
          )
        : ne(usersTable.id, userId)
    )
    .limit(limit)
    .offset(offset);

  res.json(users.filter(u => u.id !== userId).map(sanitizeUser));
});

router.get("/users/:userId", requireAuth, async (req, res): Promise<void> => {
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const targetId = parseInt(raw, 10);
  if (isNaN(targetId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, targetId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(sanitizeUser(user));
});

router.post("/users/:userId/block", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const targetId = parseInt(raw, 10);
  if (isNaN(targetId) || targetId === userId) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  const existing = await db.select().from(blockedUsersTable)
    .where(and(eq(blockedUsersTable.blockerId, userId), eq(blockedUsersTable.blockedId, targetId)))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(blockedUsersTable).values({ blockerId: userId, blockedId: targetId });
  }
  res.sendStatus(204);
});

router.post("/users/:userId/unblock", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.userId) ? req.params.userId[0] : req.params.userId;
  const targetId = parseInt(raw, 10);
  if (isNaN(targetId)) {
    res.status(400).json({ error: "Invalid userId" });
    return;
  }

  await db.delete(blockedUsersTable)
    .where(and(eq(blockedUsersTable.blockerId, userId), eq(blockedUsersTable.blockedId, targetId)));
  res.sendStatus(204);
});

export default router;
