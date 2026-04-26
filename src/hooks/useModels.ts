import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { listModels, deleteModel } from "../services/ollama";
import { useModelStore } from "../stores/modelStore";

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

export function useActiveModel() {
  const { activeModel, setActiveModel } = useModelStore();
  const { data: models } = useInstalledModels();

  const resolved =
    activeModel ||
    (models && models.length > 0 ? models[0].name : "");

  return { activeModel: resolved, setActiveModel };
}
