import { memo, useCallback, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { AgentStatusDot } from "@/components/agent-status-dot";
import { PressHighlight } from "@/components/ui/press-highlight";
import type { SidebarWorkspacePlacement } from "@/hooks/use-sidebar-workspaces-list";
import {
  navigateToWorkspace,
  useActiveWorkspaceSelection,
} from "@/stores/navigation-active-workspace-store";
import { useSessionStore } from "@/stores/session-store";
import { density } from "@/styles/density";
import {
  selectWorkspaceSessionRows,
  type SidebarWorkspaceSessionRow,
} from "@/components/sidebar/workspace-sessions";

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
  workspaceKey,
  selected,
  fallbackTitle,
  onPress,
}: {
  row: SidebarWorkspaceSessionRow;
  workspaceKey: string;
  selected: boolean;
  fallbackTitle: string;
  onPress: (agentId: string) => void;
}) {
  const rowStyle = useCallback(
    ({ hovered = false, pressed }: PressableStateCallbackType) => [
      styles.row,
      selected && styles.rowSelected,
      hovered && !selected && !pressed && styles.rowHovered,
      pressed && styles.rowPressed,
    ],
    [selected],
  );
  const titleStyle = useMemo(
    () => [styles.title, selected ? styles.titleSelected : null],
    [selected],
  );
  const handlePress = useCallback(() => onPress(row.id), [onPress, row.id]);
  const accessibilityState = useMemo(() => ({ selected }), [selected]);

  return (
    <PressHighlight
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
    </PressHighlight>
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
