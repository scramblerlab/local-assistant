import { invoke } from "@tauri-apps/api/core";

export interface McpTool {
  name: string;
  description?: string;
  inputSchema?: {
    type: string;
    properties?: Record<string, { type: string; description?: string }>;
    required?: string[];
  };
}

export interface McpServerSummary {
  id: string;
  tools: McpTool[];
}

export async function startMcpServers(): Promise<McpServerSummary[]> {
  return invoke<McpServerSummary[]>("mcp_start_all");
}

export async function reloadMcpServers(): Promise<McpServerSummary[]> {
  return invoke<McpServerSummary[]>("mcp_reload_all");
}

export async function callMcpTool(
  serverId: string,
  toolName: string,
  args: Record<string, unknown>
): Promise<string> {
  return invoke<string>("mcp_call_tool", { serverId, toolName, args });
}
