import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { UnistylesRuntime } from "react-native-unistyles";
import {
  DEFAULT_THEME_PREFERENCE,
  resolveContentMaxWidth,
  useAppSettings,
  type AppSettings,
} from "@/hooks/use-settings";
import {
  rememberPluginThemeHost,
  usePluginThemeCatalog,
  type PluginThemeOption,
} from "@/plugins/themes";
import {
  clearBootCustomTheme,
  clearBootPluginTheme,
  readBootCustomTheme,
  readBootPluginTheme,
  rememberBootCustomTheme,
  rememberBootPluginTheme,
} from "@/styles/boot-plugin-theme";
import {
  CUSTOM_THEME_PREFERENCE,
  PLUGIN_THEME_NAMES,
  PLUGIN_THEME_PREFERENCE,
  THEME_TO_UNISTYLES,
} from "@/styles/theme";
import { applyAppearance } from "./apply";
import { useCustomThemeCatalog } from "./custom-themes";
import { AppearanceSystemBars } from "./system-bars";

interface ContributedThemes {
  options: PluginThemeOption[];
  selected: PluginThemeOption | null;
  select: (option: PluginThemeOption) => void;
}

type AppliedTheme = Pick<PluginThemeOption, "theme">;

interface ApplyThemeInput {
  preference: AppSettings["theme"];
  contributedTheme: AppliedTheme | null;
}

const ContributedThemesContext = createContext<ContributedThemes | null>(null);

function applyTheme({ preference, contributedTheme }: ApplyThemeInput): void {
  if (contributedTheme) {
    const themeName = PLUGIN_THEME_NAMES[contributedTheme.theme.colorScheme];
    UnistylesRuntime.updateTheme(themeName, () => contributedTheme.theme);
    UnistylesRuntime.setAdaptiveThemes(false);
    UnistylesRuntime.setTheme(themeName);
    return;
  }

  const builtInPreference =
    preference === PLUGIN_THEME_PREFERENCE || preference === CUSTOM_THEME_PREFERENCE
      ? DEFAULT_THEME_PREFERENCE
      : preference;
  if (builtInPreference === "auto") {
    UnistylesRuntime.setAdaptiveThemes(true);
    return;
  }

  UnistylesRuntime.setAdaptiveThemes(false);
  UnistylesRuntime.setTheme(THEME_TO_UNISTYLES[builtInPreference]);
}

export function AppearanceProvider({ children }: { children: ReactNode }) {
  const { settings, updateSettings, isLoading } = useAppSettings();
  const [hasAppliedAppearance, setHasAppliedAppearance] = useState(false);
  const bootPluginTheme = useMemo(() => {
    if (settings.theme !== PLUGIN_THEME_PREFERENCE) return null;
    const stored = readBootPluginTheme();
    return stored && stored.id === settings.pluginThemeId ? stored : null;
  }, [settings.pluginThemeId, settings.theme]);
  const bootCustomTheme = useMemo(() => {
    if (settings.theme !== CUSTOM_THEME_PREFERENCE) return null;
    const stored = readBootCustomTheme();
    return stored && stored.id === settings.customThemeId ? stored : null;
  }, [settings.customThemeId, settings.theme]);
  const { options: pluginOptions, ready: pluginCatalogReady } = usePluginThemeCatalog(
    bootPluginTheme?.serverId,
  );
  const { options: customOptions, ready: customCatalogReady } = useCustomThemeCatalog();
  const selectedPluginTheme = useMemo(() => {
    if (settings.theme !== PLUGIN_THEME_PREFERENCE) return null;
    return (
      pluginOptions.find((option) => option.id === settings.pluginThemeId) ??
      (pluginCatalogReady ? null : bootPluginTheme)
    );
  }, [bootPluginTheme, pluginCatalogReady, pluginOptions, settings.pluginThemeId, settings.theme]);
  const selectedCustomTheme = useMemo(() => {
    if (settings.theme !== CUSTOM_THEME_PREFERENCE) return null;
    return (
      customOptions.find((option) => option.id === settings.customThemeId) ??
      (customCatalogReady ? null : bootCustomTheme)
    );
  }, [bootCustomTheme, customCatalogReady, customOptions, settings.customThemeId, settings.theme]);
  const selectedTheme = selectedPluginTheme ?? selectedCustomTheme;

  useEffect(() => {
    if (isLoading) return;
    applyTheme({ preference: settings.theme, contributedTheme: selectedTheme });
    applyAppearance({
      uiFontFamily: settings.uiFontFamily,
      monoFontFamily: settings.monoFontFamily,
      uiBaseFontSize: settings.uiBaseFontSize,
      contentFontSize: settings.contentFontSize,
      codeFontSize: settings.codeFontSize,
      contentMaxWidth: resolveContentMaxWidth({ contentMaxWidth: settings.contentMaxWidth }),
      syntaxTheme: settings.syntaxTheme,
    });
    const livePluginTheme = pluginOptions.find((option) => option.id === settings.pluginThemeId);
    if (settings.theme === PLUGIN_THEME_PREFERENCE) {
      if (livePluginTheme) {
        rememberBootPluginTheme({
          id: livePluginTheme.id,
          serverId: livePluginTheme.serverId,
          contribution: livePluginTheme.contribution,
        });
      } else if (pluginCatalogReady) {
        clearBootPluginTheme();
      }
    } else {
      clearBootPluginTheme();
    }
    const liveCustomTheme = customOptions.find((option) => option.id === settings.customThemeId);
    if (settings.theme === CUSTOM_THEME_PREFERENCE) {
      if (liveCustomTheme) {
        rememberBootCustomTheme({
          id: liveCustomTheme.id,
          contribution: liveCustomTheme.contribution,
        });
      } else if (customCatalogReady) {
        clearBootCustomTheme();
      }
    } else {
      clearBootCustomTheme();
    }
    setHasAppliedAppearance(true);
  }, [
    customCatalogReady,
    customOptions,
    isLoading,
    pluginCatalogReady,
    pluginOptions,
    selectedTheme,
    settings.customThemeId,
    settings.theme,
    settings.uiFontFamily,
    settings.monoFontFamily,
    settings.uiBaseFontSize,
    settings.contentFontSize,
    settings.codeFontSize,
    settings.contentMaxWidth,
    settings.syntaxTheme,
    settings.pluginThemeId,
  ]);

  const select = useCallback(
    (option: PluginThemeOption) => {
      rememberPluginThemeHost(option);
      void updateSettings({
        theme: PLUGIN_THEME_PREFERENCE,
        pluginThemeId: option.id,
      });
    },
    [updateSettings],
  );
  const value = useMemo(
    () => ({ options: pluginOptions, selected: selectedPluginTheme, select }),
    [pluginOptions, selectedPluginTheme, select],
  );

  // The first settings load changes appearance keys. Mount screens only after applying it
  // so startup does not destroy and recreate an already-visible workspace.
  if (!hasAppliedAppearance) return null;

  return (
    <ContributedThemesContext.Provider value={value}>
      <AppearanceSystemBars />
      {children}
    </ContributedThemesContext.Provider>
  );
}

export function useContributedThemes(): ContributedThemes {
  const themes = useContext(ContributedThemesContext);
  if (themes === null) throw new Error("useContributedThemes requires AppearanceProvider");
  return themes;
}
