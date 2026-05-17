import { useState, useEffect, useRef, useCallback } from "react";
import {
  useListMessages,
  useSendMessage,
  useGetConversation,
  useMarkConversationRead,
  useUpdateConversation,
  useReactToMessage,
  useStarMessage,
  useEditMessage,
  useDeleteMessage,
  getListMessagesQueryKey,
  getGetConversationQueryKey,
  getListConversationsQueryKey,
  type Message,
} from "@workspace/api-client-react";
import { useQueryClient } from "@tanstack/react-query";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import {
  Send,
  Paperclip,
  Image as ImageIcon,
  ArrowLeft,
  Users,
  MoreVertical,
  BellOff,
  Bell,
  Pin,
  Archive,
  Star,
  Loader2,
  X,
  Smile,
} from "lucide-react";
import { useAuth } from "@/hooks/use-auth";
import {
  useChatWebSocket,
  useConversationTyping,
} from "@/contexts/chat-websocket";
import { TypingIndicator } from "./TypingIndicator";
import { MessageBubble } from "./MessageBubble";
import { PresenceIndicator } from "./PresenceIndicator";
import { uploadChatFile, getMessageTypeFromMime } from "@/lib/upload-file";
import { useToast } from "@/hooks/use-toast";
import { usePresenceLabel } from "@/hooks/use-presence-label";
import { isUserOnline } from "@/lib/presence-status";
import {
  upsertMessageInCache,
  patchConversationFromMessage,
  markMessageDeletedInCache,
} from "@/lib/chat-realtime";
import { cn } from "@/lib/utils";

interface ChatPaneProps {
  conversationId: number | null;
  onBack?: () => void;
}

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🎉"];
const ACCEPT_IMAGES = "image/jpeg,image/png,image/gif,image/webp,image/svg+xml";
const ACCEPT_FILES =
  "image/*,video/*,audio/*,.pdf,.doc,.docx,.xls,.xlsx,.txt,.zip,.rar";

