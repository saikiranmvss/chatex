import {
  mysqlTable,
  int,
  varchar,
  text,
  timestamp,
} from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";

export const platformSettingsTable = mysqlTable("platform_settings", {
  id: int("id").autoincrement().primaryKey(),
  key: varchar("key", { length: 255 }).notNull().unique(),
  value: text("value").notNull(),
  updatedAt: timestamp("updated_at")
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date()),
});

export const blockedUsersTable = mysqlTable("blocked_users", {
  id: int("id").autoincrement().primaryKey(),
  blockerId: int("blocker_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  blockedId: int("blocked_id")
    .notNull()
    .references(() => usersTable.id, { onDelete: "cascade" }),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertPlatformSettingSchema = createInsertSchema(
  platformSettingsTable,
).omit({ id: true, updatedAt: true });
export type InsertPlatformSetting = z.infer<typeof insertPlatformSettingSchema>;
export type PlatformSetting = typeof platformSettingsTable.$inferSelect;
