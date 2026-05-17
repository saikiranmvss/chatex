import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  timestamp,
  mysqlEnum,
} from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const conversationTypeEnum = mysqlEnum("conversation_type", [
  "direct",
  "group",
  "channel",
]);

export const conversationsTable = mysqlTable("conversations", {
  id: int("id").autoincrement().primaryKey(),
  type: conversationTypeEnum.notNull(),
  name: varchar("name", { length: 255 }),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  ownerId: int("owner_id").references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const conversationMembersTable = mysqlTable("conversation_members", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  userId: int("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  role: varchar("role", { length: 50 }).notNull().default("member"),
  isArchived: boolean("is_archived").notNull().default(false),
  isMuted: boolean("is_muted").notNull().default(false),
  isPinned: boolean("is_pinned").notNull().default(false),
  unreadCount: int("unread_count").notNull().default(0),
  joinedAt: timestamp("joined_at").notNull().defaultNow(),
});

export const insertConversationSchema = createInsertSchema(
  conversationsTable,
).omit({ id: true, createdAt: true, updatedAt: true });
export type InsertConversation = z.infer<typeof insertConversationSchema>;
export type Conversation = typeof conversationsTable.$inferSelect;
export type ConversationMember = typeof conversationMembersTable.$inferSelect;
