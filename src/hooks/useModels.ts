import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { invoke } from "@tauri-apps/api/core";
import { listModels, deleteModel, getModelCapabilities, listCloudModels, getCloudModelCapabilities } from "../services/ollama";
import { useModelStore } from "../stores/modelStore";
import { useSettingsStore } from "../stores/settingsStore";
import type { OllamaModel } from "../types/ollama";

export function useInstalledModels() {
  return useQuery({
    queryKey: ["models"],
    queryFn: listModels,
    refetchInterval: 10_000,
    retry: false,
  });
}

export function useDeleteModel() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: deleteModel,
    onSuccess: () => qc.invalidateQueries({ queryKey: ["models"] }),
  });
}

export function useSearchConfig() {
  const ollamaApiKey = useSettingsStore((s) => s.ollamaApiKey);
  const braveApiKey = useSettingsStore((s) => s.braveApiKey);
  return { data: { ollamaKey: ollamaApiKey || null, braveKey: braveApiKey || null } };
}

export function useCloudConfig() {
  const ollamaApiKey = useSettingsStore((s) => s.ollamaApiKey);
  return { data: { apiKey: ollamaApiKey || null } };
}

export function useCloudModels() {
  const { data: config } = useCloudConfig();
  const apiKey = config?.apiKey ?? null;
  return useQuery<OllamaModel[]>({
    queryKey: ["cloud-models", apiKey],
    queryFn: () => listCloudModels(apiKey!),
    enabled: !!apiKey,
    staleTime: 60_000,
    retry: false,
  });
}

export function useCloudModelCapabilities(model: string, apiKey: string | null) {
  return useQuery({
    queryKey: ["cloud-capabilities", model, apiKey],
    queryFn: () => getCloudModelCapabilities(model, apiKey!),
    enabled: !!model && !!apiKey,
    staleTime: Infinity,
  });
}

export function useModelCapabilities(model: string) {
  const isCloud = useModelStore((s) => s.isCloudModel);
  const { data: cloudConfig } = useCloudConfig();
  const apiKey = cloudConfig?.apiKey ?? null;

  const { data: localCaps } = useQuery({
    queryKey: ["capabilities", model],
    queryFn: () => getModelCapabilities(model),
    enabled: !!model && !isCloud,
    staleTime: Infinity,
  });
  const { data: cloudCaps } = useCloudModelCapabilities(model, isCloud ? apiKey : null);

  const caps = isCloud ? (cloudCaps ?? []) : (localCaps ?? []);
  return { supportsVision: caps.includes("vision") };
}

export function useCloudModelContextLength(model: string, apiKey: string | null) {
  return useQuery({
    queryKey: ["cloud-context-length", model, apiKey],
    queryFn: () => invoke<number>("cloud_get_context_length", { name: model, apiKey }),
    enabled: !!model && !!apiKey,
    staleTime: Infinity,
  });
}

export function useActiveModel() {
  const { activeModel, setActiveModel } = useModelStore();
  const { data: models } = useInstalledModels();

  const resolved =
    activeModel ||
    (models && models.length > 0 ? models[0].name : "");

  return { activeModel: resolved, setActiveModel };
}
