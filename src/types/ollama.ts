export interface OllamaModel {
  name: string;
  model: string;
  modified_at: string;
  size: number;
  digest: string;
  details: {
    parent_model: string;
    format: string;
    family: string;
    families: string[];
    parameter_size: string;
    quantization_level: string;
  };
}

export interface OllamaTagsResponse {
  models: OllamaModel[];
}

export interface ChatMessage {
  role: "system" | "user" | "assistant";
  content: string;
  thinking?: string;
  images?: string[]; // base64-encoded, vision models only
}

export interface OllamaStreamChunk {
  model: string;
  created_at: string;
  message: {
    role: string;
    content: string;
    thinking?: string;
  };
  done: boolean;
  done_reason?: string;
  total_duration?: number;
  eval_count?: number;
}

export interface OllamaPullChunk {
  status: string;
  error?: string;
  digest?: string;
  total?: number;
  completed?: number;
}

export interface OllamaVersionResponse {
  version: string;
}
