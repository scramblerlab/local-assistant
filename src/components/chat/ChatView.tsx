import { useChatStore } from "../../stores/chatStore";
import { useChat } from "../../hooks/useChat";
import { MessageList } from "./MessageList";
import { InputBar } from "./InputBar";

interface Props {
  model: string;
  ollamaReady: boolean;
}

export function ChatView({ model, ollamaReady }: Props) {
  const { turns, abortController } = useChatStore();
  const { sendMessage, stopStream, isCompacting } = useChat(model);
  const isStreaming = !!abortController;

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%", background: "var(--color-bg)" }}>
      <MessageList turns={turns} />
      <InputBar
        onSend={sendMessage}
        onStop={stopStream}
        isStreaming={isStreaming}
        isCompacting={isCompacting}
        disabled={!ollamaReady || !model}
      />
    </div>
  );
}
