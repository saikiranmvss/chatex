import { useState } from "react";
import { ChatSidebar } from "@/components/chat/ChatSidebar";
import { ChatPane } from "@/components/chat/ChatPane";

export default function ChatPage() {
  const [selectedConversationId, setSelectedConversationId] = useState<number | null>(null);

  const handleSelectConversation = (id: number) => {
    setSelectedConversationId(id);
  };

  const handleBack = () => {
    setSelectedConversationId(null);
  };

  return (
    <div className="flex h-full w-full overflow-hidden">
      {/* On mobile: show sidebar OR pane, not both */}
      {/* On desktop: show both */}
      <div className={`
        h-full
        ${selectedConversationId !== null ? "hidden md:flex" : "flex"}
        w-full md:w-80 shrink-0
      `}>
        <ChatSidebar
          selectedId={selectedConversationId}
          onSelectConversation={handleSelectConversation}
        />
      </div>

      <div className={`
        flex-1 min-w-0 h-full
        ${selectedConversationId !== null ? "flex" : "hidden md:flex"}
      `}>
        <ChatPane
          conversationId={selectedConversationId}
          onBack={handleBack}
        />
      </div>
    </div>
  );
}
