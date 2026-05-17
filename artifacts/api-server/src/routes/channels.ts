import { Router, type IRouter } from "express";
import { eq, like, and, count, sql } from "drizzle-orm";
import { db, channelsTable, channelSubscribersTable, insertOne, usersTable } from "@workspace/db";
import { CreateChannelBody } from "@workspace/api-zod";
import { requireAuth, getUser } from "../lib/auth";

const router: IRouter = Router();

async function buildChannel(channel: typeof channelsTable.$inferSelect, userId: number) {
  const [subCount] = await db.select({ count: count() }).from(channelSubscribersTable)
    .where(eq(channelSubscribersTable.channelId, channel.id));
  const [userSub] = await db.select().from(channelSubscribersTable)
    .where(and(eq(channelSubscribersTable.channelId, channel.id), eq(channelSubscribersTable.userId, userId)))
    .limit(1);

  return {
    id: channel.id,
    name: channel.name,
    description: channel.description ?? null,
    avatarUrl: channel.avatarUrl ?? null,
    subscriberCount: subCount?.count ?? 0,
    isSubscribed: !!userSub,
    isPublic: channel.isPublic,
    ownerId: channel.ownerId,
    createdAt: channel.createdAt.toISOString(),
  };
}

router.get("/channels", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const q = typeof req.query.q === "string" ? req.query.q : "";
  const limit = Math.min(Number(req.query.limit) || 20, 50);

  const channels = await db.select().from(channelsTable)
    .where(q ? like(channelsTable.name, `%${q}%`) : eq(channelsTable.isPublic, true))
    .limit(limit);

  const result = await Promise.all(channels.map(c => buildChannel(c, userId)));
  res.json(result);
});

router.post("/channels", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const parsed = CreateChannelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }

  const channel = await insertOne(channelsTable, {
    name: parsed.data.name,
    description: parsed.data.description ?? null,
    avatarUrl: parsed.data.avatarUrl ?? null,
    isPublic: parsed.data.isPublic ?? true,
    ownerId: userId,
  });

  await db.insert(channelSubscribersTable).values({ channelId: channel.id, userId });
  res.status(201).json(await buildChannel(channel, userId));
});

router.get("/channels/:channelId", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.channelId) ? req.params.channelId[0] : req.params.channelId;
  const channelId = parseInt(raw, 10);

  const [channel] = await db.select().from(channelsTable).where(eq(channelsTable.id, channelId)).limit(1);
  if (!channel) {
    res.status(404).json({ error: "Channel not found" });
    return;
  }

  res.json(await buildChannel(channel, userId));
});

router.post("/channels/:channelId/subscribe", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.channelId) ? req.params.channelId[0] : req.params.channelId;
  const channelId = parseInt(raw, 10);

  const existing = await db.select().from(channelSubscribersTable)
    .where(and(eq(channelSubscribersTable.channelId, channelId), eq(channelSubscribersTable.userId, userId)))
    .limit(1);

  if (existing.length === 0) {
    await db.insert(channelSubscribersTable).values({ channelId, userId });
  }
  res.sendStatus(204);
});

router.post("/channels/:channelId/unsubscribe", requireAuth, async (req, res): Promise<void> => {
  const { userId } = getUser(req);
  const raw = Array.isArray(req.params.channelId) ? req.params.channelId[0] : req.params.channelId;
  const channelId = parseInt(raw, 10);

  await db.delete(channelSubscribersTable)
    .where(and(eq(channelSubscribersTable.channelId, channelId), eq(channelSubscribersTable.userId, userId)));
  res.sendStatus(204);
});

export default router;
