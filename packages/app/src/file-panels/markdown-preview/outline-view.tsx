import { useCallback, useMemo, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  ListTree,
  PanelLeftClose,
  PanelRightClose,
} from "lucide-react-native";
import { ScrollView, Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { useTranslation } from "react-i18next";
import {
  iconButtonChromeGlyphSize,
  useIconButtonChromeStyle,
} from "@/components/ui/icon-button-chrome";
import { mutedIconColorMapping } from "@/components/ui/icon-color";
import { PressHighlight } from "@/components/ui/press-highlight";
import { useIsCompactFormFactor } from "@/constants/layout";
import type { MarkdownOutlineItem } from "./outline";

const ThemedListTree = withUnistyles(ListTree);
const ThemedPanelLeftClose = withUnistyles(PanelLeftClose);
const ThemedPanelRightClose = withUnistyles(PanelRightClose);
const ThemedChevronDown = withUnistyles(ChevronDown);
const ThemedChevronRight = withUnistyles(ChevronRight);
const COLLAPSED_ACCESSIBILITY_STATE = { expanded: false };
const EXPANDED_ACCESSIBILITY_STATE = { expanded: true };

export interface MarkdownOutlineSidebarProps {
  items: readonly MarkdownOutlineItem[];
  collapsedItemIds: ReadonlySet<string>;
  position: "left" | "right";
  expanded: boolean;
  onToggleExpanded: () => void;
  onToggleItem: (item: MarkdownOutlineItem) => void;
  onSelect: (item: MarkdownOutlineItem) => void;
}

export function MarkdownOutlineSidebar({
  items,
  collapsedItemIds,
  position,
  expanded,
  onToggleExpanded,
  onToggleItem,
  onSelect,
}: MarkdownOutlineSidebarProps) {
  const { t } = useTranslation();
  const compact = useIsCompactFormFactor();
  const chromeStyle = useIconButtonChromeStyle({ size: "large", compact });
  const iconSize = iconButtonChromeGlyphSize("large", compact);
  const [hovered, setHovered] = useState(false);
  const handleHoverIn = useCallback(() => setHovered(true), []);
  const handleHoverOut = useCallback(() => setHovered(false), []);
  const pressableStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => chromeStyle({ hovered, pressed }),
    [chromeStyle, hovered],
  );

  if (!expanded) {
    return (
      <View
        style={[styles.rail, position === "left" ? styles.railLeft : styles.railRight]}
        testID="markdown-outline-collapsed"
      >
        <PressHighlight
          accessibilityRole="button"
          accessibilityLabel={t("panels.file.outline.expand")}
          accessibilityState={COLLAPSED_ACCESSIBILITY_STATE}
          onHoverIn={handleHoverIn}
          onHoverOut={handleHoverOut}
          onPress={onToggleExpanded}
          style={pressableStyle}
          testID="markdown-outline-toggle"
        >
          <ThemedListTree size={iconSize} uniProps={mutedIconColorMapping} />
        </PressHighlight>
      </View>
    );
  }

  return (
    <View
      style={[styles.sidebar, position === "left" ? styles.sidebarLeft : styles.sidebarRight]}
      testID="markdown-outline"
    >
      <View style={styles.header}>
        <Text numberOfLines={1} style={styles.title}>
          {t("panels.file.outline.title")}
        </Text>
        <PressHighlight
          accessibilityRole="button"
          accessibilityLabel={t("panels.file.outline.collapse")}
          accessibilityState={EXPANDED_ACCESSIBILITY_STATE}
          onHoverIn={handleHoverIn}
          onHoverOut={handleHoverOut}
          onPress={onToggleExpanded}
          style={pressableStyle}
          testID="markdown-outline-toggle"
        >
          {position === "left" ? (
            <ThemedPanelLeftClose size={iconSize} uniProps={mutedIconColorMapping} />
          ) : (
            <ThemedPanelRightClose size={iconSize} uniProps={mutedIconColorMapping} />
          )}
        </PressHighlight>
      </View>
      <ScrollView
        style={styles.listScroll}
        contentContainerStyle={styles.list}
        showsVerticalScrollIndicator
        testID="markdown-outline-list"
      >
        {items.map((item) => (
          <OutlineRow
            key={item.id}
            item={item}
            collapsed={collapsedItemIds.has(item.id)}
            onToggle={onToggleItem}
            onSelect={onSelect}
          />
        ))}
      </ScrollView>
    </View>
  );
}

