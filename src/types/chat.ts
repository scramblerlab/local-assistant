export type SegmentKind = "thinking" | "final" | "quoted";

export interface MessageSegment {
  id: string;
  kind: SegmentKind;
  content: string;
}

export interface Turn {
  id: string;
  userMessage: string;
  segments: MessageSegment[];
  isStreaming: boolean;
  timestamp: number;
  model: string;
  /** Marks a synthetic divider inserted after a compact operation */
  isCompact?: boolean;
}
