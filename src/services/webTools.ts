import { invoke } from "@tauri-apps/api/core";

export interface SearchResult {
  title: string;
  url: string;
  snippet: string;
}

export async function webSearch(query: string): Promise<SearchResult[]> {
  return invoke<SearchResult[]>("web_search", { query });
}

export async function webFetch(url: string): Promise<string> {
  return invoke<string>("web_fetch", { url });
}
