export interface TypingUser {
  userId: number;
  displayName: string;
}

export function formatTypingLabel(users: TypingUser[]): string {
  if (users.length === 0) return "";
  if (users.length === 1) return `${users[0].displayName} is typing`;
  if (users.length === 2) {
    return `${users[0].displayName} and ${users[1].displayName} are typing`;
  }
  return `${users[0].displayName} and ${users.length - 1} others are typing`;
}
