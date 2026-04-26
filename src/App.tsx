import { useEffect } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { AppShell } from "./components/layout/AppShell";
import { useOllamaHealth } from "./hooks/useOllamaHealth";
import { useChatStore } from "./stores/chatStore";
import { loadHistory } from "./services/history";

const queryClient = new QueryClient({
  defaultOptions: { queries: { retry: false, staleTime: 5_000 } },
});

function AppInner() {
  const { status, retry, startOllama } = useOllamaHealth();
  const setHistory = useChatStore((s) => s.setHistory);

  useEffect(() => {
    loadHistory().then(({ turns, compactSummary }) => {
      if (turns.length > 0 || compactSummary) {
        setHistory(turns, compactSummary);
      }
    });
  }, [setHistory]);

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