function OutlineRow({
  item,
  collapsed,
  onToggle,
  onSelect,
}: {
  item: MarkdownOutlineItem;
  collapsed: boolean;
  onToggle: (item: MarkdownOutlineItem) => void;
  onSelect: (item: MarkdownOutlineItem) => void;
}) {
  const [hovered, setHovered] = useState(false);
  const handleHoverIn = useCallback(() => setHovered(true), []);
  const handleHoverOut = useCallback(() => setHovered(false), []);
  const handlePress = useCallback(() => onSelect(item), [item, onSelect]);
  const handleToggle = useCallback(() => onToggle(item), [item, onToggle]);
  const depthStyle = DEPTH_STYLES[item.depth - 1] ?? DEPTH_STYLES[0];
  const rowStyle = useMemo(
    () => [styles.row, depthStyle, hovered && styles.rowActive],
    [depthStyle, hovered],
  );

  return (
    <PressHighlight
      accessible={false}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      style={rowStyle}
    >
      {item.hasChildren ? (
        <OutlineDisclosure expanded={!collapsed} title={item.title} onPress={handleToggle} />
      ) : (
        <View style={styles.disclosureSpacer} />
      )}
      <PressHighlight
        accessibilityRole="button"
        accessibilityLabel={item.title}
        onPress={handlePress}
        style={styles.labelButton}
      >
        {({ pressed }) => (
          <Text
            numberOfLines={2}
            style={[styles.rowText, (hovered || pressed) && styles.rowTextActive]}
          >
            {item.title}
          </Text>
        )}
      </PressHighlight>
    </PressHighlight>
  );
}

function OutlineDisclosure({
  expanded,
  title,
  onPress,
}: {
  expanded: boolean;
  title: string;
  onPress: () => void;
}) {
  const { t } = useTranslation();
  const [hovered, setHovered] = useState(false);
  const handleHoverIn = useCallback(() => setHovered(true), []);
  const handleHoverOut = useCallback(() => setHovered(false), []);
  const accessibilityState = useMemo(() => ({ expanded }), [expanded]);
  const disclosureStyle = useCallback(
    ({ pressed }: PressableStateCallbackType) => [
      styles.disclosure,
      (hovered || pressed) && styles.disclosureHovered,
    ],
    [hovered],
  );

  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityLabel={t(
        expanded ? "panels.file.outline.collapseItem" : "panels.file.outline.expandItem",
        { title },
      )}
      accessibilityState={accessibilityState}
      hitSlop={4}
      onHoverIn={handleHoverIn}
      onHoverOut={handleHoverOut}
      onPress={onPress}
      style={disclosureStyle}
    >
      {expanded ? (
        <ThemedChevronDown size={12} uniProps={mutedIconColorMapping} />
      ) : (
        <ThemedChevronRight size={12} uniProps={mutedIconColorMapping} />
      )}
    </PressHighlight>
  );
}

const styles = StyleSheet.create((theme) => ({
  sidebar: {
    width: {
      xs: 184,
      md: 232,
    },
    flexShrink: 0,
    minHeight: 0,
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
  },
  sidebarLeft: {
    borderRightWidth: theme.borderWidth[1],
  },
  sidebarRight: {
    borderLeftWidth: theme.borderWidth[1],
  },
  rail: {
    width: 40,
    flexShrink: 0,
    alignItems: "center",
    paddingTop: theme.spacing[3],
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
  },
  railLeft: {
    borderRightWidth: theme.borderWidth[1],
  },
  railRight: {
    borderLeftWidth: theme.borderWidth[1],
  },
  header: {
    flexDirection: "row",
    alignItems: "center",
    gap: theme.spacing[2],
    paddingLeft: theme.spacing[3],
    paddingRight: theme.spacing[2],
    paddingVertical: theme.spacing[2],
    borderBottomWidth: theme.borderWidth[1],
    borderBottomColor: theme.colors.border,
  },
  title: {
    flex: 1,
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  listScroll: {
    flex: 1,
    minHeight: 0,
  },
  list: {
    paddingVertical: theme.spacing[2],
    paddingHorizontal: theme.spacing[1],
  },
  row: {
    flexDirection: "row",
    alignItems: "flex-start",
    gap: theme.spacing[1],
    paddingRight: theme.spacing[3],
    paddingVertical: theme.spacing[1.5],
  },
  rowActive: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  labelButton: {
    flex: 1,
    minWidth: 0,
  },
  rowText: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    lineHeight: 16,
  },
  rowTextActive: {
    color: theme.colors.foreground,
  },
  disclosure: {
    width: 16,
    height: 16,
    alignItems: "center",
    justifyContent: "center",
    marginTop: 1,
  },
  disclosureHovered: {
    backgroundColor: theme.colors.interactionHighlight,
  },
  disclosureSpacer: {
    width: 16,
    height: 16,
    marginTop: 1,
  },
  depth1: { paddingLeft: theme.spacing[3] },
  depth2: { paddingLeft: theme.spacing[3] * 2 },
  depth3: { paddingLeft: theme.spacing[3] * 3 },
  depth4: { paddingLeft: theme.spacing[3] * 4 },
  depth5: { paddingLeft: theme.spacing[3] * 5 },
  depth6: { paddingLeft: theme.spacing[3] * 6 },
}));

const DEPTH_STYLES = [
  styles.depth1,
  styles.depth2,
  styles.depth3,
  styles.depth4,
  styles.depth5,
  styles.depth6,
];
