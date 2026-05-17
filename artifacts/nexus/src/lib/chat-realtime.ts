import type { QueryClient } from "@tanstack/react-query";
import {
  getListConversationsQueryKey,
  getListMessagesQueryKey,
  type Conversation,
  type Message,
} from "@workspace/api-client-react";
import { formatMessagePreview } from "@/components/chat/format-message-preview";

function sortConversations(list: Conversation[]): Conversation[] {
  return [...list].sort((a, b) => {
    if (a.isPinned && !b.isPinned) return -1;
    if (!a.isPinned && b.isPinned) return 1;
    return new Date(b.updatedAt ?? b.createdAt).getTime() - new Date(a.updatedAt ?? a.createdAt).getTime();
  });
}

export function upsertMessageInCache(queryClient: QueryClient, message: Message): void {
  const { conversationId } = message;
  queryClient.setQueryData<Message[]>(getListMessagesQueryKey(conversationId), (old) => {
    if (!old?.length) return [message];
    const idx = old.findIndex((m) => m.id === message.id);
    if (idx >= 0) {
      const next = [...old];
      next[idx] = message;
      return next;
    }
    return [...old, message];
  });
}

export function markMessageDeletedInCache(
  queryClient: QueryClient,
  conversationId: number,
  messageId: number,
): void {
  queryClient.setQueryData<Message[]>(getListMessagesQueryKey(conversationId), (old) => {
    if (!old) return old;
    return old.map((m) =>
      m.id === messageId
        ? { ...m, isDeleted: true, content: "This message was deleted" }
        : m,
    );
  });
}

export function patchConversationFromMessage(
  queryClient: QueryClient,
  message: Message,
  options?: { currentUserId?: number; activeConversationId?: number | null },
): void {
  const isFromMe = message.senderId === options?.currentUserId;
  const isActiveChat = options?.activeConversationId === message.conversationId;

  const previewContent = message.isDeleted
    ? "This message was deleted"
    : formatMessagePreview({
        type: message.type,
        content: message.content,
        mediaName: message.mediaName,
      });

  queryClient.setQueryData<Conversation[]>(getListConversationsQueryKey(), (old) => {
    if (!old?.length) return old;
    const updated = old.map((conv) => {
      if (conv.id !== message.conversationId) return conv;
      return {
        ...conv,
        updatedAt: message.createdAt,
        lastMessage: {
          id: message.id,
          content: previewContent,
          type: message.type,
          senderId: message.senderId,
          senderName: message.sender?.displayName ?? message.sender?.username ?? "Unknown",
        },
        unreadCount: isFromMe
          ? conv.unreadCount
          : isActiveChat
            ? 0
            : (conv.unreadCount ?? 0) + 1,
      };
    });
    return sortConversations(updated);
  });
}

/** Updates sidebar preview from notification (does not change unread — message:new handles that). */
export function patchConversationFromNotification(
  queryClient: QueryClient,
  conversationId: number,
  body: string,
  actorName?: string,
): void {
  queryClient.setQueryData<Conversation[]>(getListConversationsQueryKey(), (old) => {
    if (!old?.length) return old;
    const updated = old.map((conv) => {
      if (conv.id !== conversationId) return conv;
      const prev = conv.lastMessage;
      return {
        ...conv,
        updatedAt: new Date().toISOString(),
        lastMessage: {
          id: prev?.id ?? 0,
          content: body,
          type: prev?.type ?? "text",
          senderId: prev?.senderId ?? 0,
          senderName: actorName ?? prev?.senderName,
        },
      };
    });
    return sortConversations(updated);
  });
}
