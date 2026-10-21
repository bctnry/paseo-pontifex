import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { SidebarTopTextMark } from "@/components/icons/sidebar-top-text-mark";
import { TitlebarDragRegion } from "@/components/desktop/titlebar-drag-region";
import { density } from "@/styles/density";
import type { Theme } from "@/styles/theme";

const ThemedSidebarTopTextMark = withUnistyles(SidebarTopTextMark);
const accentForegroundMapping = (theme: Theme) => ({ color: theme.colors.accentForeground });

/** The frameless desktop titlebar stand-in at the top of a sidebar. */
export function SidebarTopStrip({ testID = "sidebar-top-strip" }: { testID?: string }) {
  return (
    <View style={styles.strip} testID={testID}>
      <ThemedSidebarTopTextMark uniProps={accentForegroundMapping} />
      <TitlebarDragRegion />
    </View>
  );
}

const styles = StyleSheet.create((theme) => ({
  strip: {
    // Match the navigation rows below while keeping the wordmark clear of the edges.
    height: density.tightRowHeight,
    alignItems: "center",
    justifyContent: "center",
    paddingHorizontal: theme.spacing[4],
    paddingVertical: theme.spacing[1],
    backgroundColor: theme.colors.accent,
    userSelect: "none",
  },
}));
