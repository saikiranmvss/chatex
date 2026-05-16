import { useState, useEffect, useRef, useCallback } from "react";
import {
  useListMessages,
  useSendMessage,
  useGetConversation,
  getListMessagesQueryKey,
  getGetConversationQueryKey
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Send, Paperclip, Image as ImageIcon, ArrowLeft, Users, MoreVertical } from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import { useWebSocket, type WsEvent } from "@/hooks/use-websocket";

interface ChatPaneProps {
  conversationId: number | null;
  onBack?: () => void;
}

interface TypingUser {
  userId: number;
  displayName: string;
}

export function ChatPane({ conversationId, onBack }: ChatPaneProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [content, setContent] = useState("");
  const [typingUsers, setTypingUsers] = useState<TypingUser[]>([]);
  const typingTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(new Map());
  const isTypingRef = useRef(false);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: conversation } = useGetConversation(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getGetConversationQueryKey(conversationId!) }
  });

  const { data: messages, isLoading } = useListMessages(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getListMessagesQueryKey(conversationId!) }
  });

  const sendMessage = useSendMessage();

  const handleWsEvent = useCallback((event: WsEvent) => {
    if (!conversationId) return;

    if (event.type === "message:new") {
      const msg = event.payload as { conversationId: number };
      if (msg.conversationId === conversationId) {
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId) });
      }
    }

    if (event.type === "message:edit") {
      const msg = event.payload as { conversationId: number };
      if (msg.conversationId === conversationId) {
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId) });
      }
    }

    if (event.type === "message:delete") {
      if (event.payload.conversationId === conversationId) {
        queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId) });
      }
    }

    if (event.type === "typing:start" && event.payload.conversationId === conversationId) {
      const { userId, displayName } = event.payload;
      if (userId === user?.id) return;

      setTypingUsers(prev => {
        if (prev.some(u => u.userId === userId)) return prev;
        return [...prev, { userId, displayName }];
      });

      // Clear existing timer for this user
      const existing = typingTimers.current.get(userId);
      if (existing) clearTimeout(existing);

      // Auto-remove typing indicator after 3s of no updates
      const timer = setTimeout(() => {
        setTypingUsers(prev => prev.filter(u => u.userId !== userId));
        typingTimers.current.delete(userId);
      }, 3000);
      typingTimers.current.set(userId, timer);
    }

    if (event.type === "typing:stop" && event.payload.conversationId === conversationId) {
      const { userId } = event.payload;
      const existing = typingTimers.current.get(userId);
      if (existing) clearTimeout(existing);
      typingTimers.current.delete(userId);
      setTypingUsers(prev => prev.filter(u => u.userId !== userId));
    }
  }, [conversationId, queryClient, user?.id]);

  const { connected, joinRoom, leaveRoom, sendTypingStart, sendTypingStop } = useWebSocket({
    onEvent: handleWsEvent
  });

  // Join/leave WS room when conversation changes
  useEffect(() => {
    if (!conversationId) return;
    joinRoom(conversationId);
    setTypingUsers([]);
    return () => {
      leaveRoom(conversationId);
    };
  }, [conversationId, joinRoom, leaveRoom]);

  // Scroll to bottom on new messages
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages]);

  const handleContentChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setContent(e.target.value);

    if (!conversationId || !user) return;

    if (!isTypingRef.current) {
      isTypingRef.current = true;
      sendTypingStart(conversationId, user.displayName || user.username);
    }

    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    typingStopTimer.current = setTimeout(() => {
      isTypingRef.current = false;
      sendTypingStop(conversationId);
    }, 2000);
  };

  const handleSend = (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !conversationId) return;

    // Stop typing indicator
    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTypingStop(conversationId);
    }

    const text = content.trim();
    setContent("");

    sendMessage.mutate(
      { data: { content: text, type: "text" }, conversationId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListMessagesQueryKey(conversationId) });
        }
      }
    );
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as React.FormEvent);
    }
  };

  if (!conversationId) {
    return (
      <div className="flex-1 flex-col items-center justify-center bg-background text-muted-foreground hidden md:flex">
        <div className="w-20 h-20 bg-muted rounded-2xl flex items-center justify-center mb-5">
          <Users className="w-10 h-10 opacity-40" />
        </div>
        <p className="text-base font-medium">Select a conversation</p>
        <p className="text-sm mt-1 opacity-60">Choose from your conversations on the left</p>
      </div>
    );
  }

  const convName = conversation?.name || conversation?.otherUser?.displayName || "Loading...";
  const convAvatar = conversation?.avatarUrl || conversation?.otherUser?.avatarUrl;
  const convInitial = (conversation?.name || conversation?.otherUser?.displayName || "C").charAt(0);
  const isOnline = conversation?.otherUser?.presence === "online";

  return (
    <div className="flex-1 flex flex-col bg-background h-full overflow-hidden min-w-0">
      {/* Header */}
      <div className="h-14 md:h-16 border-b border-border flex items-center justify-between px-3 md:px-6 bg-card shrink-0 shadow-sm z-10 gap-2">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          {/* Back button — mobile only */}
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden shrink-0 h-8 w-8"
              onClick={onBack}
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <Avatar className="h-9 w-9 md:h-10 md:w-10 shrink-0">
            <AvatarImage src={convAvatar || undefined} />
            <AvatarFallback>{convInitial}</AvatarFallback>
          </Avatar>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground text-sm md:text-base truncate">{convName}</h2>
            <div className="flex items-center gap-1.5">
              {connected ? (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-green-500 animate-pulse" />
                  <p className="text-[10px] md:text-xs text-muted-foreground">Live</p>
                </>
              ) : (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-yellow-500" />
                  <p className="text-[10px] md:text-xs text-muted-foreground">Connecting...</p>
                </>
              )}
              {conversation?.type === "direct" && isOnline && (
                <span className="text-[10px] md:text-xs text-green-500 ml-1">· Online</span>
              )}
            </div>
          </div>
        </div>
        <Button variant="ghost" size="icon" className="shrink-0 h-8 w-8 md:h-9 md:w-9">
          <MoreVertical className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
        </Button>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-3 md:space-y-4">
        {isLoading ? (
          <div className="flex flex-col gap-3 pt-4">
            {[1, 2, 3, 4].map(i => (
              <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                <div className={`h-10 rounded-2xl bg-muted animate-pulse ${i % 2 === 0 ? "w-48" : "w-64"}`} />
              </div>
            ))}
          </div>
        ) : messages?.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm mt-16">
            <p className="text-2xl mb-2">👋</p>
            <p className="font-medium">Start the conversation</p>
            <p className="text-xs mt-1 opacity-60">Be the first to say something</p>
          </div>
        ) : (
          messages?.map((msg, idx) => {
            const isMe = msg.senderId === user?.id;
            const prevMsg = idx > 0 ? messages[idx - 1] : null;
            const showAvatar = !isMe && prevMsg?.senderId !== msg.senderId;
            const isGrouped = prevMsg?.senderId === msg.senderId && idx > 0;

            return (
              <div key={msg.id} className={`flex ${isMe ? "justify-end" : "justify-start"} ${isGrouped ? "mt-0.5" : "mt-3"}`}>
                <div className={`flex gap-2 md:gap-3 max-w-[85%] md:max-w-[72%] ${isMe ? "flex-row-reverse" : "flex-row"}`}>
                  {/* Avatar placeholder for alignment */}
                  <div className="w-7 md:w-8 shrink-0">
                    {!isMe && showAvatar && (
                      <Avatar className="h-7 w-7 md:h-8 md:w-8">
                        <AvatarImage src={msg.sender?.avatarUrl || undefined} />
                        <AvatarFallback className="text-xs">{msg.sender?.displayName?.charAt(0) || "U"}</AvatarFallback>
                      </Avatar>
                    )}
                  </div>
                  <div className={`flex flex-col ${isMe ? "items-end" : "items-start"}`}>
                    {!isMe && showAvatar && (
                      <span className="text-[11px] text-muted-foreground mb-1 mx-1 font-medium">
                        {msg.sender?.displayName}
                      </span>
                    )}
                    <div className={`px-3 md:px-4 py-2 md:py-2.5 rounded-2xl shadow-sm max-w-full ${
                      isMe
                        ? "bg-primary text-primary-foreground rounded-tr-sm"
                        : "bg-muted text-foreground rounded-tl-sm"
                    } ${isGrouped ? (isMe ? "rounded-tr-2xl" : "rounded-tl-2xl") : ""}`}>
                      <p className="text-sm leading-relaxed whitespace-pre-wrap break-words">{msg.content}</p>
                    </div>
                    {/* Reactions */}
                    {Array.isArray(msg.reactions) && msg.reactions.length > 0 && (
                      <div className="flex gap-1 mt-1 flex-wrap">
                        {(msg.reactions as { emoji: string; count: number }[]).map(r => (
                          <span key={r.emoji} className="text-xs bg-muted/70 border border-border px-1.5 py-0.5 rounded-full">
                            {r.emoji} {r.count}
                          </span>
                        ))}
                      </div>
                    )}
                    <div className={`flex items-center gap-1 mt-0.5 mx-1 ${isMe ? "flex-row-reverse" : ""}`}>
                      <span className="text-[10px] text-muted-foreground">
                        {new Date(msg.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })}
                      </span>
                      {msg.isEdited && <span className="text-[10px] text-muted-foreground">(edited)</span>}
                    </div>
                  </div>
                </div>
              </div>
            );
          })
        )}

        {/* Typing indicator */}
        {typingUsers.length > 0 && (
          <div className="flex items-center gap-2 pl-10">
            <div className="bg-muted rounded-2xl rounded-tl-sm px-4 py-2.5 flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:0ms]" />
              <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:150ms]" />
              <span className="w-1.5 h-1.5 bg-muted-foreground/60 rounded-full animate-bounce [animation-delay:300ms]" />
            </div>
            <span className="text-[11px] text-muted-foreground">
              {typingUsers.length === 1
                ? `${typingUsers[0].displayName} is typing`
                : `${typingUsers.length} people are typing`}
            </span>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="px-3 md:px-4 py-3 bg-background border-t border-border shrink-0 safe-area-inset-bottom">
        <form onSubmit={handleSend} className="flex items-center gap-2 bg-muted/50 pr-1 pl-2 rounded-2xl border border-border">
          <div className="flex gap-0.5 shrink-0">
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground">
              <Paperclip className="w-4 h-4" />
            </Button>
            <Button type="button" variant="ghost" size="icon" className="h-8 w-8 rounded-full text-muted-foreground hover:text-foreground hidden sm:flex">
              <ImageIcon className="w-4 h-4" />
            </Button>
          </div>
          <Input
            ref={inputRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            placeholder="Type a message..."
            className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 px-1 text-sm min-h-10"
            data-testid="input-message"
          />
          <Button
            type="submit"
            size="icon"
            disabled={!content.trim() || sendMessage.isPending}
            className="h-9 w-9 shrink-0 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm"
            data-testid="button-send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
