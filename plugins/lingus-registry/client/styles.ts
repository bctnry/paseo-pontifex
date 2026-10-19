// Theme-derived styles for the registry screen.
//
// The repo lints with oxlint's react-perf rules as errors, so every object and
// function passed to JSX must be a stable reference. Styles are built once per
// theme in a `useMemo` (see `main.tsx`) and threaded through as a `styles` prop.
// That is also why rows have a single `listItem` style instead of `[a, b]`
// arrays: an inline array would be a fresh object on every render.
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { TextStyle, ViewStyle } from "react-native";

export type PluginTheme = PluginScreenProps["theme"];

export function createStyles(theme: PluginTheme) {
  const screen: ViewStyle = { flex: 1, backgroundColor: theme.colors.surface0 };
  const content: ViewStyle = {
    padding: 16,
    gap: 16,
    width: "100%",
    maxWidth: 1360,
    alignSelf: "center",
  };

  // Header: title, one line of orientation, then the counters as small blocks.
  const hero: ViewStyle = {
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
    borderWidth: 1,
    padding: 16,
    gap: 14,
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    justifyContent: "space-between",
  };
  const heroBody: ViewStyle = { flexGrow: 1, flexShrink: 1, flexBasis: 320, gap: 4 };
  const heroTitle: TextStyle = {
    color: theme.colors.foreground,
    fontSize: 22,
    fontWeight: "700",
    letterSpacing: -0.2,
  };
  const heroMeta: TextStyle = {
    color: theme.colors.foregroundMuted,
    fontSize: 11,
    fontFamily: "monospace",
  };
  const statRow: ViewStyle = { flexDirection: "row", gap: 8, flexWrap: "wrap" };
  const stat: ViewStyle = {
    minWidth: 88,
    borderWidth: 1,
    borderColor: theme.colors.border,
    backgroundColor: theme.colors.surface2,
    paddingHorizontal: 12,
    paddingVertical: 8,
    alignItems: "center",
  };
  const statValue: TextStyle = {
    color: theme.colors.foreground,
    fontSize: 17,
    fontWeight: "700",
  };
  const statLabel: TextStyle = {
    color: theme.colors.foregroundMuted,
    fontSize: 10,
    fontWeight: "600",
    letterSpacing: 0.8,
    textTransform: "uppercase",
  };

  // Two cards per row on a desktop-width window, one per row on a narrow one.
  const grid: ViewStyle = {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 16,
    alignItems: "flex-start",
  };
  const cell: ViewStyle = { flexGrow: 1, flexBasis: 420, minWidth: 300 };

  // One section at a time, so the screen stops being a single long column. The
  // active tab keeps a short accent underline sitting on the bar's rule.
  const tabBar: ViewStyle = {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 4,
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  };
  const tabItem: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: "transparent",
    marginBottom: -1,
  };
  const tabItemActive: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderBottomWidth: 2,
    borderBottomColor: theme.colors.accent,
    marginBottom: -1,
  };
  const tabLabel: TextStyle = {
    color: theme.colors.foregroundMuted,
    fontSize: 13,
    fontWeight: "600",
  };
  const tabLabelActive: TextStyle = {
    color: theme.colors.foreground,
    fontSize: 13,
    fontWeight: "700",
  };
  const tabCount: TextStyle = { color: theme.colors.foregroundMuted, fontSize: 11 };
  const tabCountActive: TextStyle = { color: theme.colors.accent, fontSize: 11 };
  // A tab with one card does not want to stretch across a wide window.
  const narrow: ViewStyle = { width: "100%", maxWidth: 860, alignSelf: "center" };

  const card: ViewStyle = {
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
    borderWidth: 1,
    padding: 14,
    gap: 8,
  };
  const cardHeader: ViewStyle = {
    flexDirection: "row",
    alignItems: "flex-start",
    justifyContent: "space-between",
    gap: 8,
  };
  const cardTitle: TextStyle = {
    color: theme.colors.foreground,
    fontSize: 16,
    fontWeight: "700",
  };
  const cardMeta: TextStyle = { color: theme.colors.foregroundMuted, fontSize: 11 };
  const sectionTitle: TextStyle = {
    color: theme.colors.foregroundMuted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1,
    textTransform: "uppercase",
    marginTop: 4,
  };
  const fieldLabel: TextStyle = {
    color: theme.colors.foregroundMuted,
    fontSize: 11,
    fontWeight: "600",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  };

  const listItem: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    borderTopWidth: 1,
    borderTopColor: theme.colors.border,
    paddingTop: 10,
    paddingBottom: 2,
  };
  const row: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  };
  const chipRow: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6 };
  const grow: ViewStyle = { flex: 1, gap: 2 };
  const itemTitle: TextStyle = {
    color: theme.colors.foreground,
    fontSize: 14,
    fontWeight: "600",
  };
  const title: TextStyle = { color: theme.colors.foreground, fontSize: 15, fontWeight: "600" };
  const muted: TextStyle = { color: theme.colors.foregroundMuted, fontSize: 12 };
  const empty: TextStyle = {
    color: theme.colors.foregroundMuted,
    fontSize: 12,
    paddingVertical: 10,
  };
  const danger: TextStyle = { color: theme.colors.statusDanger, fontSize: 12 };
  const success: TextStyle = { color: theme.colors.statusSuccess, fontSize: 12 };

  const input: TextStyle = {
    borderColor: theme.colors.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface2,
    flex: 1,
  };
  const multiline: TextStyle = {
    borderColor: theme.colors.border,
    borderWidth: 1,
    paddingHorizontal: 10,
    paddingVertical: 8,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface2,
    minHeight: 64,
    textAlignVertical: "top",
  };
  const primary: ViewStyle = {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 14,
    paddingVertical: 9,
    alignItems: "center",
  };
  const primaryText: TextStyle = {
    color: theme.colors.accentForeground,
    fontSize: 13,
    fontWeight: "700",
  };
  const chipWork: ViewStyle = {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.accent,
  };
  const chipNeutral: ViewStyle = {
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 999,
    backgroundColor: theme.colors.surface2,
  };
  const chipLabel: TextStyle = { color: theme.colors.foreground, fontSize: 12, fontWeight: "600" };
  const chipLabelWork: TextStyle = {
    color: theme.colors.accentForeground,
    fontSize: 12,
    fontWeight: "600",
  };

  // Tokens and JSON are read character by character, so they get a monospace
  // face and their own box instead of the muted body style.
  const mono: TextStyle = {
    color: theme.colors.foregroundMuted,
    fontSize: 11,
    fontFamily: "monospace",
  };
  const tokenBox: ViewStyle = {
    backgroundColor: theme.colors.surface2,
    borderColor: theme.colors.border,
    borderWidth: 1,
    padding: 10,
    gap: 6,
  };

  // Event dots: one style per outcome so a row never builds a style array.
  const dotSuccess: ViewStyle = {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: theme.colors.statusSuccess,
  };
  const dotDanger: ViewStyle = {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: theme.colors.statusDanger,
  };
  const dotNeutral: ViewStyle = {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginTop: 6,
    backgroundColor: theme.colors.foregroundMuted,
  };

  return {
    screen,
    content,
    hero,
    heroBody,
    heroTitle,
    heroMeta,
    statRow,
    stat,
    statValue,
    statLabel,
    grid,
    cell,
    narrow,
    tabBar,
    tabItem,
    tabItemActive,
    tabLabel,
    tabLabelActive,
    tabCount,
    tabCountActive,
    card,
    cardHeader,
    cardTitle,
    cardMeta,
    sectionTitle,
    fieldLabel,
    listItem,
    row,
    chipRow,
    grow,
    itemTitle,
    title,
    muted,
    empty,
    danger,
    success,
    input,
    multiline,
    primary,
    primaryText,
    chipWork,
    chipNeutral,
    chipLabel,
    chipLabelWork,
    mono,
    tokenBox,
    dotSuccess,
    dotDanger,
    dotNeutral,
  };
}

export type Styles = ReturnType<typeof createStyles>;
