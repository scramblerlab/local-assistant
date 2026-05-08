import { create } from "zustand";
import { invoke } from "@tauri-apps/api/core";

interface PendingPermission {
  path: string;
  folder: string;
  operation: string;
  isOutsideHome: boolean;
  resolve: (granted: boolean) => void;
}

interface PermissionState {
  approvedFolders: string[];
  homeDir: string;
  pending: PendingPermission | null;

  initialize: () => Promise<void>;
  isApproved: (path: string) => boolean;
  requestPermission: (path: string, operation: string) => Promise<boolean>;
  grantPermission: () => Promise<void>;
  denyPermission: () => void;
}

function parentFolder(path: string): string {
  const p = path.replace(/\/$/, "");
  const idx = p.lastIndexOf("/");
  // idx <= 1 means the only "/" is the one in "~/" — don't strip it, the path IS the folder
  return idx > 1 ? p.slice(0, idx) : p;
}

export const usePermissionStore = create<PermissionState>((set, get) => ({
  approvedFolders: [],
  homeDir: "",
  pending: null,

  initialize: async () => {
    console.log("[permissionStore] initialize called");
    const [folders, homeDir] = await Promise.all([
      invoke<string[]>("get_file_permissions"),
      invoke<string>("get_home_dir"),
    ]);
    console.log("[permissionStore] initialized — homeDir:", homeDir, "approvedFolders:", folders);
    set({ approvedFolders: folders, homeDir });
  },

  isApproved: (path: string) => {
    const { approvedFolders } = get();
    return approvedFolders.some(
      (f) => path === f || path.startsWith(f + "/"),
    );
  },

  requestPermission: (path: string, operation: string) => {
    const { homeDir } = get();
    const isOutsideHome =
      !path.startsWith("~/") &&
      !path.startsWith("~") &&
      !!homeDir &&
      !path.startsWith(homeDir);
    const folder = parentFolder(path);
    console.log("[permissionStore] requestPermission — path:", path, "folder:", folder, "isOutsideHome:", isOutsideHome);

    return new Promise<boolean>((resolve) => {
      console.log("[permissionStore] setting pending, dialog should appear");
      set({ pending: { path, folder, operation, isOutsideHome, resolve } });
    });
  },

  grantPermission: async () => {
    const { pending } = get();
    if (!pending) return;
    const { resolve, folder, isOutsideHome } = pending;
    set({ pending: null });
    if (!isOutsideHome) {
      try {
        const newFolders = await invoke<string[]>("add_file_permission", { path: folder });
        set({ approvedFolders: newFolders });
      } catch {
        // Permission add failed; still grant for this operation
      }
    }
    resolve(true);
  },

  denyPermission: () => {
    const { pending } = get();
    if (!pending) return;
    const { resolve } = pending;
    set({ pending: null });
    resolve(false);
  },
}));
