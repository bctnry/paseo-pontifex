import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useTranslation } from "react-i18next";
import { Text, View, type PressableStateCallbackType } from "react-native";
import { StyleSheet, withUnistyles } from "react-native-unistyles";
import { FolderTree, X } from "lucide-react-native";
import { FileExplorerPane } from "@/components/file-explorer-pane";
import { PressHighlight } from "@/components/ui/press-highlight";
import { LoadingSpinner } from "@/components/ui/loading-spinner";
import { isWeb } from "@/constants/platform";
import { useSessionStore } from "@/stores/session-store";
import { decodeUtf8 } from "@/utils/decode-utf8";
import { FileSourceView } from "@/file-panels/source/readonly/view";
import { selectSourcePresentation } from "@/file-panels/source/readonly/presentation";
import type { Theme } from "@/styles/theme";

const MAX_PREVIEW_BYTES = 2 * 1024 * 1024;
const sourceAppearance = (theme: Theme) => ({
  theme: {
    colorScheme: theme.colorScheme,
    background: theme.colors.surface0,
    foreground: theme.colors.foreground,
    cursor: theme.colors.terminal.cursor,
    foregroundMuted: theme.colors.foregroundMuted,
    border: theme.colors.border,
    selection: theme.colors.terminal.selectionBackground,
    monoFont: theme.fontFamily.mono,
    codeFontSize: theme.fontSize.code,
    syntax: theme.colors.syntax,
  },
});
const ThemedFileSourceView = withUnistyles(FileSourceView, sourceAppearance);

/**
 * The new workspace screen's file tree, scoped to the selected project directory. It is the same
 * Explorer panel the workspace uses, without a workspace id: the daemon can list a root path
 * before the workspace exists.
 */
export function NewWorkspaceExplorer({
  serverId,
  rootPath,
  onClose,
  onOpenFile,
}: {
  serverId: string;
  rootPath: string;
  onClose: () => void;
  onOpenFile: (path: string) => void;
}) {
  const { t } = useTranslation();
  return (
    <View style={styles.explorer} testID="new-workspace-explorer">
      <View style={styles.explorerHeader}>
        <Text style={styles.explorerTitle}>{t("newWorkspace.explorer.title")}</Text>
        <PressHighlight
          accessibilityRole="button"
          accessibilityLabel={t("newWorkspace.explorer.close")}
          onPress={onClose}
          style={styles.closeButton}
          testID="new-workspace-explorer-close"
        >
          <X size={14} color={styles.mutedIcon.color} />
        </PressHighlight>
      </View>
      <FileExplorerPane
        serverId={serverId}
        workspaceRoot={rootPath}
        readOnly
        onOpenFile={onOpenFile}
      />
    </View>
  );
}

type PreviewState =
  | { status: "loading" }
  | { status: "error"; message: string }
  | { status: "ready"; content: string; size: number }
  | { status: "unsupported"; reason: "binary" | "large" };

function isTextMime(mime: string): boolean {
  return (
    mime.startsWith("text/") ||
    /(json|xml|javascript|typescript|yaml|toml|markdown|x-sh|shellscript)/.test(mime)
  );
}

export function NewWorkspaceFilePreview({
  serverId,
  rootPath,
  path,
  onClose,
}: {
  serverId: string;
  rootPath: string;
  path: string;
  onClose: () => void;
}) {
  const { t } = useTranslation();
  const client = useSessionStore((state) => state.sessions[serverId]?.client ?? null);
  const [state, setState] = useState<PreviewState>({ status: "loading" });

  useEffect(() => {
    if (!client) {
      setState({ status: "error", message: t("newWorkspace.explorer.disconnected") });
      return;
    }
    let cancelled = false;
    setState({ status: "loading" });
    client
      .readFile(rootPath, path, undefined, MAX_PREVIEW_BYTES, 0)
      .then((result) => {
        if (cancelled) return null;
        if (!isTextMime(result.mime)) {
          setState({ status: "unsupported", reason: "binary" });
          return null;
        }
        if (result.size > MAX_PREVIEW_BYTES) {
          setState({ status: "unsupported", reason: "large" });
          return null;
        }
        setState({ status: "ready", content: decodeUtf8(result.bytes), size: result.size });
        return null;
      })
      .catch((error: unknown) => {
        if (cancelled) return;
        setState({
          status: "error",
          message: error instanceof Error ? error.message : t("newWorkspace.explorer.readFailed"),
        });
      });
    return () => {
      cancelled = true;
    };
  }, [client, path, rootPath, t]);

  const presentation = useMemo(
    () =>
      state.status === "ready"
        ? selectSourcePresentation({ size: state.size, platform: isWeb ? "web" : "native" })
        : null,
    [state],
  );
  const filename = useMemo(() => path.split("/").findLast(Boolean) ?? path, [path]);
  const location = useMemo(() => ({ path }), [path]);

  let body: ReactNode;
  if (state.status === "loading") {
    body = (
      <View style={styles.previewState}>
        <LoadingSpinner size="small" color={styles.mutedIcon.color} />
      </View>
    );
  } else if (state.status === "error") {
    body = (
      <View style={styles.previewState}>
        <Text style={styles.previewMessage}>{state.message}</Text>
      </View>
    );
  } else if (state.status === "unsupported") {
    const message =
      state.reason === "large"
        ? t("newWorkspace.explorer.tooLarge")
        : t("newWorkspace.explorer.binary");
    body = (
      <View style={styles.previewState}>
        <Text style={styles.previewMessage}>{message}</Text>
      </View>
    );
  } else if (presentation === "unsupported") {
    body = (
      <View style={styles.previewState}>
        <Text style={styles.previewMessage}>{t("newWorkspace.explorer.tooLarge")}</Text>
      </View>
    );
  } else {
    body = (
      <ThemedFileSourceView
        content={state.content}
        filename={filename}
        location={location}
        navigationRevision={0}
        presentation={presentation ?? "plain"}
      />
    );
  }

  return (
    <View style={styles.preview} testID="new-workspace-file-preview">
      <View style={styles.previewHeader}>
        <Text style={styles.previewTitle} numberOfLines={1}>
          {path}
        </Text>
        <PressHighlight
          accessibilityRole="button"
          accessibilityLabel={t("newWorkspace.explorer.closePreview")}
          onPress={onClose}
          style={styles.closeButton}
          testID="new-workspace-file-preview-close"
        >
          <X size={14} color={styles.mutedIcon.color} />
        </PressHighlight>
      </View>
      {body}
    </View>
  );
}

