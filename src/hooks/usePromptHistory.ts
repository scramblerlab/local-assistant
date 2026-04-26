import { useRef, useCallback } from "react";

const MAX_HISTORY = 100;

export function usePromptHistory() {
  const history = useRef<string[]>([]);
  const cursor = useRef<number>(-1);

  const push = useCallback((prompt: string) => {
    if (!prompt.trim()) return;
    // Avoid duplicate consecutive entries
    if (history.current[history.current.length - 1] === prompt) return;
    history.current.push(prompt);
    if (history.current.length > MAX_HISTORY) {
      history.current.shift();
    }
    cursor.current = -1;
  }, []);

  const up = useCallback((currentValue: string): string => {
    const h = history.current;
    if (h.length === 0) return currentValue;
    if (cursor.current === -1) {
      cursor.current = h.length - 1;
    } else if (cursor.current > 0) {
      cursor.current--;
    }
    return h[cursor.current] ?? currentValue;
  }, []);

  const down = useCallback((): string => {
    const h = history.current;
    if (cursor.current === -1) return "";
    cursor.current++;
    if (cursor.current >= h.length) {
      cursor.current = -1;
      return "";
    }
    return h[cursor.current];
  }, []);

  const reset = useCallback(() => {
    cursor.current = -1;
  }, []);

  return { push, up, down, reset };
}
