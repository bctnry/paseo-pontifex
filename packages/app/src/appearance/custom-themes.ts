import { useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect } from "react";
import { getIsElectron } from "@/constants/platform";
import { useFetchQuery } from "@/data/query";
import { getDesktopHost, type DesktopThemesBridge } from "@/desktop/host";
import { parseCustomThemeFile, type CustomThemeOption } from "@/styles/custom-theme";

export const CUSTOM_THEMES_QUERY_KEY = ["custom-themes"] as const;

export interface CustomThemeFileError {
  fileName: string;
  message: string;
}

export interface CustomThemeCatalogData {
  themes: CustomThemeOption[];
  errors: CustomThemeFileError[];
}

export interface CustomThemeCatalog {
  options: CustomThemeOption[];
  errors: CustomThemeFileError[];
  /** True once the desktop theme directory has been read, or when this is not desktop. */
  ready: boolean;
  loading: boolean;
  error: unknown;
  refresh(): void;
  save(fileName: string, content: string): Promise<void>;
  remove(fileName: string): Promise<void>;
  openFolder(): Promise<void>;
}

function themesBridge(): DesktopThemesBridge | null {
  return getDesktopHost()?.themes ?? null;
}

function requireThemesBridge(): DesktopThemesBridge {
  const bridge = themesBridge();
  if (!bridge) throw new Error("Desktop theme files are unavailable in this environment.");
  return bridge;
}

export async function loadCustomThemes(): Promise<CustomThemeCatalogData> {
  const bridge = themesBridge();
  if (!bridge?.list || !bridge.read) return { themes: [], errors: [] };
  const files = await bridge.list();
  const results: Array<{ theme?: CustomThemeOption; error?: CustomThemeFileError }> =
    await Promise.all(
      files.map(async (fileName) => {
        try {
          const raw = await bridge.read!(fileName);
          return { theme: parseCustomThemeFile(fileName, raw) };
        } catch (error) {
          return {
            error: {
              fileName,
              message: error instanceof Error ? error.message : String(error),
            },
          };
        }
      }),
    );
  const themes: CustomThemeOption[] = [];
  const errors: CustomThemeFileError[] = [];
  for (const result of results) {
    if (result.theme) themes.push(result.theme);
    else if (result.error) errors.push(result.error);
  }
  return { themes, errors };
}

export async function saveCustomThemeFile(fileName: string, content: string): Promise<void> {
  const bridge = requireThemesBridge();
  if (!bridge.save) throw new Error("Saving desktop theme files is unavailable.");
  await bridge.save(fileName, content);
}

export async function removeCustomThemeFile(fileName: string): Promise<void> {
  const bridge = requireThemesBridge();
  if (!bridge.remove) throw new Error("Removing desktop theme files is unavailable.");
  await bridge.remove(fileName);
}

export async function openCustomThemesFolder(): Promise<void> {
  const bridge = requireThemesBridge();
  if (!bridge.openFolder) throw new Error("Opening the desktop themes folder is unavailable.");
  await bridge.openFolder();
}

export function useCustomThemeCatalog(): CustomThemeCatalog {
  const queryClient = useQueryClient();
  const bridge = themesBridge();
  const enabled = getIsElectron() && Boolean(bridge?.list && bridge.read);
  const query = useFetchQuery({
    queryKey: CUSTOM_THEMES_QUERY_KEY,
    queryFn: loadCustomThemes,
    enabled,
    dataShape: "list",
    staleTimeMs: 0,
  });

  useEffect(() => {
    if (!enabled || !bridge?.onChanged) return;
    let cancelled = false;
    let dispose: (() => void) | undefined;
    const subscription = bridge.onChanged(() => {
      void queryClient.invalidateQueries({ queryKey: CUSTOM_THEMES_QUERY_KEY });
    });
    if (subscription) {
      void Promise.resolve(subscription).then((unsubscribe) => {
        if (cancelled) unsubscribe();
        else dispose = unsubscribe;
        return undefined;
      });
    }
    return () => {
      cancelled = true;
      dispose?.();
    };
  }, [bridge, enabled, queryClient]);

  const refresh = useCallback(() => {
    if (enabled) void query.refetch();
  }, [enabled, query]);

  const save = useCallback(
    async (fileName: string, content: string) => {
      await saveCustomThemeFile(fileName, content);
      await queryClient.invalidateQueries({ queryKey: CUSTOM_THEMES_QUERY_KEY });
    },
    [queryClient],
  );

  const remove = useCallback(
    async (fileName: string) => {
      await removeCustomThemeFile(fileName);
      await queryClient.invalidateQueries({ queryKey: CUSTOM_THEMES_QUERY_KEY });
    },
    [queryClient],
  );

  return {
    options: query.data?.themes ?? [],
    errors: query.data?.errors ?? [],
    ready: !enabled || !query.isPending,
    loading: enabled && query.isPending,
    error: query.error,
    refresh,
    save,
    remove,
    openFolder: openCustomThemesFolder,
  };
}
