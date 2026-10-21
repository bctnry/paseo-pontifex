import { useCallback } from "react";
import { router } from "expo-router";
import { canCreateWorktreeForProjectKind } from "@/projects/host-projects";
import { useHostFeature } from "@/runtime/host-features";
import { useActiveWorkspaceSelection } from "@/stores/navigation-active-workspace-store";
import { useWorkspace } from "@/stores/session-store-hooks";
import { buildNewWorkspaceRoute } from "@/utils/host-routes";

/**
 * Opens the new-workspace flow with the active workspace as its source when the host can own
 * another workspace. The sidebar's nav row and its context menu both use this, so the route they
 * open cannot drift.
 */
export function useOpenNewWorkspace(): () => void {
  const selection = useActiveWorkspaceSelection();
  const serverId = selection?.serverId ?? null;
  const workspaceId = selection?.workspaceId ?? null;
  const activeWorkspace = useWorkspace(serverId, workspaceId);
  const supportsWorkspaceMultiplicity = useHostFeature(serverId, "workspaceMultiplicity");
  const canUseActiveWorkspaceContext = Boolean(
    activeWorkspace &&
    (supportsWorkspaceMultiplicity || canCreateWorktreeForProjectKind(activeWorkspace.projectKind)),
  );

  return useCallback(() => {
    router.push(
      serverId
        ? buildNewWorkspaceRoute(
            activeWorkspace && canUseActiveWorkspaceContext
              ? {
                  serverId,
                  sourceDirectory: activeWorkspace.projectRootPath,
                  projectId: activeWorkspace.projectId,
                }
              : { serverId },
          )
        : buildNewWorkspaceRoute(),
    );
  }, [activeWorkspace, canUseActiveWorkspaceContext, serverId]);
}
