import { memo, useCallback, useMemo, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { Archive, Plus, SquarePen, Trash2 } from "lucide-react-native";
import { AgentStatusDot } from "@/components/agent-status-dot";
import { PressHighlight } from "@/components/ui/press-highlight";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { useArchiveAgent } from "@/hooks/use-archive-agent";
import { useRemoveAgent } from "@/hooks/use-remove-agent";
import { useAppSettings } from "@/hooks/use-settings";
import type {
  SidebarWorkspaceEntry,
  SidebarWorkspacePlacement,
} from "@/hooks/use-sidebar-workspaces-list";
import { useSidebarSelectionArchive } from "@/hooks/use-sidebar-selection-archive";
import { useToast } from "@/contexts/toast-context";
import {
  navigateToWorkspace,
  useActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { useWorkspaceLayoutStore } from "@/stores/workspace-layout-store";
import { collectAllTabs } from "@/stores/workspace-layout-actions";
import { agentSelectionKey, useSidebarSelectionStore } from "@/stores/sidebar-selection-store";
import { density, densityIconBox } from "@/styles/density";
import type { Theme } from "@/styles/theme";
import { confirmDialog } from "@/utils/confirm-dialog";
import {
  WorkspaceMetaRow,
  selectWorkspaceServiceSummary,
} from "@/components/sidebar/workspace-meta-row";
import { resolveSidebarWorkspacePrimaryLabel } from "@/components/sidebar/sidebar-workspace-title";
import { useWorkspaceLabelDefinitions } from "@/workspace-labels";
import { useIsCompactFormFactor } from "@/constants/layout";
import { isNative } from "@/constants/platform";
import type { HostBadgeModel } from "@/hosts/appearance";
import {
  mergeWorkspaceSessionEntries,
  selectFocusedTabIds,
  selectWorkspaceSessionRows,
  selectWorkspaceTabRows,
  type SidebarWorkspaceSessionEntry,
  type SidebarWorkspaceSessionRow,
  type SidebarWorkspaceTabRow,
} from "@/components/sidebar/workspace-sessions";

const ThemedArchive = withUnistyles(Archive);
const ThemedTrash2 = withUnistyles(Trash2);
const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });
const archiveLeadingIcon = <ThemedArchive size={14} uniProps={mutedIconMapping} />;
const removeLeadingIcon = <ThemedTrash2 size={14} uniProps={mutedIconMapping} />;
const ThemedSquarePen = withUnistyles(SquarePen);
const ThemedPlus = withUnistyles(Plus);

/**
 * The extra rows a workspace earns once it holds more than one chat session, or any waiting
 * new-tab/draft tab. A workspace with a single agent keeps its one row: the workspace row already
 * opens that session, and a child row repeating it would just be an indent with no choice behind it.
 */
