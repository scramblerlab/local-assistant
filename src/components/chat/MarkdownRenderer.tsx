import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

interface Props {
  content: string;
  className?: string;
}

export function MarkdownRenderer({ content, className }: Props) {
  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      className={className}
      components={{
        pre: ({ children }) => (
          <pre style={{
            background: "var(--color-surface-2)",
            border: "1.5px solid var(--color-border)",
            borderRadius: "var(--radius-sm)",
            padding: "12px 14px",
            overflowX: "auto",
            fontSize: 12,
            fontFamily: "var(--font-mono)",
            margin: "8px 0",
            lineHeight: 1.6,
          }}>{children}</pre>
        ),
        code: ({ children, className: cls }) => {
          const isBlock = cls?.includes("language-");
          if (isBlock) return <code className={cls}>{children}</code>;
          return (
            <code style={{
              background: "var(--color-surface-2)",
              border: "1px solid var(--color-border)",
              borderRadius: 4,
              padding: "1px 5px",
              fontSize: 12,
              fontFamily: "var(--font-mono)",
            }}>{children}</code>
          );
        },
        a: ({ href, children }) => (
          <a href={href} style={{ color: "var(--color-accent)", textDecoration: "underline" }} target="_blank" rel="noreferrer">
            {children}
          </a>
        ),
        p: ({ children }) => <p style={{ margin: "0 0 8px", lineHeight: 1.65 }}>{children}</p>,
        ul: ({ children }) => <ul style={{ paddingLeft: 18, margin: "0 0 8px" }}>{children}</ul>,
        ol: ({ children }) => <ol style={{ paddingLeft: 18, margin: "0 0 8px" }}>{children}</ol>,
        li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
        h1: ({ children }) => <h1 style={{ fontFamily: "var(--font-display)", fontSize: 24, letterSpacing: "1px", margin: "12px 0 6px", color: "var(--color-text-primary)" }}>{children}</h1>,
        h2: ({ children }) => <h2 style={{ fontFamily: "var(--font-display)", fontSize: 20, letterSpacing: "1px", margin: "10px 0 4px", color: "var(--color-text-primary)" }}>{children}</h2>,
        h3: ({ children }) => <h3 style={{ fontSize: 15, fontWeight: 600, margin: "8px 0 4px", color: "var(--color-text-primary)" }}>{children}</h3>,
        blockquote: ({ children }) => (
          <blockquote style={{
            borderLeft: "2px solid var(--color-border-2)",
            paddingLeft: 12,
            color: "var(--color-text-dim)",
            margin: "6px 0",
          }}>{children}</blockquote>
        ),
      }}
    >
      {content}
    </ReactMarkdown>
  );
}
