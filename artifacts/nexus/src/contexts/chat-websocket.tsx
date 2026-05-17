import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  getListConversationsQueryKey,
  getListConversationsQueryOptions,
  getListMessagesQueryKey,
  getListNotificationsQueryKey,
  getListNotificationsQueryOptions,
  listMessages,
  useListConversations,
  useListNotifications,
  type Conversation,
  type Message,
  type Notification,
  type UserPresence,
} from "@workspace/api-client-react";
import { parseWsMessage, parseWsNotification } from "@/lib/ws-payload";
import { useWebSocket, type WsEvent, type PresenceUpdatePayload } from "@/hooks/use-websocket";
import { useAuth } from "@/hooks/use-auth";
import { useBrowserNotify } from "@/hooks/use-browser-notify";
import {
  upsertMessageInCache,
  markMessageDeletedInCache,
  patchConversationFromMessage,
  patchConversationFromNotification,
} from "@/lib/chat-realtime";
import type { TypingUser } from "@/lib/typing";

type WsEventHandler = (event: WsEvent) => void;

type ChatWebSocketContextValue = {
  connected: boolean;
  joinRoom: (conversationId: number) => void;
  leaveRoom: (conversationId: number) => void;
  viewConversation: (conversationId: number) => void;
  unviewConversation: (conversationId: number) => void;
  sendTypingStart: (conversationId: number, displayName: string) => void;
  sendTypingStop: (conversationId: number) => void;
  subscribe: (handler: WsEventHandler) => void;
  setActiveConversationId: (id: number | null) => void;
  getTypingUsers: (conversationId: number) => TypingUser[];
  unreadNotificationCount: number;
  refreshUnreadCount: () => void;
  /** Bumps when any conversation typing state changes (for list re-renders). */
  typingVersion: number;
};

const ChatWebSocketContext = createContext<ChatWebSocketContextValue | null>(null);

const TYPING_TTL_MS = 4000;

function patchPresenceInCache(
  queryClient: ReturnType<typeof useQueryClient>,
  payload: PresenceUpdatePayload,
) {
  const { userId, presence, lastSeenAt } = payload;
  const presenceTyped = presence as UserPresence;

  const patchUser = <T extends { otherUser?: { id: number } | null }>(item: T): T => {
    if (!item.otherUser || item.otherUser.id !== userId) return item;
    return {
      ...item,
      otherUser: { ...item.otherUser, presence: presenceTyped, lastSeenAt },
    };
  };

  queryClient.setQueriesData<Conversation[]>(
    { queryKey: getListConversationsQueryKey() },
    (old) => (old ? old.map(patchUser) : old),
  );

  queryClient.setQueriesData<Conversation>(
    {
      predicate: (query) => {
        const key = query.queryKey[0];
        return typeof key === "string" && /^\/api\/conversations\/\d+$/.test(key);
      },
    },
    (old) => (old ? patchUser(old) : old),
  );
}

function handleRealtimeMessageEvent(
  queryClient: ReturnType<typeof useQueryClient>,
  event: WsEvent,
  options: { currentUserId?: number; activeConversationId?: number | null },
) {
  if (event.type === "message:new" || event.type === "message:edit") {
    const msg = parseWsMessage(event.payload);
    if (!msg) return;
    upsertMessageInCache(queryClient, msg);
    if (event.type === "message:new") {
      patchConversationFromMessage(queryClient, msg, options);
    }
    return;
  }

  if (event.type === "message:delete") {
    const { messageId, conversationId } = event.payload;
    markMessageDeletedInCache(queryClient, conversationId, messageId);
  }
}

