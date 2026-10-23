import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Archive } from "lucide-react-native";
import { AgentStatusDot } from "@/components/agent-status-dot";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import type { SidebarWorkspacePlacement } from "@/hooks/use-sidebar-workspaces-list";
import { useSidebarSelectionArchive } from "@/hooks/use-sidebar-selection-archive";
import { useToast } from "@/contexts/toast-context";
import {
  navigateToWorkspace,
  useActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { agentSelectionKey, useSidebarSelectionStore } from "@/stores/sidebar-selection-store";
import { density } from "@/styles/density";
import type { Theme } from "@/styles/theme";
import {
  selectWorkspaceSessionRows,
  type SidebarWorkspaceSessionRow,
} from "@/components/sidebar/workspace-sessions";

const ThemedArchive = withUnistyles(Archive);
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const archiveLeadingIcon = <ThemedArchive size={14} uniProps={mutedIconMapping} />;

/**
 * The extra rows a workspace earns once it holds more than one chat session. A workspace with
 * a single session keeps its one row: the workspace row already opens that session, and a
 * child row repeating it would just be an indent with no choice behind it.
 */
export const SidebarWorkspaceSessions = memo(function SidebarWorkspaceSessions({
  workspace,
  onWorkspacePress,
}: {
  workspace: SidebarWorkspacePlacement;
  onWorkspacePress?: () => void;
}) {
  const { t } = useTranslation();
  const agents = useSessionStore((state) => state.sessions[workspace.serverId]?.agents);
  const focusedAgentId = useSessionStore(
    (state) => state.sessions[workspace.serverId]?.focusedAgentId ?? null,
  );
  const activeSelection = useActiveWorkspaceSelection();
  const rows = useMemo(
    () => selectWorkspaceSessionRows({ agents, workspaceId: workspace.workspaceId }),
    [agents, workspace.workspaceId],
  );

  const handlePress = useCallback(
    (agentId: string) => {
      onWorkspacePress?.();
      navigateToWorkspace({
        serverId: workspace.serverId,
        workspaceId: workspace.workspaceId,
        target: { kind: "agent", agentId },
      });
    },
    [onWorkspacePress, workspace.serverId, workspace.workspaceId],
  );

  if (rows.length <= 1) {
    return null;
  }

  const isWorkspaceActive =
    activeSelection?.serverId === workspace.serverId &&
    activeSelection.workspaceId === workspace.workspaceId;

  return (
    <View style={styles.container} testID={`sidebar-workspace-sessions-${workspace.workspaceKey}`}>
      {rows.map((row) => (
        <SidebarWorkspaceSessionRowView
          key={row.id}
          row={row}
          serverId={workspace.serverId}
          workspaceKey={workspace.workspaceKey}
          selected={isWorkspaceActive && focusedAgentId === row.id}
          fallbackTitle={t("agentList.fallbackTitle")}
          onPress={handlePress}
        />
      ))}
    </View>
  );
});

const SidebarWorkspaceSessionRowView = memo(function SidebarWorkspaceSessionRowView({
  row,
  serverId,
  workspaceKey,
  selected,
  fallbackTitle,
  onPress,
}: {
  row: SidebarWorkspaceSessionRow;
  serverId: string;
  workspaceKey: string;
  selected: boolean;
  fallbackTitle: string;
  onPress: (agentId: string) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { archiveAgent } = useArchiveAgent();
  const { archiveSelected, isArchiving } = useSidebarSelectionArchive();
  const isSelectionMode = useSidebarSelectionStore((state) => state.isSelectionMode);
  const isMultiSelected = useSidebarSelectionStore((state) =>
    state.selected.has(agentSelectionKey(serverId, row.id)),
  );
  const selectedCount = useSidebarSelectionStore((state) => state.selected.size);
  const startSelection = useSidebarSelectionStore((state) => state.startSelection);
  const toggleSelection = useSidebarSelectionStore((state) => state.toggle);
  const isRowSelected = selected || isMultiSelected;

  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType) => [
      styles.row,
      isRowSelected && styles.rowSelected,
      hovered && !isRowSelected && !pressed && styles.rowHovered,
      pressed && styles.rowPressed,
    ],
    [isRowSelected],
  );
  const titleStyle = useMemo(
    () => [styles.title, isRowSelected ? styles.titleSelected : null],
    [isRowSelected],
  );
  const handlePress = useCallback(() => {
    if (isSelectionMode) {
      toggleSelection({ kind: "agent", serverId, agentId: row.id });
      return;
    }
    onPress(row.id);
  }, [isSelectionMode, onPress, row.id, serverId, toggleSelection]);
  const handleSelect = useCallback(() => {
    const selection = { kind: "agent" as const, serverId, agentId: row.id };
    if (isSelectionMode) {
      toggleSelection(selection);
    } else {
      startSelection(selection);
    }
  }, [isSelectionMode, row.id, serverId, startSelection, toggleSelection]);
  const handleArchiveChat = useCallback(() => {
    void archiveAgent({ serverId, agentId: row.id }).catch((error) => {
      toast.error(
        error instanceof Error ? error.message : t("sidebar.selection.archiveFailed", { count: 1 }),
      );
    });
  }, [archiveAgent, row.id, serverId, t, toast]);
  const accessibilityState = useMemo(() => ({ selected: isRowSelected }), [isRowSelected]);

  return (
    <ContextMenu>
      <ContextMenuTrigger
        accessibilityRole="button"
        accessibilityState={accessibilityState}
        accessibilityLabel={row.title ?? fallbackTitle}
        highlightStyle={styles.rowPressed}
        onPress={handlePress}
        style={rowStyle}
        testID={`sidebar-workspace-session-${workspaceKey}-${row.id}`}
      >
        <View style={styles.statusSlot}>
          <AgentStatusDot
            status={row.status}
            requiresAttention={row.requiresAttention}
            attentionReason={row.attentionReason}
            pendingPermissionCount={row.pendingPermissionCount}
          />
        </View>
        <Text style={titleStyle} numberOfLines={1}>
          {row.title ?? fallbackTitle}
        </Text>
      </ContextMenuTrigger>
      <ContextMenuContent
        align="start"
        width={240}
        testID={`sidebar-workspace-session-menu-${workspaceKey}-${row.id}`}
      >
        {selectedCount > 0 ? (
          <ContextMenuItem
            disabled={isArchiving}
            leading={archiveLeadingIcon}
            onSelect={archiveSelected}
            testID={`sidebar-workspace-session-archive-selected-${workspaceKey}-${row.id}`}
          >
            {t("sidebar.selection.archiveSelected", { count: selectedCount })}
          </ContextMenuItem>
        ) : null}
        <ContextMenuItem
          leading={archiveLeadingIcon}
          onSelect={handleArchiveChat}
          testID={`sidebar-workspace-session-archive-${workspaceKey}-${row.id}`}
        >
          {t("sidebar.selection.archiveChat")}
        </ContextMenuItem>
        <ContextMenuItem
          onSelect={handleSelect}
          testID={`sidebar-workspace-session-select-${workspaceKey}-${row.id}`}
        >
          {isMultiSelected ? t("sidebar.selection.deselect") : t("sidebar.selection.select")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    paddingBottom: theme.spacing[1],
  },
  row: {
    minHeight: density.tightRowHeight,
    // The status slot lands under the workspace title, so the child reads as a branch of the
    // row above it rather than as another workspace.
    paddingLeft: theme.spacing[6],
    paddingRight: theme.spacing[3],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    marginBottom: theme.spacing[0.5],
    userSelect: "none",
  },
  rowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  rowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  rowSelected: {
    backgroundColor: theme.colors.surfaceSidebarSelected,
  },
  statusSlot: {
    width: theme.iconSize.sm,
    height: theme.iconSize.sm,
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: "400",
    lineHeight: 20,
  },
  titleSelected: {
    color: theme.colors.foreground,
  },
}));
