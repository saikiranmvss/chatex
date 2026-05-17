import { eq, getTableColumns, type SQL } from "drizzle-orm";
import type { AnyMySqlTable } from "drizzle-orm/mysql-core";
import { db } from "./client";

function getIdColumn(table: AnyMySqlTable) {
  const id = getTableColumns(table).id;
  if (!id) {
    throw new Error("Table must have an id column");
  }
  return id;
}

/** Insert a row and return the full record (MySQL has no RETURNING). */
export async function insertOne<TTable extends AnyMySqlTable>(
  table: TTable,
  values: TTable["$inferInsert"],
): Promise<TTable["$inferSelect"]> {
  const result = await db.insert(table).values(values);
  const header = Array.isArray(result) ? result[0] : result;
  const insertId = Number(header?.insertId);
  if (!insertId) {
    throw new Error("Failed to get insert id");
  }
  const idCol = getIdColumn(table);
  const [row] = await db
    .select()
    .from(table)
    .where(eq(idCol, insertId))
    .limit(1);
  if (!row) {
    throw new Error("Failed to read row after insert");
  }
  return row;
}

/** Update by primary key and return the full record. */
export async function updateOneById<TTable extends AnyMySqlTable>(
  table: TTable,
  id: number,
  set: Partial<TTable["$inferInsert"]>,
): Promise<TTable["$inferSelect"]> {
  const idCol = getIdColumn(table);
  await db.update(table).set(set).where(eq(idCol, id));
  const [row] = await db.select().from(table).where(eq(idCol, id)).limit(1);
  if (!row) {
    throw new Error(`Row not found after update (id=${id})`);
  }
  return row;
}

/** Update matching rows and return the first updated record. */
export async function updateWhere<TTable extends AnyMySqlTable>(
  table: TTable,
  set: Partial<TTable["$inferInsert"]>,
  where: SQL,
): Promise<TTable["$inferSelect"]> {
  await db.update(table).set(set).where(where);
  const [row] = await db.select().from(table).where(where).limit(1);
  if (!row) {
    throw new Error("Row not found after update");
  }
  return row;
}
