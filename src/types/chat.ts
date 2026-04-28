export type SegmentKind = "thinking" | "final" | "quoted" | "tool-use";

export interface MessageSegment {
  id: string;
  kind: SegmentKind;
  content: string;
}

export interface Turn {
  id: string;
  userMessage: string;
  images?: string[]; // base64 strings attached to the user message
  segments: MessageSegment[];
  isStreaming: boolean;
  timestamp: number;
  model: string;
  /** Marks a synthetic divider inserted after a compact operation */
  isCompact?: boolean;
}
