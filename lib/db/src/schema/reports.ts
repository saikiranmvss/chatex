import {
  mysqlTable,
  int,
  text,
  timestamp,
  mysqlEnum,
} from "drizzle-orm/mysql-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { usersTable } from "./users";
import { messagesTable } from "./messages";

export const reportStatusEnum = mysqlEnum("report_status", [
  "pending",
  "resolved",
  "dismissed",
]);

export const reportsTable = mysqlTable("reports", {
  id: int("id").autoincrement().primaryKey(),
  reporterId: int("reporter_id")
    .notNull()
    .references(() => usersTable.id),
  targetUserId: int("target_user_id").references(() => usersTable.id),
  messageId: int("message_id").references(() => messagesTable.id),
  reason: text("reason").notNull(),
  description: text("description"),
  status: reportStatusEnum.notNull().default("pending"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const insertReportSchema = createInsertSchema(reportsTable).omit({
  id: true,
  createdAt: true,
});
export type InsertReport = z.infer<typeof insertReportSchema>;
export type Report = typeof reportsTable.$inferSelect;
