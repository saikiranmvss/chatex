import { Router, type IRouter } from "express";
import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import { db, usersTable } from "@workspace/db";
import { RegisterBody, LoginBody, UpdateMeBody, ChangePasswordBody } from "@workspace/api-zod";
import { signToken, requireAuth, getUser } from "../lib/auth";

const router: IRouter = Router();

router.post("/auth/register", async (req, res): Promise<void> => {
  const parsed = RegisterBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { username, email, password, displayName } = parsed.data;

  const existing = await db.select().from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);
  if (existing.length > 0) {
    res.status(400).json({ error: "Email already in use" });
    return;
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const [user] = await db.insert(usersTable).values({
    username,
    email,
    passwordHash,
    displayName: displayName ?? username,
    presence: "online",
    lastSeenAt: new Date(),
  }).returning();

  const token = signToken({ userId: user.id, role: user.role });
  res.status(201).json({
    token,
    user: sanitizeUser(user),
  });
});

router.post("/auth/login", async (req, res): Promise<void> => {
  const parsed = LoginBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const { email, password } = parsed.data;

  const [user] = await db.select().from(usersTable)
    .where(eq(usersTable.email, email))
    .limit(1);

  if (!user || !(await bcrypt.compare(password, user.passwordHash))) {
    res.status(401).json({ error: "Invalid credentials" });
    return;
  }

  if (user.status !== "active") {
    res.status(403).json({ error: `Account is ${user.status}` });
    return;
  }

  await db.update(usersTable).set({ presence: "online", lastSeenAt: new Date() })
    .where(eq(usersTable.id, user.id));

  const token = signToken({ userId: user.id, role: user.role });
  res.json({ token, user: sanitizeUser({ ...user, presence: "online" }) });
});

router.post("/auth/logout", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  await db.update(usersTable).set({ presence: "offline" }).where(eq(usersTable.id, userId));
  res.sendStatus(204);
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user) {
    res.status(404).json({ error: "User not found" });
    return;
  }
  res.json(sanitizeUser(user));
});

router.patch("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const parsed = UpdateMeBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const updates: Partial<typeof usersTable.$inferInsert> = {};
  if (parsed.data.displayName != null) updates.displayName = parsed.data.displayName;
  if (parsed.data.bio != null) updates.bio = parsed.data.bio;
  if (parsed.data.avatarUrl != null) updates.avatarUrl = parsed.data.avatarUrl;
  if (parsed.data.presence != null) updates.presence = parsed.data.presence as "online" | "away" | "offline";

  const [user] = await db.update(usersTable).set(updates).where(eq(usersTable.id, userId)).returning();
  res.json(sanitizeUser(user));
});

router.post("/auth/change-password", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const parsed = ChangePasswordBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const [user] = await db.select().from(usersTable).where(eq(usersTable.id, userId)).limit(1);
  if (!user || !(await bcrypt.compare(parsed.data.currentPassword, user.passwordHash))) {
    res.status(400).json({ error: "Current password is incorrect" });
    return;
  }
  const passwordHash = await bcrypt.hash(parsed.data.newPassword, 12);
  await db.update(usersTable).set({ passwordHash }).where(eq(usersTable.id, userId));
  res.sendStatus(204);
});

export function sanitizeUser(user: typeof usersTable.$inferSelect) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    displayName: user.displayName,
    avatarUrl: user.avatarUrl ?? null,
    bio: user.bio ?? null,
    status: user.status,
    presence: user.presence,
    role: user.role,
    isVerified: user.isVerified,
    lastSeenAt: user.lastSeenAt?.toISOString() ?? null,
    createdAt: user.createdAt.toISOString(),
  };
}

export default router;
