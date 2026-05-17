import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  timestamp,
  mysqlEnum,
  json,
} from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { conversationsTable } from "./conversations";

export const messageTypeEnum = mysqlEnum("message_type", [
  "text",
  "image",
  "video",
  "audio",
  "file",
  "sticker",
  "gif",
  "system",
]);
export const messageStatusEnum = mysqlEnum("message_status", [
  "sending",
  "sent",
  "delivered",
  "seen",
]);

export const messagesTable = mysqlTable("messages", {
  id: int("id").autoincrement().primaryKey(),
  conversationId: int("conversation_id")
    .notNull()
    .references(() => conversationsTable.id, { onDelete: "cascade" }),
  senderId: int("sender_id")
    .notNull()
    .references(() => usersTable.id),
  content: text("content").notNull(),
  type: messageTypeEnum.notNull().default("text"),
  status: messageStatusEnum.notNull().default("sent"),
  replyToId: int("reply_to_id"),
  mediaUrl: text("media_url"),
  mediaType: varchar("media_type", { length: 100 }),
  mediaSize: int("media_size"),
  mediaName: varchar("media_name", { length: 255 }),
  isEdited: boolean("is_edited").notNull().default(false),
  isPinned: boolean("is_pinned").notNull().default(false),
  isDeleted: boolean("is_deleted").notNull().default(false),
  reactions: json("reactions").notNull().$type<unknown[]>().default([]),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  editedAt: timestamp("edited_at"),
});

export const starredMessagesTable = mysqlTable("starred_messages", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  messageId: int("message_id")
    .notNull()
    .references(() => messagesTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertMessageSchema = createInsertSchema(messagesTable).omit({
  id: true,
  createdAt: true,
  editedAt: true,
});
export type InsertMessage = z.infer<typeof insertMessageSchema>;
export type Message = typeof messagesTable.$inferSelect;