export interface NewWorkspaceExplorerLayer {
  explorer: ReactNode;
  preview: ReactNode;
  isOpen: boolean;
  toggle?: () => void;
}

/**
 * Owns the New Workspace explorer's open/preview state so the screen itself stays a thin
 * composition. The root path is the only scope: there is no workspace id until creation finishes.
 */
export function useNewWorkspaceExplorerLayer(input: {
  serverId: string;
  rootPath: string | null;
}): NewWorkspaceExplorerLayer {
  const [isOpen, setIsOpen] = useState(false);
  const [previewPath, setPreviewPath] = useState<string | null>(null);
  const toggle = useCallback(() => {
    if (!input.rootPath) return;
    setPreviewPath(null);
    setIsOpen((current) => !current);
  }, [input.rootPath]);
  const close = useCallback(() => {
    setPreviewPath(null);
    setIsOpen(false);
  }, []);
  const closePreview = useCallback(() => setPreviewPath(null), []);

  useEffect(() => {
    setPreviewPath(null);
    setIsOpen(false);
  }, [input.rootPath, input.serverId]);

  const explorer = input.rootPath ? (
    <NewWorkspaceExplorer
      serverId={input.serverId}
      rootPath={input.rootPath}
      onClose={close}
      onOpenFile={setPreviewPath}
    />
  ) : null;
  const preview =
    previewPath && input.rootPath ? (
      <View style={styles.previewOverlay}>
        <NewWorkspaceFilePreview
          serverId={input.serverId}
          rootPath={input.rootPath}
          path={previewPath}
          onClose={closePreview}
        />
      </View>
    ) : null;

  return { explorer, preview, isOpen, toggle: input.rootPath ? toggle : undefined };
}

export function NewWorkspaceExplorerToggle({
  onPress,
  active,
}: {
  onPress: () => void;
  active: boolean;
}) {
  const { t } = useTranslation();
  const buttonStyle = useCallback(
    ({ hovered, pressed }: PressableStateCallbackType & { hovered?: boolean }) => [
      styles.toggleButton,
      hovered && styles.toggleButtonHovered,
      pressed && styles.toggleButtonPressed,
      active && styles.toggleButtonActive,
    ],
    [active],
  );
  return (
    <PressHighlight
      accessibilityRole="button"
      accessibilityLabel={t("newWorkspace.explorer.open")}
      onPress={onPress}
      style={buttonStyle}
      testID="new-workspace-explorer-toggle"
    >
      <FolderTree size={16} color={styles.mutedIcon.color} />
    </PressHighlight>
  );
}

const styles = StyleSheet.create((theme) => ({
  explorer: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surfaceSidebar,
  },
  explorerHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  explorerTitle: {
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
    fontWeight: theme.fontWeight.medium,
  },
  closeButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  mutedIcon: {
    color: theme.colors.foregroundMuted,
  },
  preview: {
    flex: 1,
    minHeight: 0,
    backgroundColor: theme.colors.surface0,
  },
  previewOverlay: {
    position: "absolute",
    top: 0,
    bottom: 0,
    left: 0,
    right: 0,
    zIndex: 10,
    backgroundColor: theme.colors.surface0,
  },
  toggleButton: {
    width: 28,
    height: 28,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: theme.borderRadius.md,
  },
  toggleButtonHovered: {
    backgroundColor: theme.colors.surface1,
  },
  toggleButtonPressed: {
    backgroundColor: theme.colors.surface2,
  },
  toggleButtonActive: {
    backgroundColor: theme.colors.surface2,
  },
  previewHeader: {
    minHeight: 40,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    gap: theme.spacing[2],
    paddingHorizontal: theme.spacing[3],
    borderBottomWidth: 1,
    borderBottomColor: theme.colors.border,
  },
  previewTitle: {
    flex: 1,
    minWidth: 0,
    color: theme.colors.foreground,
    fontSize: theme.fontSize.sm,
  },
  previewState: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    padding: theme.spacing[4],
  },
  previewMessage: {
    color: theme.colors.foregroundMuted,
    fontSize: theme.fontSize.sm,
    textAlign: "center",
  },
}));
