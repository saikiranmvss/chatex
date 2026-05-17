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

export const userStatusEnum = mysqlEnum("user_status", [
  "active",
  "suspended",
  "banned",
]);
export const userPresenceEnum = mysqlEnum("user_presence", [
  "online",
  "away",
  "offline",
]);
export const userRoleEnum = mysqlEnum("user_role", [
  "user",
  "moderator",
  "admin",
]);

export const usersTable = mysqlTable("users", {
  id: int("id").autoincrement().primaryKey(),
  username: varchar("username", { length: 255 }).notNull().unique(),
  email: varchar("email", { length: 255 }).notNull().unique(),
  passwordHash: varchar("password_hash", { length: 255 }).notNull(),
  displayName: varchar("display_name", { length: 255 }).notNull(),
  avatarUrl: text("avatar_url"),
  bio: text("bio"),
  status: userStatusEnum.notNull().default("active"),
  presence: userPresenceEnum.notNull().default("offline"),
  role: userRoleEnum.notNull().default("user"),
  isVerified: boolean("is_verified").notNull().default(false),
  lastSeenAt: timestamp("last_seen_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const insertUserSchema = createInsertSchema(usersTable).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});
export type InsertUser = z.infer<typeof insertUserSchema>;
export type User = typeof usersTable.$inferSelect;
