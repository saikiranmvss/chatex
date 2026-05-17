import bcrypt from "bcryptjs";
import { desc, eq } from "drizzle-orm";
import {
  db,
  usersTable,
  conversationsTable,
  conversationMembersTable,
  messagesTable,
  channelsTable,
  channelSubscribersTable,
  notificationsTable,
} from "@workspace/db";

async function insertConversation(
  values: typeof conversationsTable.$inferInsert,
) {
  await db.insert(conversationsTable).values(values);
  const [row] = await db
    .select({ id: conversationsTable.id })
    .from(conversationsTable)
    .orderBy(desc(conversationsTable.id))
    .limit(1);
  if (!row) throw new Error("Failed to insert conversation");
  return row;
}

async function insertChannel(values: typeof channelsTable.$inferInsert) {
  await db.insert(channelsTable).values(values);
  const [row] = await db
    .select({ id: channelsTable.id })
    .from(channelsTable)
    .orderBy(desc(channelsTable.id))
    .limit(1);
  if (!row) throw new Error("Failed to insert channel");
  return row;
}

async function seed() {
  console.log("Seeding Nexus demo data...");

  const existing = await db
    .select({ id: usersTable.id })
    .from(usersTable)
    .where(eq(usersTable.email, "admin@nexus.app"))
    .limit(1);

  if (existing.length > 0) {
    console.log("Users already exist, skipping seed.");
    process.exit(0);
  }

  const passwordHash = await bcrypt.hash("password123", 12);

  await db.insert(usersTable).values([
      {
        username: "admin",
        email: "admin@nexus.app",
        passwordHash,
        displayName: "Admin",
        bio: "Platform administrator",
        role: "admin",
        status: "active",
        presence: "online",
        isVerified: true,
        lastSeenAt: new Date(),
      },
      {
        username: "alice",
        email: "alice@nexus.app",
        passwordHash,
        displayName: "Alice Chen",
        bio: "Product designer and coffee enthusiast",
        role: "user",
        status: "active",
        presence: "online",
        isVerified: true,
        lastSeenAt: new Date(),
      },
      {
        username: "bob",
        email: "bob@nexus.app",
        passwordHash,
        displayName: "Bob Martinez",
        bio: "Backend engineer, open source contributor",
        role: "user",
        status: "active",
        presence: "away",
        lastSeenAt: new Date(Date.now() - 600000),
      },
      {
        username: "carol",
        email: "carol@nexus.app",
        passwordHash,
        displayName: "Carol Kim",
        bio: "UX researcher and occasional hiker",
        role: "moderator",
        status: "active",
        presence: "offline",
        lastSeenAt: new Date(Date.now() - 3600000),
      },
      {
        username: "dave",
        email: "dave@nexus.app",
        passwordHash,
        displayName: "Dave Thompson",
        bio: "DevOps wizard",
        role: "user",
        status: "active",
        presence: "online",
        lastSeenAt: new Date(),
      },
    ]);

  const allUsers = await db.select().from(usersTable);
  const admin = allUsers.find((u) => u.email === "admin@nexus.app")!;
  const alice = allUsers.find((u) => u.email === "alice@nexus.app")!;
  const bob = allUsers.find((u) => u.email === "bob@nexus.app")!;
  const carol = allUsers.find((u) => u.email === "carol@nexus.app")!;
  const dave = allUsers.find((u) => u.email === "dave@nexus.app")!;

  // Direct conversation: admin <-> alice
  const directConv1 = await insertConversation({ type: "direct" });
  await db.insert(conversationMembersTable).values([
    { conversationId: directConv1.id, userId: admin.id, role: "member", isPinned: true },
    { conversationId: directConv1.id, userId: alice.id, role: "member" },
  ]);
  await db.insert(messagesTable).values([
    { conversationId: directConv1.id, senderId: alice.id, content: "Hey! Have you checked the new design mockups?", type: "text", status: "seen", reactions: [] },
    { conversationId: directConv1.id, senderId: admin.id, content: "Just had a look — the new sidebar layout looks great. Really clean.", type: "text", status: "seen", reactions: [] },
    { conversationId: directConv1.id, senderId: alice.id, content: "Happy to hear that! I was worried about the density on mobile.", type: "text", status: "sent", reactions: [{ emoji: "👍", count: 1, userIds: [admin.id] }] },
  ]);

  // Direct conversation: admin <-> bob
  const directConv2 = await insertConversation({ type: "direct" });
  await db.insert(conversationMembersTable).values([
    { conversationId: directConv2.id, userId: admin.id, role: "member" },
    { conversationId: directConv2.id, userId: bob.id, role: "member" },
  ]);
  await db.insert(messagesTable).values([
    { conversationId: directConv2.id, senderId: bob.id, content: "The auth routes are done. JWT tokens working end-to-end.", type: "text", status: "seen", reactions: [] },
    { conversationId: directConv2.id, senderId: admin.id, content: "Excellent. Let's do a code review tomorrow morning.", type: "text", status: "delivered", reactions: [] },
  ]);

  // Direct conversation: admin <-> carol
  const directConv3 = await insertConversation({ type: "direct" });
  await db.insert(conversationMembersTable).values([
    { conversationId: directConv3.id, userId: admin.id, role: "member" },
    { conversationId: directConv3.id, userId: carol.id, role: "member" },
  ]);
  await db.insert(messagesTable).values([
    { conversationId: directConv3.id, senderId: carol.id, content: "The user research results are in. Most users want better keyboard shortcuts.", type: "text", status: "delivered", reactions: [] },
  ]);

  // Group conversation: Team Nexus
  const groupConv = await insertConversation({
    type: "group",
    name: "Team Nexus",
    description: "Core product team — sprint planning and daily standups",
    ownerId: admin.id,
  });
  await db.insert(conversationMembersTable).values([
    { conversationId: groupConv.id, userId: admin.id, role: "owner", isPinned: true },
    { conversationId: groupConv.id, userId: alice.id, role: "admin" },
    { conversationId: groupConv.id, userId: bob.id, role: "member" },
    { conversationId: groupConv.id, userId: carol.id, role: "member" },
    { conversationId: groupConv.id, userId: dave.id, role: "member" },
  ]);
  await db.insert(messagesTable).values([
    { conversationId: groupConv.id, senderId: admin.id, content: "Sprint 14 kicks off today. Let's nail the message reactions feature.", type: "text", status: "seen", reactions: [] },
    { conversationId: groupConv.id, senderId: alice.id, content: "Designs are ready and in Figma. Linking in the channel.", type: "text", status: "seen", reactions: [{ emoji: "🎉", count: 2, userIds: [admin.id, bob.id] }] },
    { conversationId: groupConv.id, senderId: bob.id, content: "On it. Should have the API endpoints done by end of day.", type: "text", status: "seen", reactions: [] },
    { conversationId: groupConv.id, senderId: carol.id, content: "I'll add it to the user testing queue for next week.", type: "text", status: "seen", reactions: [] },
    { conversationId: groupConv.id, senderId: dave.id, content: "Infrastructure is ready, we can scale the message queue if needed.", type: "text", status: "sent", reactions: [] },
  ]);

  // Group conversation: Design Reviews
  const groupConv2 = await insertConversation({
    type: "group",
    name: "Design Reviews",
    description: "Weekly design critique and feedback sessions",
    ownerId: alice.id,
  });
  await db.insert(conversationMembersTable).values([
    { conversationId: groupConv2.id, userId: alice.id, role: "owner" },
    { conversationId: groupConv2.id, userId: admin.id, role: "member" },
    { conversationId: groupConv2.id, userId: carol.id, role: "member" },
  ]);
  await db.insert(messagesTable).values([
    { conversationId: groupConv2.id, senderId: alice.id, content: "This week: dark mode polish and the new onboarding flow.", type: "text", status: "seen", reactions: [] },
    { conversationId: groupConv2.id, senderId: carol.id, content: "The onboarding flow needs work — users are dropping off at step 3.", type: "text", status: "seen", reactions: [] },
    { conversationId: groupConv2.id, senderId: admin.id, content: "Let's simplify it. Cut the optional steps for now.", type: "text", status: "sent", reactions: [] },
  ]);

  // Channels
  const generalChannel = await insertChannel({
    name: "nexus-announcements",
    description: "Official platform announcements and release notes",
    isPublic: true,
    ownerId: admin.id,
  });
  await db.insert(channelSubscribersTable).values([
    { channelId: generalChannel.id, userId: admin.id },
    { channelId: generalChannel.id, userId: alice.id },
    { channelId: generalChannel.id, userId: bob.id },
    { channelId: generalChannel.id, userId: carol.id },
    { channelId: generalChannel.id, userId: dave.id },
  ]);

  const techChannel = await insertChannel({
    name: "engineering-updates",
    description: "Weekly engineering blog posts, architecture decisions, and technical deep-dives",
    isPublic: true,
    ownerId: bob.id,
  });
  await db.insert(channelSubscribersTable).values([
    { channelId: techChannel.id, userId: bob.id },
    { channelId: techChannel.id, userId: admin.id },
    { channelId: techChannel.id, userId: dave.id },
  ]);

  await insertChannel({
    name: "design-inspiration",
    description: "Curated design inspiration, UI patterns, and UX case studies",
    isPublic: true,
    ownerId: alice.id,
  });

  // Notifications for admin
  await db.insert(notificationsTable).values([
    {
      userId: admin.id,
      actorUserId: alice.id,
      type: "mention",
      title: "Alice mentioned you",
      body: "Hey @admin, can you review the new dashboard layout?",
      isRead: false,
      referenceType: "conversation",
      referenceId: groupConv.id,
    },
    {
      userId: admin.id,
      actorUserId: bob.id,
      type: "message",
      title: "New message from Bob",
      body: "The auth routes are done. JWT tokens working end-to-end.",
      isRead: false,
      referenceType: "conversation",
      referenceId: directConv2.id,
    },
    {
      userId: admin.id,
      type: "channel_broadcast",
      title: "New channel announcement",
      body: "Welcome to Nexus! We are excited to launch this platform.",
      isRead: true,
      referenceType: "channel",
      referenceId: generalChannel.id,
    },
    {
      userId: admin.id,
      actorUserId: carol.id,
      type: "message",
      title: "Carol sent you a message",
      body: "The user research results are in. Most users want better keyboard shortcuts.",
      isRead: true,
      referenceType: "conversation",
      referenceId: directConv3.id,
    },
  ]);

  console.log("Seed complete.");
  console.log("Admin login: admin@nexus.app / password123");
  console.log("User login: alice@nexus.app / password123");
  process.exit(0);
}

seed().catch(err => {
  console.error("Seed failed:", err);
  process.exit(1);
});