export function ChatWebSocketProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient();
  const { user } = useAuth();
  const { showNotification, requestPermission } = useBrowserNotify();

  const handlersRef = useRef(new Set<WsEventHandler>());
  const userIdRef = useRef(user?.id);
  const activeConvRef = useRef<number | null>(null);
  const typingMapRef = useRef<Map<number, Map<number, TypingUser>>>(new Map());
  const typingTimersRef = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const joinedRoomsRef = useRef<Set<number>>(new Set());
  const [typingVersion, setTypingVersion] = useState(0);
  const [unreadNotificationCount, setUnreadNotificationCount] = useState(0);

  const { data: conversations } = useListConversations(undefined, {
    query: {
      ...getListConversationsQueryOptions(),
      enabled: !!user?.id,
      refetchInterval: 45_000,
      refetchOnWindowFocus: true,
    },
  });

  useListNotifications(undefined, {
    query: {
      ...getListNotificationsQueryOptions(),
      enabled: !!user?.id,
      refetchInterval: 60_000,
      refetchOnWindowFocus: true,
    },
  });

  userIdRef.current = user?.id;

  const bumpTyping = useCallback(() => setTypingVersion((v) => v + 1), []);

  const refreshUnreadCount = useCallback(async () => {
    try {
      const { fetchUnreadNotificationCount } = await import("@/lib/notifications-api");
      const count = await fetchUnreadNotificationCount();
      setUnreadNotificationCount(count);
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    void refreshUnreadCount();
    void requestPermission();
  }, [refreshUnreadCount, requestPermission]);

  const syncBackgroundData = useCallback(() => {
    void refreshUnreadCount();
    void queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
    void queryClient.invalidateQueries({ queryKey: getListNotificationsQueryKey() });
  }, [queryClient, refreshUnreadCount]);

  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") syncBackgroundData();
    };
    window.addEventListener("focus", syncBackgroundData);
    document.addEventListener("visibilitychange", onVisible);
    return () => {
      window.removeEventListener("focus", syncBackgroundData);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [syncBackgroundData]);

  const setTyping = useCallback(
    (conversationId: number, typer: TypingUser, active: boolean) => {
      const key = `${conversationId}:${typer.userId}`;
      const existing = typingTimersRef.current.get(key);
      if (existing) clearTimeout(existing);

      if (!typingMapRef.current.has(conversationId)) {
        typingMapRef.current.set(conversationId, new Map());
      }
      const convMap = typingMapRef.current.get(conversationId)!;

      if (active) {
        convMap.set(typer.userId, typer);
        typingTimersRef.current.set(
          key,
          setTimeout(() => {
            convMap.delete(typer.userId);
            typingTimersRef.current.delete(key);
            bumpTyping();
          }, TYPING_TTL_MS),
        );
      } else {
        convMap.delete(typer.userId);
        typingTimersRef.current.delete(key);
      }
      bumpTyping();
    },
    [bumpTyping],
  );

  const subscribe = useCallback((handler: WsEventHandler) => {
    handlersRef.current.add(handler);
    return () => {
      handlersRef.current.delete(handler);
    };
  }, []);

  const setActiveConversationId = useCallback((id: number | null) => {
    activeConvRef.current = id;
  }, []);

  const getTypingUsers = useCallback(
    (conversationId: number): TypingUser[] => {
      void typingVersion;
      const map = typingMapRef.current.get(conversationId);
      if (!map) return [];
      return Array.from(map.values());
    },
    [typingVersion],
  );

  const onEvent = useCallback(
    (event: WsEvent) => {
      if (event.type === "presence:update") {
        patchPresenceInCache(queryClient, event.payload);
      }

      if (event.type === "typing:start") {
        const { conversationId, userId, displayName } = event.payload;
        if (userId === userIdRef.current) return;
        setTyping(conversationId, { userId, displayName }, true);
      }

      if (event.type === "typing:stop") {
        const { conversationId, userId } = event.payload;
        setTyping(conversationId, { userId, displayName: "" }, false);
      }

      handleRealtimeMessageEvent(queryClient, event, {
        currentUserId: userIdRef.current,
        activeConversationId: activeConvRef.current,
      });

      if (event.type === "message:new") {
        const msg = parseWsMessage(event.payload);
        if (msg?.conversationId && msg.senderId) {
          setTyping(msg.conversationId, { userId: msg.senderId, displayName: "" }, false);
        }
        if (msg?.conversationId && activeConvRef.current !== msg.conversationId) {
          void queryClient.prefetchQuery({
            queryKey: getListMessagesQueryKey(msg.conversationId),
            queryFn: () => listMessages(msg.conversationId),
          });
        }
      }

      if (event.type === "notification:new") {
        const n = parseWsNotification(event.payload);
        if (n) {
        queryClient.setQueryData<Notification[]>(getListNotificationsQueryKey(), (old) => {
          if (!old) return [n];
          if (old.some((x) => x.id === n.id)) return old;
          return [n, ...old];
        });
        if (
          n.type === "message" &&
          n.referenceType === "conversation" &&
          n.referenceId != null &&
          n.body
        ) {
          patchConversationFromNotification(
            queryClient,
            n.referenceId,
            n.body,
            n.actorUser?.displayName,
          );
        }
        void refreshUnreadCount();

        const convId =
          n.referenceType === "conversation" && n.referenceId != null
            ? n.referenceId
            : null;

        const isViewingThisChat =
          convId != null && activeConvRef.current === convId;

        showNotification(n.title ?? "Nexus", {
          body: n.body ?? "",
          tag: `conv-${convId ?? n.id}`,
          skipWhenVisible: isViewingThisChat,
          onClick: () => {
            if (convId != null) {
              window.location.href = `/?conversation=${convId}`;
            }
          },
        });
        }
      }

      handlersRef.current.forEach((handler) => handler(event));
    },
    [queryClient, setTyping, showNotification, refreshUnreadCount, patchConversationFromNotification],
  );

  const {
    connected,
    joinRoom,
    leaveRoom,
    viewConversation,
    unviewConversation,
    sendTypingStart,
    sendTypingStop,
  } = useWebSocket({
    onEvent,
  });

  // Stay joined to every conversation so messages/typing work without an open chat pane.
  useEffect(() => {
    if (!connected || !conversations?.length) return;
    for (const conv of conversations) {
      if (joinedRoomsRef.current.has(conv.id)) continue;
      joinRoom(conv.id);
      joinedRoomsRef.current.add(conv.id);
    }
  }, [connected, conversations, joinRoom]);

  const value = useMemo(
    () => ({
      connected,
      joinRoom,
      leaveRoom,
      viewConversation,
      unviewConversation,
      sendTypingStart,
      sendTypingStop,
      subscribe,
      setActiveConversationId,
      getTypingUsers,
      unreadNotificationCount,
      refreshUnreadCount,
      typingVersion,
    }),
    [
      connected,
      joinRoom,
      leaveRoom,
      viewConversation,
      unviewConversation,
      sendTypingStart,
      sendTypingStop,
      subscribe,
      setActiveConversationId,
      getTypingUsers,
      unreadNotificationCount,
      refreshUnreadCount,
      typingVersion,
    ],
  );

  return (
    <ChatWebSocketContext.Provider value={value}>{children}</ChatWebSocketContext.Provider>
  );
}

export function useChatWebSocket() {
  const ctx = useContext(ChatWebSocketContext);
  if (!ctx) {
    throw new Error("useChatWebSocket must be used within ChatWebSocketProvider");
  }
  return ctx;
}

export function useChatWebSocketEvent(handler: WsEventHandler) {
  const { subscribe } = useChatWebSocket();
  const handlerRef = useRef(handler);
  handlerRef.current = handler;

  useEffect(() => {
    return subscribe((event) => handlerRef.current(event));
  }, [subscribe]);
}

/** Typing users for one conversation (re-renders on WS typing events). */
export function useConversationTyping(conversationId: number | null): TypingUser[] {
  const { getTypingUsers } = useChatWebSocket();
  const [users, setUsers] = useState<TypingUser[]>([]);

  useEffect(() => {
    if (!conversationId) {
      setUsers([]);
      return;
    }
    const tick = () => setUsers(getTypingUsers(conversationId));
    tick();
    const id = setInterval(tick, 400);
    return () => clearInterval(id);
  }, [conversationId, getTypingUsers]);

  return users;
}
