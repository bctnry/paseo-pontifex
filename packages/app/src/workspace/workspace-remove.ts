import { getHostRuntimeStore } from "@/runtime/host-runtime";
import {
  clearWorkspaceArchivePending,
  markWorkspaceArchivePending,
} from "@/contexts/session-workspace-upserts";
import { useSessionStore, type WorkspaceDescriptor } from "@/stores/session-store";
import { resolveWorkspaceMapKeyByIdentity } from "@/utils/workspace-identity";

export interface WorkspaceRemoveTarget {
  serverId: string;
  workspaceId: string;
}

interface WorkspaceRemoveClient {
  removeWorkspace: (
    workspaceId: string,
  ) => Promise<{ workspaceId: string; removed: boolean; error: string | null }>;
}

interface OptimisticWorkspaceRemoveSnapshot {
  workspace: WorkspaceDescriptor | null;
}

/**
 * Permanently remove a workspace's daemon record. The directory, worktree, and files stay
 * on disk: remove deletes Paseo's record of the workspace, not the checkout it points at.
 */
export async function removeWorkspaceOptimistically(input: {
  client: WorkspaceRemoveClient;
  workspace: WorkspaceRemoveTarget;
}): Promise<void> {
  const workspaces = useSessionStore.getState().sessions[input.workspace.serverId]?.workspaces;
  const workspaceKey = resolveWorkspaceMapKeyByIdentity({
    workspaces,
    workspaceId: input.workspace.workspaceId,
  });
  const snapshot: OptimisticWorkspaceRemoveSnapshot = {
    workspace: workspaceKey ? (workspaces?.get(workspaceKey) ?? null) : null,
  };

  markWorkspaceArchivePending(input.workspace);
  getHostRuntimeStore().removeWorkspaceSnapshot(
    input.workspace.serverId,
    input.workspace.workspaceId,
  );

  try {
    const payload = await input.client.removeWorkspace(input.workspace.workspaceId);
    if (!payload.removed || payload.error) {
      throw new Error(payload.error ?? "The daemon did not remove the workspace");
    }
  } catch (error) {
    clearWorkspaceArchivePending(input.workspace);
    if (snapshot.workspace) {
      getHostRuntimeStore().acceptWorkspaceSnapshots(input.workspace.serverId, [
        snapshot.workspace,
      ]);
    }
    throw error;
  }

  clearWorkspaceArchivePending(input.workspace);
}
