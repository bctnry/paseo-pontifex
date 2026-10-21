import { lazy, Suspense } from "react";
import { View } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import type { Theme } from "@/styles/theme";
import type { FileEditorViewProps } from "./view.web.impl";

// CodeMirror only exists for source editing. Keep it out of the initial bundle;
// the file panel mounts this view the first time the user opens the editor.
const CodeMirrorEditor = lazy(() =>
  import("./view.web.impl").then((module) => ({ default: module.FileEditorView })),
);

const ThemedLoadingSpinner = withUnistyles(LoadingSpinner);
const spinnerColor = (theme: Theme) => ({ color: theme.colors.foregroundMuted });

export function FileEditorView(props: FileEditorViewProps) {
  return (
    <Suspense fallback={editorLoadingFallback}>
      <CodeMirrorEditor {...props} />
    </Suspense>
  );
}

const styles = StyleSheet.create((theme) => ({
  loading: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: theme.colors.surface0,
  },
}));

const editorLoadingFallback = (
  <View style={styles.loading}>
    <ThemedLoadingSpinner size="small" uniProps={spinnerColor} />
  </View>
);
