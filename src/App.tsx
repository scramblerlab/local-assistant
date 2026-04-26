import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./components/layout/AppShell";
import { useOllamaHealth } from "./hooks/useOllamaHealth";
import { useChatStore } from "./stores/chatStore";
import { initSessions } from "./services/sessions";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 5_000 } },
});

function AppInner() {
  const { status, retry, startOllama } = useOllamaHealth();
  const setCurrentSession = useChatStore((s) => s.setCurrentSession);

  useEffect(() => {
    initSessions().then((session) => {
      setCurrentSession(session.id, session.createdAt, session.turns, session.compactSummary);
    });
  }, [setCurrentSession]);

  return <AppShell ollamaStatus={status} onRetry={retry} onStart={startOllama} />;
}

function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <AppInner />
    </QueryClientProvider>
  );
}

export default App;
