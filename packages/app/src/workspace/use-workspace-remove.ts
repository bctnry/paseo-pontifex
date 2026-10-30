import { useCallback } from "react";
import { useTranslation } from "react-i18next";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useToast } from "@/contexts/toast-context";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";
import { confirmDialog } from "@/utils/confirm-dialog";
import { removeWorkspaceOptimistically } from "@/workspace/workspace-remove";

function purgeRemovedWorkspaceState(input: { serverId: string; workspaceId: string }): void {
  const workspaceKey = buildWorkspaceTabPersistenceKey(input);
  if (workspaceKey) {
    useWorkspaceLayoutStore.getState().purgeWorkspace(workspaceKey);
  }
}

export interface RemoveWorkspaceInput {
  serverId: string;
  workspaceId: string;
  name: string;
  onRemoveStarted: () => void;
  onSetHiding?: (hiding: boolean) => void;
}

export interface WorkspaceRemoveController {
  remove: () => void;
}

export function useWorkspaceRemove(input: RemoveWorkspaceInput): WorkspaceRemoveController {
  const { serverId, workspaceId, name, onRemoveStarted, onSetHiding } = input;
  const { t } = useTranslation();
  const toast = useToast();

  const removeWorkspaceRecord = useCallback(async () => {
    const client = getHostRuntimeStore().getClient(serverId);
    if (!client) {
      toast.error(t("sidebar.workspace.toasts.hostDisconnected"));
      return;
    }
    onSetHiding?.(true);
    try {
      onRemoveStarted();
      await removeWorkspaceOptimistically({
        client,
        workspace: { serverId, workspaceId },
      });
      purgeRemovedWorkspaceState({ serverId, workspaceId });
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : t("sidebar.workspace.toasts.removeFailed"),
      );
    } finally {
      onSetHiding?.(false);
    }
  }, [onRemoveStarted, onSetHiding, serverId, t, toast, workspaceId]);

  const remove = useCallback(() => {
    void (async () => {
      const confirmed = await confirmDialog({
        title: t("sidebar.workspace.confirmations.removeTitle"),
        message: t("sidebar.workspace.confirmations.removeMessage", { workspaceName: name }),
        confirmLabel: t("sidebar.workspace.confirmations.removeConfirm"),
        cancelLabel: t("sidebar.workspace.confirmations.cancel"),
        destructive: true,
      });
      if (!confirmed) return;
      await removeWorkspaceRecord();
    })();
  }, [name, removeWorkspaceRecord, t]);

  return { remove };
}
