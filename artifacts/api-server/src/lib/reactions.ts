export type Reaction = { emoji: string; count: number; userIds: number[] };

/** MySQL JSON may arrive as a string, object, or malformed value — always coerce to an array. */
export function normalizeReactions(raw: unknown): Reaction[] {
  let value: unknown = raw;

  if (value == null) return [];

  if (typeof value === "string") {
    try {
      value = JSON.parse(value) as unknown;
    } catch {
      return [];
    }
  }

  if (Array.isArray(value)) {
    return value
      .filter((item): item is Record<string, unknown> => item != null && typeof item === "object")
      .map((item) => {
        const emoji = typeof item.emoji === "string" ? item.emoji : "";
        const userIds = Array.isArray(item.userIds)
          ? item.userIds.map((id) => Number(id)).filter((id) => !Number.isNaN(id))
          : [];
        const count =
          typeof item.count === "number" && item.count >= 0 ? item.count : userIds.length;
        return { emoji, count, userIds };
      })
      .filter((r) => r.emoji.length > 0);
  }

  if (typeof value === "object") {
    return normalizeReactions(Object.values(value as Record<string, unknown>));
  }

  return [];
}