export const SidebarWorkspaceSessions = memo(function SidebarWorkspaceSessions({
  workspace,
  workspaceEntry = null,
  hostBadge = null,
  variant = "nested",
  onWorkspacePress,
  renderWorkspaceFallback,
}: {
  workspace: SidebarWorkspacePlacement;
  workspaceEntry?: SidebarWorkspaceEntry | null;
  hostBadge?: HostBadgeModel | null;
  /** `nested` keeps sessions indented under a workspace row; `project` makes them the rows. */
  variant?: "nested" | "project";
  onWorkspacePress?: () => void;
  /** A workspace with no sessions still needs a row. Project hierarchy supplies its workspace row. */
  renderWorkspaceFallback?: () => ReactNode;
}) {
  const { t } = useTranslation();
  const { settings } = useAppSettings();
  const agents = useSessionStore((state) => state.sessions[workspace.serverId]?.agents);
  const focusedAgentId = useSessionStore(
    (state) => state.sessions[workspace.serverId]?.focusedAgentId ?? null,
  );
  const layout = useWorkspaceLayoutStore(
    (state) => state.layoutByWorkspace[workspace.workspaceKey],
  );
  const showNewTabs = settings.sidebarShowNewTabs;
  const activeSelection = useActiveWorkspaceSelection();
  const agentRows = useMemo(
    () => selectWorkspaceSessionRows({ agents, workspaceId: workspace.workspaceId }),
    [agents, workspace.workspaceId],
  );
  const tabRows = useMemo(
    () =>
      selectWorkspaceTabRows({
        tabs: layout ? collectAllTabs(layout.root) : undefined,
        focusedTabIds: selectFocusedTabIds(layout),
        enabled: showNewTabs,
      }),
    [layout, showNewTabs],
  );
  const rows = useMemo(
    () => mergeWorkspaceSessionEntries(agentRows, tabRows),
    [agentRows, tabRows],
  );
  const description = useMemo(
    () =>
      variant === "project" && workspaceEntry ? (
        <SessionWorkspaceDescription
          workspace={workspace}
          workspaceEntry={workspaceEntry}
          hostBadge={hostBadge}
        />
      ) : null,
    [hostBadge, variant, workspace, workspaceEntry],
  );

  const handlePress = useCallback(
    (row: SidebarWorkspaceSessionEntry) => {
      onWorkspacePress?.();
      navigateToWorkspace({
        serverId: workspace.serverId,
        workspaceId: workspace.workspaceId,
        target: row.kind === "agent" ? { kind: "agent", agentId: row.id } : row.target,
      });
    },
    [onWorkspacePress, workspace.serverId, workspace.workspaceId],
  );

  if (rows.length === 0) {
    if (variant === "project" && renderWorkspaceFallback) {
      return <>{renderWorkspaceFallback()}</>;
    }
    return null;
  }

  // Workspace hierarchy keeps a single-session workspace as one row; its workspace row is
  // already the choice. Project hierarchy always lists the session because it is the row.
  if (variant === "nested" && rows.length === 1 && tabRows.length === 0) {
    return null;
  }

  const isWorkspaceActive =
    activeSelection?.serverId === workspace.serverId &&
    activeSelection.workspaceId === workspace.workspaceId;

  return (
    <View
      style={[styles.container, variant === "project" && styles.projectContainer]}
      testID={`sidebar-workspace-sessions-${workspace.workspaceKey}`}
    >
      {rows.map((row) =>
        row.kind === "agent" ? (
          <SidebarWorkspaceSessionRowView
            key={row.id}
            row={row}
            serverId={workspace.serverId}
            workspaceKey={workspace.workspaceKey}
            selected={isWorkspaceActive && focusedAgentId === row.id}
            fallbackTitle={t("agentList.fallbackTitle")}
            variant={variant}
            description={description}
            onPress={handlePress}
          />
        ) : (
          <SidebarWorkspaceTabRowView
            key={row.id}
            row={row}
            selected={isWorkspaceActive && row.selected}
            fallbackTitle={t("agentList.fallbackTitle")}
            newTabLabel={t("sidebar.sessions.newTab")}
            variant={variant}
            description={description}
            onPress={handlePress}
          />
        ),
      )}
    </View>
  );
});

function SessionWorkspaceDescription({
  workspace,
  workspaceEntry,
  hostBadge,
}: {
  workspace: SidebarWorkspacePlacement;
  workspaceEntry: SidebarWorkspaceEntry;
  hostBadge: HostBadgeModel | null;
}) {
  const { settings } = useAppSettings();
  const isCompact = useIsCompactFormFactor();
  const workspaceLabel = resolveSidebarWorkspacePrimaryLabel({
    workspace: workspaceEntry,
    workspaceTitleSource: settings.workspaceTitleSource,
  });
  const labels = useWorkspaceLabelDefinitions(workspace.serverId, workspaceEntry.labels);
  return (
    <WorkspaceMetaRow
      workspaceName={workspaceLabel}
      currentBranch={workspaceEntry.currentBranch}
      projectName={null}
      hostBadge={hostBadge}
      prHint={workspaceEntry.prHint}
      serviceSummary={
        isCompact || isNative ? null : selectWorkspaceServiceSummary(workspaceEntry.scripts)
      }
      labels={labels}
    />
  );
}

