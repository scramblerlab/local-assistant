import { useChatStore } from "../../stores/chatStore";
import { useChat } from "../../hooks/useChat";
import { useModelCapabilities } from "../../hooks/useModels";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";
import { ChatHeader } from "./ChatHeader";
import { createSession, loadSession } from "../../services/sessions";

interface Props {
  model: string;
  ollamaReady: boolean;
}

export function ChatView({ model, ollamaReady }: Props) {
  const { turns, abortController, currentSessionId, setCurrentSession } = useChatStore();
  const { sendMessage, stopStream, isCompacting } = useChat(model);
  const { supportsVision } = useModelCapabilities(model);
  const isStreaming = !!abortController;

  const onNewSession = async () => {
    const session = await createSession();
    setCurrentSession(session.id, session.createdAt, session.turns, session.compactSummary);
  };

  const onSwitchSession = async (id: string) => {
    if (id === currentSessionId) return;
    const session = await loadSession(id);
    setCurrentSession(session.id, session.createdAt, session.turns, session.compactSummary);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--color-bg)" }}>
      <ChatHeader
        currentSessionId={currentSessionId}
        onNewSession={onNewSession}
        onSwitchSession={onSwitchSession}
      />
      <MessageList turns={turns} />
      <InputBar
        onSend={sendMessage}
        onStop={stopStream}
        isStreaming={isStreaming}
        isCompacting={isCompacting}
        disabled={!ollamaReady || !model}
        supportsVision={supportsVision}
      />
    </div>
  );
}
