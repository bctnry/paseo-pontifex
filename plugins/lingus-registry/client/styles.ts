// Theme-derived styles for the registry screen.
//
// The repo lints with oxlint's react-perf rules as errors, so every object and
// function passed to JSX must be a stable reference. Styles are built once per
// theme in a `useMemo` (see `main.tsx`) and threaded through as a `styles` prop.
import type { PluginScreenProps } from "@getpaseo/plugin/client";
import type { TextStyle, ViewStyle } from "react-native";

export type PluginTheme = PluginScreenProps["theme"];

export function createStyles(theme: PluginTheme) {
  const screen: ViewStyle = { flex: 1, backgroundColor: theme.colors.surface0 };
  const content: ViewStyle = { padding: 16, gap: 16 };
  const sectionTitle: TextStyle = {
    color: theme.colors.foregroundMuted,
    fontSize: 12,
    fontWeight: "700",
    letterSpacing: 1,
    marginBottom: 8,
    textTransform: "uppercase",
  };
  const card: ViewStyle = {
    backgroundColor: theme.colors.surface1,
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 0,
    padding: 12,
    marginBottom: 12,
    gap: 8,
  };
  const row: ViewStyle = {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: 8,
  };
  const chipRow: ViewStyle = { flexDirection: "row", flexWrap: "wrap", gap: 6 };
  const grow: ViewStyle = { flex: 1 };
  const title: TextStyle = { color: theme.colors.foreground, fontSize: 15, fontWeight: "600" };
  const muted: TextStyle = { color: theme.colors.foregroundMuted, fontSize: 12 };
  const danger: TextStyle = { color: theme.colors.statusDanger, fontSize: 12 };
  const input: TextStyle = {
    borderColor: theme.colors.border,
    borderWidth: 1,
    borderRadius: 0,
    paddingHorizontal: 10,
    paddingVertical: 7,
    color: theme.colors.foreground,
    backgroundColor: theme.colors.surface2,
    flex: 1,
  };
  const primary: ViewStyle = {
    backgroundColor: theme.colors.accent,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 0,
  };
  const primaryText: TextStyle = { color: theme.colors.accentForeground, fontWeight: "600" };
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

  return {
    screen,
    content,
    sectionTitle,
    card,
    row,
    chipRow,
    grow,
    title,
    muted,
    danger,
    input,
    primary,
    primaryText,
    chipWork,
    chipNeutral,
    chipLabel,
    chipLabelWork,
  };
}

export type Styles = ReturnType<typeof createStyles>;
