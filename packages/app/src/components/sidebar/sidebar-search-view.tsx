import { useCallback, useEffect, useMemo } from "react";
import { useTranslation } from "react-i18next";
import { PressHighlight } from "@/components/ui/press-highlight";
import { ScrollView, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet } from "react-native-unistyles";
import { X } from "lucide-react-native";
import { ProjectIconView } from "@/components/project-icon-view";
import { SearchField } from "@/components/ui/search-field";
import { SidebarSectionHeader } from "@/components/sidebar/sidebar-section-header";
import { useSidebarModel } from "@/components/sidebar/sidebar-model";
import { searchSidebar, type SidebarSearchResult } from "@/components/sidebar/sidebar-search";
import { useProjectIcons } from "@/projects/icons";
import { resolveSidebarProjectIconTargets } from "@/utils/sidebar-project-row-model";
import { projectIconPlaceholderLabelFromDisplayName } from "@/utils/project-display-name";
import { navigateToWorkspace } from "@/stores/navigation-active-workspace-store";
import { useSidebarCollapsedSectionsStore } from "@/stores/sidebar-collapsed-sections-store";
import { useSidebarSearchStore } from "@/stores/sidebar-search-store";
import { useSidebarViewStore } from "@/stores/sidebar-view-store";

/**
 * The sidebar's search view: a field over matching projects and workspaces.
 *
 * It replaces the project list, not the whole sidebar, so the nav rows and footer stay reachable
 * while searching. Closing it restores the list exactly as it was.
 */
export function SidebarSearchView({ onWorkspacePress }: { onWorkspacePress?: () => void }) {
  const { t } = useTranslation();
  const { allProjects, workspaceEntriesByKey } = useSidebarModel();
  const query = useSidebarSearchStore((state) => state.query);
  const setQuery = useSidebarSearchStore((state) => state.setQuery);
  const close = useSidebarSearchStore((state) => state.close);
  const iconByProjectViewKey = useProjectIcons({
    projects: useMemo(() => resolveSidebarProjectIconTargets(allProjects), [allProjects]),
  });
  const results = useMemo(
    () => searchSidebar({ projects: allProjects, workspaceEntriesByKey, query }),
    [allProjects, query, workspaceEntriesByKey],
  );

  useEffect(() => {
    if (typeof document === "undefined") return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [close]);

  const handleSelect = useCallback(
    (result: SidebarSearchResult) => {
      if (result.kind === "project") {
        const view = useSidebarViewStore.getState();
        view.setGroupMode("project");
        view.clearProjectFilters();
        view.clearLabelFilter();
        useSidebarCollapsedSectionsStore
          .getState()
          .setProjectCollapsed(result.projectViewKey, false);
        close();
        return;
      }
      close();
      onWorkspacePress?.();
      navigateToWorkspace({ serverId: result.serverId, workspaceId: result.workspaceId });
    },
    [close, onWorkspacePress],
  );

  return (
    <View style={styles.container} testID="sidebar-search">
      <SidebarSectionHeader title={t("sidebar.sections.search")}>
        <PressHighlight
          accessibilityRole="button"
          accessibilityLabel={t("sidebar.search.close")}
          onPress={close}
          style={styles.closeButton}
          testID="sidebar-search-close"
        >
          <X size={14} color={styles.closeIcon.color} />
        </PressHighlight>
      </SidebarSectionHeader>
      <View style={styles.fieldRow}>
        <SearchField
          value={query}
          onChangeText={setQuery}
          placeholder={t("sidebar.search.placeholder")}
          clearAccessibilityLabel={t("sidebar.search.clear")}
          autoFocus
          testID="sidebar-search-field"
          clearTestID="sidebar-search-clear"
        />
      </View>
      <ScrollView
        style={styles.results}
        contentContainerStyle={styles.resultsContent}
        keyboardShouldPersistTaps="handled"
        showsVerticalScrollIndicator={false}
        testID="sidebar-search-results"
      >
        {results.length === 0 ? (
          <Text style={styles.empty} testID="sidebar-search-empty">
            {t("sidebar.search.empty")}
          </Text>
        ) : (
          results.map((result) => (
            <SearchResultRow
              key={result.id}
              result={result}
              iconDataUri={iconByProjectViewKey.get(result.projectViewKey) ?? null}
              onPress={handleSelect}
            />
          ))
        )}
      </ScrollView>
    </View>
  );
}

function SearchResultRow({
  result,
  iconDataUri,
  onPress,
}: {
  result: SidebarSearchResult;
  iconDataUri: string | null;
  onPress: (result: SidebarSearchResult) => void;
}) {
  const { t } = useTranslation();
  const handlePress = useCallback(() => onPress(result), [onPress, result]);
  const rowStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.resultRow,
      hovered && styles.resultRowHovered,
      pressed && styles.resultRowPressed,
    ],
    [],
  );
  const label = result.kind === "project" ? result.projectName : result.title;
  const subtitle =
    result.kind === "project"
      ? t("sidebar.search.workspaceCount", { count: result.workspaceCount })
      : result.projectName;
  return (
    <PressHighlight
      onPress={handlePress}
      style={rowStyle}
      accessibilityRole="button"
      accessibilityLabel={`${label} ${subtitle}`}
      testID={result.kind === "project" ? `sidebar-search-project-${result.id}` : result.id}
    >
      <ProjectIconView
        iconDataUri={iconDataUri}
        initial={projectIconPlaceholderLabelFromDisplayName(result.projectName)
          .charAt(0)
          .toUpperCase()}
        projectViewKey={result.projectViewKey}
        size={16}
        textStyle={styles.resultIconText}
      />
      <View style={styles.resultText}>
        <Text style={styles.resultTitle} numberOfLines={1}>
          {label}
        </Text>
        <Text style={styles.resultSubtitle} numberOfLines={1}>
          {subtitle}
        </Text>
      </View>
    </PressHighlight>
  );
}

const styles = StyleSheet.create((theme) => ({
  container: {
    flex: 1,
    minHeight: 0,
  },
  closeButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  closeIcon: {
    color: theme.colors.foregroundMuted,
  },
  fieldRow: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: theme.spacing[2],
    paddingTop: theme.spacing[2],
    paddingBottom: theme.spacing[1],
  },
  results: {
    flex: 1,
    minHeight: 0,
  },
  resultsContent: {
    paddingHorizontal: theme.spacing[2],
    paddingBottom: theme.spacing[4],
  },
  resultRow: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[1],
    borderRadius: theme.borderRadius.lg,
  },
  resultRowHovered: {
    backgroundColor: theme.colors.surfaceSidebarHover,
  },
  resultRowPressed: {
    backgroundColor: theme.colors.surface2,
  },
  resultText: {
    flex: 1,
    minWidth: 0,
  },
  resultTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.base,
    lineHeight: 18,
  },
  resultSubtitle: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 16,
  },
  resultIconText: {
    fontSize: 8,
  },
  empty: {
    paddingHorizontal: theme.spacing[2],
    paddingVertical: theme.spacing[3],
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 18,
  },
}));
