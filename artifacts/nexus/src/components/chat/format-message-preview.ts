import type { Message } from "@workspace/api-client-react";

export function formatMessagePreview(msg?: Message | { type?: string; content?: string; mediaName?: string | null } | null): string {
  if (!msg) return "No messages yet";
  const type = msg.type ?? "text";
  const content = msg.content?.trim() ?? "";

  switch (type) {
    case "image":
      return content && content !== msg.mediaName ? content : "Photo";
    case "video":
      return content || "Video";
    case "audio":
      return content || "Voice message";
    case "file":
      return msg.mediaName ?? (content || "File");
    case "sticker":
      return "Sticker";
    case "gif":
      return "GIF";
    case "system":
      return content || "System message";
    default:
      return content || "Message";
  }
}