export function ChatPane({ conversationId, onBack }: ChatPaneProps) {
  const { user } = useAuth();
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [content, setContent] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [showEmojiBar, setShowEmojiBar] = useState(false);
  const [replyingTo, setReplyingTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const isTypingRef = useRef(false);
  const typingStopTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { data: conversation } = useGetConversation(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getGetConversationQueryKey(conversationId!) },
  });

  const { data: messages, isLoading } = useListMessages(conversationId!, {
    query: { enabled: !!conversationId, queryKey: getListMessagesQueryKey(conversationId!) },
  });

  const sendMessage = useSendMessage();
  const { mutate: markConversationRead } = useMarkConversationRead();
  const updateConversation = useUpdateConversation();
  const reactToMessage = useReactToMessage();
  const starMessage = useStarMessage();
  const editMessage = useEditMessage();
  const deleteMessage = useDeleteMessage();

  const applySentMessage = useCallback(
    (msg: Message) => {
      upsertMessageInCache(queryClient, msg);
      patchConversationFromMessage(queryClient, msg, {
        currentUserId: user?.id,
        activeConversationId: conversationId,
      });
    },
    [queryClient, user?.id, conversationId],
  );

  const typingUsers = useConversationTyping(conversationId);
  const { connected, viewConversation, unviewConversation, sendTypingStart, sendTypingStop } =
    useChatWebSocket();

  useEffect(() => {
    setReplyingTo(null);
    setEditingMessage(null);
    setContent("");
  }, [conversationId]);

  // Tell server this conversation is actively open (separate from background WS listen).
  useEffect(() => {
    if (!conversationId) return;
    viewConversation(conversationId);
    return () => unviewConversation(conversationId);
  }, [conversationId, viewConversation, unviewConversation]);

  // Mark as read once per conversation — do not depend on the whole mutation object.
  const markedReadIdRef = useRef<number | null>(null);
  useEffect(() => {
    if (!conversationId) {
      markedReadIdRef.current = null;
      return;
    }
    if (markedReadIdRef.current === conversationId) return;
    markedReadIdRef.current = conversationId;

    markConversationRead(
      { conversationId },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
        },
      },
    );
  }, [conversationId, markConversationRead, queryClient]);

  const messagesLength = messages?.length ?? 0;
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messagesLength, conversationId, typingUsers.length]);

  const sendTextMessage = useCallback(
    (text: string) => {
      if (!conversationId || !text.trim()) return;

      if (editingMessage) {
        editMessage.mutate(
          { messageId: editingMessage.id, data: { content: text.trim() } },
          {
            onSuccess: (msg) => {
              upsertMessageInCache(queryClient, msg);
              setEditingMessage(null);
              setContent("");
            },
          },
        );
        return;
      }

      sendMessage.mutate(
        {
          conversationId,
          data: {
            content: text.trim(),
            type: "text",
            replyToId: replyingTo?.id ?? undefined,
          },
        },
        {
          onSuccess: (msg) => {
            applySentMessage(msg);
            setReplyingTo(null);
          },
        },
      );
    },
    [
      conversationId,
      sendMessage,
      applySentMessage,
      editingMessage,
      editMessage,
      queryClient,
      replyingTo,
    ],
  );

  const sendMediaMessage = useCallback(
    async (file: File, optionalCaption?: string) => {
      if (!conversationId) return;
      setIsUploading(true);
      try {
        const uploaded = await uploadChatFile(file);
        const type = getMessageTypeFromMime(uploaded.mediaType);
        const caption = optionalCaption?.trim() || uploaded.mediaName;

        const msg = await sendMessage.mutateAsync({
          conversationId,
          data: {
            content: caption,
            type,
            mediaUrl: uploaded.url,
            mediaType: uploaded.mediaType,
            mediaSize: uploaded.mediaSize,
            mediaName: uploaded.mediaName,
            replyToId: replyingTo?.id ?? undefined,
          },
        });
        applySentMessage(msg);
        setReplyingTo(null);
      } catch (err) {
        toast({
          title: "Upload failed",
          description: err instanceof Error ? err.message : "Could not send file",
          variant: "destructive",
        });
      } finally {
        setIsUploading(false);
      }
    },
    [conversationId, sendMessage, applySentMessage, toast],
  );

  const handleFilePick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    await sendMediaMessage(file, content.trim() || undefined);
    setContent("");
  };

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
    if (!content.trim() || !conversationId || isUploading) return;

    if (typingStopTimer.current) clearTimeout(typingStopTimer.current);
    if (isTypingRef.current) {
      isTypingRef.current = false;
      sendTypingStop(conversationId);
    }

    const text = content.trim();
    setContent("");
    sendTextMessage(text);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend(e as unknown as React.FormEvent);
    }
  };

  const handleToggleMute = () => {
    if (!conversationId) return;
    updateConversation.mutate(
      {
        conversationId,
        data: { isMuted: !conversation?.isMuted },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetConversationQueryKey(conversationId),
          });
          toast({
            title: conversation?.isMuted ? "Notifications on" : "Notifications muted",
          });
        },
      },
    );
  };

  const handleTogglePin = () => {
    if (!conversationId) return;
    updateConversation.mutate(
      {
        conversationId,
        data: { isPinned: !conversation?.isPinned },
      },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({
            queryKey: getGetConversationQueryKey(conversationId),
          });
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          toast({ title: conversation?.isPinned ? "Unpinned" : "Pinned" });
        },
      },
    );
  };

  const handleArchive = () => {
    if (!conversationId) return;
    updateConversation.mutate(
      { conversationId, data: { isArchived: true } },
      {
        onSuccess: () => {
          queryClient.invalidateQueries({ queryKey: getListConversationsQueryKey() });
          toast({ title: "Conversation archived" });
          onBack?.();
        },
      },
    );
  };

  const handleReact = (messageId: number, emoji: string) => {
    reactToMessage.mutate(
      { messageId, data: { emoji } },
      { onSuccess: (msg) => upsertMessageInCache(queryClient, msg) },
    );
  };

  const handleReply = (msg: Message) => {
    setEditingMessage(null);
    setReplyingTo(msg);
    inputRef.current?.focus();
  };

  const handleCopy = (msg: Message) => {
    const text = msg.isDeleted ? "" : msg.content;
    if (text) {
      void navigator.clipboard.writeText(text);
      toast({ title: "Copied to clipboard" });
    }
  };

  const handleEdit = (msg: Message) => {
    setReplyingTo(null);
    setEditingMessage(msg);
    setContent(msg.content);
    inputRef.current?.focus();
  };

  const handleDelete = (messageId: number) => {
    if (!conversationId) return;
    deleteMessage.mutate(
      { messageId },
      {
        onSuccess: () => {
          markMessageDeletedInCache(queryClient, conversationId, messageId);
        },
      },
    );
  };

  const handleStar = (messageId: number) => {
    starMessage.mutate(
      { messageId },
      {
        onSuccess: () => {
          if (conversationId) {
            queryClient.invalidateQueries({
              queryKey: getListMessagesQueryKey(conversationId),
            });
          }
        },
      },
    );
  };

  const presenceLabel = usePresenceLabel(conversation?.otherUser);

  if (!conversationId) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-background text-muted-foreground p-6 text-center md:border-l md:border-border">
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

  const statusSubtitle = (() => {
    if (conversation?.type === "group") {
      const count = conversation.memberCount;
      return count ? `${count} members` : "Group chat";
    }
    if (conversation?.type === "direct") return presenceLabel;
    return null;
  })();

  return (
    <div className="flex-1 flex flex-col bg-background h-full overflow-hidden min-w-0">
      <input
        ref={imageInputRef}
        type="file"
        accept={ACCEPT_IMAGES}
        className="hidden"
        onChange={handleFilePick}
      />
      <input
        ref={fileInputRef}
        type="file"
        accept={ACCEPT_FILES}
        className="hidden"
        onChange={handleFilePick}
      />

      {/* Header */}
      <div className="h-14 md:h-16 border-b border-border flex items-center justify-between px-3 md:px-6 bg-card/95 backdrop-blur shrink-0 shadow-sm z-10 gap-2 pt-[env(safe-area-inset-top)] min-h-[3.5rem]">
        <div className="flex items-center gap-2 md:gap-3 min-w-0">
          {onBack && (
            <Button
              variant="ghost"
              size="icon"
              className="md:hidden shrink-0 h-8 w-8 cursor-pointer"
              onClick={onBack}
              data-testid="button-back"
            >
              <ArrowLeft className="w-5 h-5" />
            </Button>
          )}
          <div className="relative shrink-0">
            <Avatar className="h-9 w-9 md:h-10 md:w-10">
              <AvatarImage src={convAvatar || undefined} />
              <AvatarFallback>{convInitial}</AvatarFallback>
            </Avatar>
            {conversation?.type === "direct" && (
              <PresenceIndicator presence={conversation.otherUser?.presence} size="md" />
            )}
          </div>
          <div className="min-w-0">
            <h2 className="font-semibold text-foreground text-sm md:text-base truncate">{convName}</h2>
            <div className="flex items-center gap-1.5">
              {!connected && (
                <>
                  <span className="w-1.5 h-1.5 rounded-full bg-amber-400 shrink-0" />
                  <p className="text-[10px] md:text-xs text-muted-foreground truncate">Reconnecting…</p>
                </>
              )}
              {connected && typingUsers.length > 0 && (
                <TypingIndicator
                  users={typingUsers}
                  variant="inline"
                  className="text-muted-foreground"
                />
              )}
              {connected && typingUsers.length === 0 && statusSubtitle && (
                <p
                  className={cn(
                    "text-[10px] md:text-xs truncate ml-0.5",
                    conversation?.type === "direct" &&
                      isUserOnline(conversation.otherUser?.presence) &&
                      "text-green-500",
                    !(conversation?.type === "direct" && isUserOnline(conversation.otherUser?.presence)) &&
                      "text-muted-foreground",
                  )}
                >
                  {statusSubtitle}
                </p>
              )}
            </div>
          </div>
        </div>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 h-8 w-8 md:h-9 md:w-9 cursor-pointer"
            >
              <MoreVertical className="w-4 h-4 md:w-5 md:h-5 text-muted-foreground" />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-48">
            <DropdownMenuItem className="cursor-pointer" onClick={handleTogglePin}>
              <Pin className="w-4 h-4 mr-2" />
              {conversation?.isPinned ? "Unpin chat" : "Pin chat"}
            </DropdownMenuItem>
            <DropdownMenuItem className="cursor-pointer" onClick={handleToggleMute}>
              {conversation?.isMuted ? (
                <>
                  <Bell className="w-4 h-4 mr-2" /> Unmute notifications
                </>
              ) : (
                <>
                  <BellOff className="w-4 h-4 mr-2" /> Mute notifications
                </>
              )}
            </DropdownMenuItem>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              className="cursor-pointer text-destructive focus:text-destructive"
              onClick={handleArchive}
            >
              <Archive className="w-4 h-4 mr-2" />
              Archive chat
            </DropdownMenuItem>
          </DropdownMenuContent>
        </DropdownMenu>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto px-3 md:px-6 py-4 space-y-3 md:space-y-4">
        {isLoading ? (
          <div className="flex flex-col gap-3 pt-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className={`flex ${i % 2 === 0 ? "justify-end" : "justify-start"}`}>
                <div
                  className={`h-10 rounded-2xl bg-muted animate-pulse ${i % 2 === 0 ? "w-48" : "w-64"}`}
                />
              </div>
            ))}
          </div>
        ) : messages?.length === 0 ? (
          <div className="text-center text-muted-foreground text-sm mt-16">
            <p className="text-2xl mb-2">👋</p>
            <p className="font-medium">Start the conversation</p>
            <p className="text-xs mt-1 opacity-60">Send a message, photo, or file</p>
          </div>
        ) : (
          messages?.map((msg, idx) => (
            <MessageBubble
              key={msg.id}
              msg={msg}
              prevMsg={idx > 0 ? messages[idx - 1] : null}
              isMe={msg.senderId === user?.id}
              showSenderName={conversation?.type === "group"}
              onReact={handleReact}
              onStar={handleStar}
              onReply={handleReply}
              onCopy={handleCopy}
              onEdit={handleEdit}
              onDelete={handleDelete}
            />
          ))
        )}

        <TypingIndicator users={typingUsers} variant="bubble" />
        <div ref={messagesEndRef} />
      </div>

      {/* Composer */}
      <div className="px-3 md:px-4 py-2 md:py-3 bg-background/95 backdrop-blur border-t border-border shrink-0 pb-[max(0.75rem,env(safe-area-inset-bottom))]">
        {(replyingTo || editingMessage) && (
          <div className="mb-2 flex items-center gap-2 px-3 py-2 rounded-xl bg-muted/60 border border-border">
            <div className="flex-1 min-w-0 border-l-2 border-primary pl-2">
              <p className="text-xs font-semibold text-primary">
                {editingMessage ? "Editing message" : `Reply to ${replyingTo?.sender?.displayName}`}
              </p>
              <p className="text-xs text-muted-foreground truncate">
                {(editingMessage ?? replyingTo)?.content}
              </p>
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0 cursor-pointer"
              onClick={() => {
                setReplyingTo(null);
                setEditingMessage(null);
                setContent("");
              }}
            >
              <X className="w-4 h-4" />
            </Button>
          </div>
        )}

        {showEmojiBar && (
          <div className="flex gap-1 mb-2 px-1 flex-wrap">
            {QUICK_EMOJIS.map((emoji) => (
              <button
                key={emoji}
                type="button"
                className="text-xl hover:scale-110 transition-transform cursor-pointer p-1 rounded-md hover:bg-muted"
                onClick={() => {
                  setContent((c) => c + emoji);
                  inputRef.current?.focus();
                }}
              >
                {emoji}
              </button>
            ))}
            <button
              type="button"
              className="ml-auto p-1 rounded-md hover:bg-muted cursor-pointer"
              onClick={() => setShowEmojiBar(false)}
            >
              <X className="w-4 h-4 text-muted-foreground" />
            </button>
          </div>
        )}

        <form onSubmit={handleSend} className="flex items-end gap-2 bg-muted/50 p-1.5 rounded-2xl border border-border">
          <div className="flex gap-0.5 shrink-0 pb-0.5">
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={isUploading}
              className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
              title="Attach file"
              onClick={() => fileInputRef.current?.click()}
            >
              {isUploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Paperclip className="w-4 h-4" />
              )}
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              disabled={isUploading}
              className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground cursor-pointer"
              title="Send image"
              onClick={() => imageInputRef.current?.click()}
            >
              <ImageIcon className="w-4 h-4" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-9 w-9 rounded-full text-muted-foreground hover:text-foreground cursor-pointer hidden sm:flex"
              title="Emoji"
              onClick={() => setShowEmojiBar((v) => !v)}
            >
              <Smile className="w-4 h-4" />
            </Button>
          </div>
          <Input
            ref={inputRef}
            value={content}
            onChange={handleContentChange}
            onKeyDown={handleKeyDown}
            placeholder={
              isUploading
                ? "Uploading..."
                : editingMessage
                  ? "Edit your message..."
                  : replyingTo
                    ? "Write a reply..."
                    : "Message..."
            }
            disabled={isUploading}
            className="flex-1 border-0 bg-transparent shadow-none focus-visible:ring-0 px-1 text-base md:text-sm min-h-11 md:min-h-10 cursor-text"
            data-testid="input-message"
          />
          <Button
            type="submit"
            size="icon"
            disabled={
              !content.trim() ||
              sendMessage.isPending ||
              editMessage.isPending ||
              isUploading
            }
            className="h-9 w-9 shrink-0 rounded-full bg-primary hover:bg-primary/90 text-primary-foreground shadow-sm cursor-pointer disabled:cursor-not-allowed"
            data-testid="button-send"
          >
            <Send className="w-4 h-4" />
          </Button>
        </form>
      </div>
    </div>
  );
}