const SidebarWorkspaceSessionRowView = memo(function SidebarWorkspaceSessionRowView({
  row,
  serverId,
  workspaceKey,
  selected,
  fallbackTitle,
  variant = "nested",
  description = null,
  onPress,
}: {
  row: SidebarWorkspaceSessionRow;
  serverId: string;
  workspaceKey: string;
  selected: boolean;
  fallbackTitle: string;
  variant?: "nested" | "project";
  description?: ReactNode;
  onPress: (row: SidebarWorkspaceSessionEntry) => void;
}) {
  const { t } = useTranslation();
  const toast = useToast();
  const { archiveAgent } = useArchiveAgent();
  const { removeAgent } = useRemoveAgent();
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
      variant === "project" && styles.projectRow,
      isRowSelected && styles.rowSelected,
      hovered && !isRowSelected && !pressed && styles.rowHovered,
      pressed && styles.rowPressed,
    ],
    [isRowSelected, variant],
  );
  const titleStyle = useMemo(
    () => [
      styles.title,
      variant === "project" && styles.projectTitle,
      isRowSelected ? styles.titleSelected : null,
    ],
    [isRowSelected, variant],
  );
  const handlePress = useCallback(() => {
    if (isSelectionMode) {
      toggleSelection({ kind: "agent", serverId, agentId: row.id });
      return;
    }
    onPress(row);
  }, [isSelectionMode, onPress, row, serverId, toggleSelection]);
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
  const handleRemoveChat = useCallback(() => {
    void (async () => {
      const confirmed = await confirmDialog({
        title: t("sidebar.selection.removeChatTitle"),
        message: t("sidebar.selection.removeChatMessage"),
        confirmLabel: t("sidebar.selection.removeChatConfirm"),
        cancelLabel: t("sidebar.selection.cancel"),
        destructive: true,
      });
      if (!confirmed) return;
      try {
        await removeAgent({ serverId, agentId: row.id });
      } catch (error) {
        toast.error(
          error instanceof Error
            ? error.message
            : t("sidebar.selection.removeChatFailed", { count: 1 }),
        );
      }
    })();
  }, [removeAgent, row.id, serverId, t, toast]);
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
        <View style={[styles.statusSlot, variant === "project" && styles.projectStatusSlot]}>
          <AgentStatusDot
            status={row.status}
            requiresAttention={row.requiresAttention}
            attentionReason={row.attentionReason}
            pendingPermissionCount={row.pendingPermissionCount}
          />
        </View>
        {variant === "project" ? (
          <View style={styles.projectContent}>
            <Text style={titleStyle} numberOfLines={1}>
              {row.title ?? fallbackTitle}
            </Text>
            {description}
          </View>
        ) : (
          <Text style={titleStyle} numberOfLines={1}>
            {row.title ?? fallbackTitle}
          </Text>
        )}
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
          destructive
          leading={removeLeadingIcon}
          onSelect={handleRemoveChat}
          testID={`sidebar-workspace-session-remove-${workspaceKey}-${row.id}`}
        >
          {t("sidebar.selection.removeChat")}
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

const SidebarWorkspaceTabRowView = memo(function SidebarWorkspaceTabRowView({
  row,
  selected,
  fallbackTitle,
  newTabLabel,
  variant = "nested",
  description = null,
  onPress,
}: {
  row: SidebarWorkspaceTabRow;
  selected: boolean;
  fallbackTitle: string;
  newTabLabel: string;
  variant?: "nested" | "project";
  description?: ReactNode;
  onPress: (row: SidebarWorkspaceSessionEntry) => void;
}) {
  const handlePress = useCallback(() => onPress(row), [onPress, row]);
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType) => [
      styles.row,
      variant === "project" && styles.projectRow,
      selected && styles.rowSelected,
      hovered && !selected && !pressed && styles.rowHovered,
      pressed && styles.rowPressed,
    ],
    [selected, variant],
  );
  const titleStyle = useMemo(
    () => [
      styles.title,
      variant === "project" && styles.projectTitle,
      selected ? styles.titleSelected : null,
    ],
    [selected, variant],
  );
  const accessibilityState = useMemo(() => ({ selected }), [selected]);
  const title = row.tabKind === "new_tab" ? newTabLabel : fallbackTitle;
  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityState={accessibilityState}
      accessibilityLabel={title}
      onPress={handlePress}
      style={rowStyle}
      testID={`sidebar-workspace-tab-${row.id}`}
    >
      <View style={[styles.statusSlot, variant === "project" && styles.projectStatusSlot]}>
        {row.tabKind === "new_tab" ? (
          <ThemedPlus size={12} uniProps={mutedIconMapping} />
        ) : (
          <ThemedSquarePen size={12} uniProps={mutedIconMapping} />
        )}
      </View>
      {variant === "project" ? (
        <View style={styles.projectContent}>
          <Text style={titleStyle} numberOfLines={1}>
            {title}
          </Text>
          {description}
        </View>
      ) : (
        <Text style={titleStyle} numberOfLines={1}>
          {title}
        </Text>
      )}
    </PressHighlight>
  );
});

const styles = StyleSheet.create((theme) => ({
  container: {
    paddingBottom: theme.spacing[1],
  },
  projectContainer: {
    paddingBottom: 0,
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
  projectRow: {
    minHeight: density.rowHeight,
    paddingLeft: theme.spacing[2],
    paddingRight: theme.spacing[3],
    paddingVertical: theme.spacing[2],
    alignItems: "flex-start",
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
  projectStatusSlot: {
    width: densityIconBox("md"),
    height: 20,
  },
  projectContent: {
    flex: 1,
    minWidth: 0,
    gap: 2,
  },
  title: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.base,
    fontWeight: "400",
    lineHeight: 20,
  },
  projectTitle: {
    flex: 0,
    color: theme.colors.foreground,
  },
  titleSelected: {
    color: theme.colors.foreground,
  },
}));
