import { useCallback, useRef, useState } from "react";
import { useTranslation } from "react-i18next";
import { useToast } from "@/contexts/toast-context";
import {
  buildWorktreeArchiveRiskReasons,
  toWorktreeArchiveRisk,
} from "@/git/worktree-archive-warning";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { getHostRuntimeStore } from "@/runtime/host-runtime";
import { useSessionStore, type WorkspaceDescriptor } from "@/stores/session-store";
import { useSidebarSelectionStore, type SidebarSelection } from "@/stores/sidebar-selection-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { confirmDialog } from "@/utils/confirm-dialog";
import { resolveWorkspaceMapKeyByIdentity } from "@/utils/workspace-identity";
import {
  archiveWorkspacesOptimistically,
  type WorkspaceArchiveFailure,
} from "@/workspace/workspace-archive";
import { buildWorkspaceTabPersistenceKey } from "@/workspace-tabs/model";

interface SelectedWorkspace {
  selection: Extract<SidebarSelection, { kind: "workspace" }>;
  workspace: WorkspaceDescriptor;
}

interface SelectedAgent {
  selection: Extract<SidebarSelection, { kind: "agent" }>;
  agentId: string;
}

function workspaceTargetKey(serverId: string, workspaceId: string): string {
  return `${serverId}:${workspaceId}`;
}

export interface SidebarSelectionArchiveController {
  archiveSelected: () => void;
  isArchiving: boolean;
  selectedCount: number;
}

/**
 * Archives every workspace and chat the sidebar selection holds. Workspaces subsume their own
 * chats, so a chat whose workspace is selected is dropped from the agent pass — archiving it
 * separately would only race the daemon's cascade.
 */
export function useSidebarSelectionArchive(): SidebarSelectionArchiveController {
  const { t } = useTranslation();
  const toast = useToast();
  const { archiveAgent } = useArchiveAgent();
  const selected = useSidebarSelectionStore((state) => state.selected);
  const stopSelection = useSidebarSelectionStore((state) => state.stopSelection);
  const [isArchiving, setIsArchiving] = useState(false);
  const inFlightRef = useRef(false);

  const archiveSelected = useCallback(() => {
    if (inFlightRef.current || selected.size === 0) {
      return;
    }
    inFlightRef.current = true;
    void (async () => {
      try {
        const sessions = useSessionStore.getState().sessions;
        const workspaces: SelectedWorkspace[] = [];
        const agents: SelectedAgent[] = [];
        for (const selection of selected.values()) {
          const session = sessions[selection.serverId];
          if (!session) {
            continue;
          }
          if (selection.kind === "workspace") {
            const workspaceKey = resolveWorkspaceMapKeyByIdentity({
              workspaces: session.workspaces,
              workspaceId: selection.workspaceId,
            });
            const workspace = workspaceKey ? session.workspaces.get(workspaceKey) : undefined;
            if (workspace) {
              workspaces.push({ selection, workspace });
            }
            continue;
          }
          const agent = session.agents.get(selection.agentId);
          if (agent) {
            agents.push({ selection, agentId: agent.id });
          }
        }

        const selectedWorkspaceKeys = new Set(
          workspaces.map(({ selection }) =>
            workspaceTargetKey(selection.serverId, selection.workspaceId),
          ),
        );
        const agentTargets = agents.filter(({ selection }) => {
          const workspaceId = sessions[selection.serverId]?.agents.get(
            selection.agentId,
          )?.workspaceId;
          return (
            !workspaceId ||
            !selectedWorkspaceKeys.has(workspaceTargetKey(selection.serverId, workspaceId))
          );
        });

        const total = workspaces.length + agentTargets.length;
        if (total === 0) {
          stopSelection();
          return;
        }

        const riskLines = workspaces.flatMap(({ workspace }) => {
          if (workspace.workspaceKind !== "worktree") {
            return [];
          }
          const reasons = buildWorktreeArchiveRiskReasons(
            toWorktreeArchiveRisk({
              archiveHasUncommittedChanges: workspace.gitRuntime?.isDirty,
              archiveUnpushedCommitCount: workspace.gitRuntime?.aheadOfOrigin,
              diffStat: workspace.diffStat,
            }),
          );
          if (reasons.length === 0) {
            return [];
          }
          return [`${workspace.title ?? workspace.name}: ${reasons.join(" / ")}`];
        });

        const baseMessage = t("sidebar.selection.archiveMessage", { count: total });
        const confirmed = await confirmDialog({
          title: t("sidebar.selection.archiveTitle", { count: total }),
          message: riskLines.length > 0 ? `${baseMessage}\n\n${riskLines.join("\n")}` : baseMessage,
          confirmLabel: t("sidebar.workspace.actions.archive"),
          cancelLabel: t("common.actions.cancel"),
          destructive: true,
        });
        if (!confirmed) {
          return;
        }

        setIsArchiving(true);
        const agentResults = await Promise.allSettled(
          agentTargets.map(({ selection }) =>
            archiveAgent({ serverId: selection.serverId, agentId: selection.agentId }),
          ),
        );
        const failedAgentCount = agentResults.filter(
          (result) => result.status === "rejected",
        ).length;

        let workspaceFailures: WorkspaceArchiveFailure[] = [];
        if (workspaces.length > 0) {
          workspaceFailures = await archiveWorkspacesOptimistically({
            getClient: (serverId) => getHostRuntimeStore().getClient(serverId),
            workspaces: workspaces.map(({ selection }) => ({
              serverId: selection.serverId,
              workspaceId: selection.workspaceId,
            })),
          });
          const failedWorkspaceKeys = new Set(
            workspaceFailures.map((failure) =>
              workspaceTargetKey(failure.serverId, failure.workspaceId),
            ),
          );
          for (const { selection } of workspaces) {
            if (
              failedWorkspaceKeys.has(workspaceTargetKey(selection.serverId, selection.workspaceId))
            ) {
              continue;
            }
            const workspaceKey = buildWorkspaceTabPersistenceKey({
              serverId: selection.serverId,
              workspaceId: selection.workspaceId,
            });
            if (workspaceKey) {
              useWorkspaceLayoutStore.getState().purgeWorkspace(workspaceKey);
            }
          }
        }

        const failedCount = failedAgentCount + workspaceFailures.length;
        if (failedCount > 0) {
          toast.error(t("sidebar.selection.archiveFailed", { count: failedCount }));
        } else {
          toast.show(t("sidebar.selection.archived", { count: total }), { variant: "success" });
        }
        stopSelection();
      } finally {
        inFlightRef.current = false;
        setIsArchiving(false);
      }
    })();
  }, [archiveAgent, selected, stopSelection, t, toast]);

  return {
    archiveSelected,
    isArchiving,
    selectedCount: selected.size,
  };
}
