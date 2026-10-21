import { router } from "expo-router";
import {
  CalendarClock,
  FolderPlus,
  History,
  Import,
  PanelLeftClose,
  Plus,
  RefreshCw,
  Search,
  Settings,
  type LucideIcon,
} from "lucide-react-native";
import { useTranslation } from "react-i18next";
import { useCallback, useMemo, type PropsWithChildren } from "react";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useOpenNewWorkspace } from "@/hooks/use-open-new-workspace";
import { useShortcutKeys } from "@/hooks/use-shortcut-keys";
import type { Theme } from "@/styles/theme";
import { buildSchedulesRoute, buildSessionsRoute } from "@/utils/host-routes";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { Shortcut } from "@/components/ui/shortcut";
import { useKeyboardShortcutsStore } from "@/stores/keyboard-shortcuts-store";

const mutedIconMapping = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

function menuIcon(icon: LucideIcon) {
  const ThemedIcon = withUnistyles(icon);
  return <ThemedIcon size={14} uniProps={mutedIconMapping} />;
}

const newWorkspaceIcon = menuIcon(Plus);
const addProjectIcon = menuIcon(FolderPlus);
const importSessionIcon = menuIcon(Import);
const searchIcon = menuIcon(Search);
const historyIcon = menuIcon(History);
const schedulesIcon = menuIcon(CalendarClock);
const refreshIcon = menuIcon(RefreshCw);
const settingsIcon = menuIcon(Settings);
const hideSidebarIcon = menuIcon(PanelLeftClose);

/**
 * Right-click actions for the left sidebar itself. Rows with their own context menus stop the
 * event before it reaches this trigger, so the workspace and project menus keep their own items.
 */
export function SidebarContextMenu({
  children,
  onAddProject,
  onImportSession,
  onRefresh,
  onSettings,
  onHideSidebar,
}: PropsWithChildren<{
  onAddProject: () => void;
  onImportSession: () => void;
  onRefresh: () => void;
  onSettings: () => void;
  onHideSidebar: () => void;
}>) {
  const { t } = useTranslation();
  const openNewWorkspace = useOpenNewWorkspace();
  const setCommandCenterOpen = useKeyboardShortcutsStore((state) => state.setCommandCenterOpen);
  const newWorkspaceKeys = useShortcutKeys("new-workspace");
  const addProjectKeys = useShortcutKeys("new-agent");
  const searchKeys = useShortcutKeys("toggle-command-center");
  const settingsKeys = useShortcutKeys("toggle-settings");
  const hideSidebarKeys = useShortcutKeys("toggle-left-sidebar");
  const openSearch = useCallback(() => setCommandCenterOpen(true), [setCommandCenterOpen]);
  const openHistory = useCallback(() => router.push(buildSessionsRoute()), []);
  const openSchedules = useCallback(() => router.push(buildSchedulesRoute()), []);
  const newWorkspaceShortcut = useMemo(
    () => (newWorkspaceKeys ? <Shortcut chord={newWorkspaceKeys} /> : null),
    [newWorkspaceKeys],
  );
  const addProjectShortcut = useMemo(
    () => (addProjectKeys ? <Shortcut chord={addProjectKeys} /> : null),
    [addProjectKeys],
  );
  const searchShortcut = useMemo(
    () => (searchKeys ? <Shortcut chord={searchKeys} /> : null),
    [searchKeys],
  );
  const settingsShortcut = useMemo(
    () => (settingsKeys ? <Shortcut chord={settingsKeys} /> : null),
    [settingsKeys],
  );
  const hideSidebarShortcut = useMemo(
    () => (hideSidebarKeys ? <Shortcut chord={hideSidebarKeys} /> : null),
    [hideSidebarKeys],
  );

  return (
    <ContextMenu>
      <ContextMenuTrigger contextOnly style={styles.trigger}>
        {children}
      </ContextMenuTrigger>
      <ContextMenuContent
        align="start"
        width={240}
        testID="sidebar-context-menu"
        sheetTitle={t("sidebar.actions.menu")}
      >
        <ContextMenuItem
          testID="sidebar-context-new-workspace"
          leading={newWorkspaceIcon}
          trailing={newWorkspaceShortcut}
          onSelect={openNewWorkspace}
        >
          {t("sidebar.actions.newWorkspace")}
        </ContextMenuItem>
        <ContextMenuItem
          testID="sidebar-context-add-project"
          leading={addProjectIcon}
          trailing={addProjectShortcut}
          onSelect={onAddProject}
        >
          {t("sidebar.actions.addProject")}
        </ContextMenuItem>
        <ContextMenuItem
          testID="sidebar-context-import-session"
          leading={importSessionIcon}
          onSelect={onImportSession}
        >
          {t("importSession.title")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          testID="sidebar-context-search"
          leading={searchIcon}
          trailing={searchShortcut}
          onSelect={openSearch}
        >
          {t("sidebar.sections.search")}
        </ContextMenuItem>
        <ContextMenuItem
          testID="sidebar-context-history"
          leading={historyIcon}
          onSelect={openHistory}
        >
          {t("sidebar.sections.sessions")}
        </ContextMenuItem>
        <ContextMenuItem
          testID="sidebar-context-schedules"
          leading={schedulesIcon}
          onSelect={openSchedules}
        >
          {t("sidebar.sections.schedules")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          testID="sidebar-context-refresh"
          leading={refreshIcon}
          onSelect={onRefresh}
        >
          {t("sidebar.actions.refreshWorkspaces")}
        </ContextMenuItem>
        <ContextMenuItem
          testID="sidebar-context-settings"
          leading={settingsIcon}
          trailing={settingsShortcut}
          onSelect={onSettings}
        >
          {t("sidebar.actions.settings")}
        </ContextMenuItem>
        <ContextMenuSeparator />
        <ContextMenuItem
          testID="sidebar-context-hide"
          leading={hideSidebarIcon}
          trailing={hideSidebarShortcut}
          onSelect={onHideSidebar}
        >
          {t("sidebar.actions.hideSidebar")}
        </ContextMenuItem>
      </ContextMenuContent>
    </ContextMenu>
  );
}

const styles = StyleSheet.create({
  trigger: {
    flex: 1,
  },
});
