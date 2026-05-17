import { useState, useEffect } from "react";
import { useSearch } from "wouter";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatPane } from "@/components/chat/ChatPane";
import { useChatWebSocket } from "@/contexts/chat-websocket";

export default function ChatPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);
  const { setActiveConversationId } = useChatWebSocket();
  const search = useSearch();

  useEffect(() => {
    const params = new URLSearchParams(search);
    const id = params.get("conversation");
    if (id) {
      const parsed = parseInt(id, 10);
      if (!Number.isNaN(parsed)) setSelectedConversationId(parsed);
    }
  }, [search]);

  useEffect(() => {
    setActiveConversationId(selectedConversationId);
  }, [selectedConversationId, setActiveConversationId]);

  const handleSelectConversation = (id: number) => {
    setSelectedConversationId(id);
    const url = new URL(window.location.href);
    url.searchParams.set("conversation", String(id));
    window.history.replaceState({}, "", url.pathname + url.search);
  };

  const handleBack = () => {
    setSelectedConversationId(null);
    const url = new URL(window.location.href);
    url.searchParams.delete("conversation");
    window.history.replaceState({}, "", url.pathname + url.search);
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      <div
        className={`
        h-full
        ${selectedConversationId !== null ? "hidden md:flex" : "flex"}
        w-full md:w-80 shrink-0
      `}
      >
        <ChatSidebar
          selectedId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
        />
      </div>

      <div
        className={`
        flex-1 min-w-0 h-full
        ${selectedConversationId !== null ? "flex" : "hidden md:flex"}
      `}
      >
        <ChatPane conversationId={selectedConversationId} onBack={handleBack} />
      </div>
    </div>
  );
}
