import {
  mysqlTable,
  int,
  varchar,
  text,
  boolean,
  timestamp,
} from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const channelsTable = mysqlTable("channels", {
  id: int("id").autoincrement().primaryKey(),
  name: varchar("name", { length: 255 }).notNull(),
  description: text("description"),
  avatarUrl: text("avatar_url"),
  isPublic: boolean("is_public").notNull().default(true),
  ownerId: int("owner_id")
    .notNull()
    .references(() => usersTable.id),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const channelSubscribersTable = mysqlTable("channel_subscribers", {
  id: int("id").autoincrement().primaryKey(),
  channelId: int("channel_id")
    .notNull()
    .references(() => channelsTable.id, { onDelete: "cascade" }),
  userId: int("user_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertChannelSchema = createInsertSchema(channelsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertChannel = z.infer<typeof insertChannelSchema>;
export type Channel = typeof channelsTable.$inferSelect;
