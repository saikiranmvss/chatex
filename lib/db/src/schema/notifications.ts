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

export const notificationTypeEnum = mysqlEnum("notification_type", [
  "message",
  "mention",
  "group_invite",
  "channel_broadcast",
  "system",
]);

export const notificationsTable = mysqlTable("notifications", {
  id: int("id").autoincrement().primaryKey(),
  userId: int("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  actorUserId: int("actor_user_id").references(() => usersTable.id),
  type: notificationTypeEnum.notNull(),
  title: varchar("title", { length: 255 }).notNull(),
  body: text("body").notNull(),
  isRead: boolean("is_read").notNull().default(false),
  referenceId: int("reference_id"),
  referenceType: varchar("reference_type", { length: 50 }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertNotificationSchema = createInsertSchema(
  notificationsTable,
).omit({ id: true, createdAt: true });
export type InsertNotification = z.infer<typeof insertNotificationSchema>;
export type Notification = typeof notificationsTable.$inferSelect;
