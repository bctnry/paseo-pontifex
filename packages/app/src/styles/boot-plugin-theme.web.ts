import type { PluginThemeContribution } from "@getpaseo/plugin";
import { APP_SETTINGS_KEY } from "@/hooks/use-settings/keys";
import type {
  BootPluginTheme,
  BootPluginThemeSource,
  BootThemeSettings,
} from "./boot-plugin-theme.types";
import { buildPluginTheme, parsePluginThemeContribution } from "./plugin-theme";
import {
  PLUGIN_THEME_NAMES,
  PLUGIN_THEME_PREFERENCE,
  REGISTERED_THEMES,
  THEME_TO_UNISTYLES,
  type ThemeName,
} from "./theme";

const BOOT_PLUGIN_THEME_KEY = "@paseo:boot-plugin-theme";
const BOOT_PLUGIN_THEME_VERSION = 1;

interface StoredBootPluginTheme {
  version: number;
  id: string;
  serverId: string;
  contribution: PluginThemeContribution;
}

function readStorage(): Storage | null {
  try {
    return typeof window === "undefined" ? null : window.localStorage;
  } catch {
    return null;
  }
}

function readStoredSettings(): { theme?: unknown; pluginThemeId?: unknown } | null {
  const raw = readStorage()?.getItem(APP_SETTINGS_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    return typeof parsed === "object" && parsed !== null ? parsed : null;
  } catch {
    return null;
  }
}

function buildBootPluginTheme(stored: StoredBootPluginTheme): BootPluginTheme {
  return {
    id: stored.id,
    serverId: stored.serverId,
    name: stored.contribution.name,
    swatch: stored.contribution.colors.background,
    theme: buildPluginTheme(stored.contribution),
    contribution: stored.contribution,
  };
}

export function readBootPluginTheme(): BootPluginTheme | null {
  const raw = readStorage()?.getItem(BOOT_PLUGIN_THEME_KEY);
  if (!raw) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== "object" || parsed === null) return null;
    const record = parsed as Record<string, unknown>;
    if (record.version !== BOOT_PLUGIN_THEME_VERSION) return null;
    if (typeof record.id !== "string" || typeof record.serverId !== "string") return null;
    return buildBootPluginTheme({
      version: BOOT_PLUGIN_THEME_VERSION,
      id: record.id,
      serverId: record.serverId,
      contribution: parsePluginThemeContribution(record.contribution),
    });
  } catch {
    return null;
  }
}

export function rememberBootPluginTheme(input: BootPluginThemeSource): void {
  const stored: StoredBootPluginTheme = {
    version: BOOT_PLUGIN_THEME_VERSION,
    id: input.id,
    serverId: input.serverId,
    contribution: input.contribution,
  };
  try {
    readStorage()?.setItem(BOOT_PLUGIN_THEME_KEY, JSON.stringify(stored));
  } catch {
    // A full or disabled localStorage must not break applying the live theme.
  }
}

export function clearBootPluginTheme(): void {
  try {
    readStorage()?.removeItem(BOOT_PLUGIN_THEME_KEY);
  } catch {
    // See rememberBootPluginTheme.
  }
}

/**
 * Seeds Unistyles before the first render. AsyncStorage is synchronous localStorage on web, so
 * the persisted theme is available here while the React settings query is still pending.
 */
export function readBootThemeSettings(): BootThemeSettings {
  const settings = readStoredSettings();
  const preference = settings?.theme;

  if (preference === PLUGIN_THEME_PREFERENCE) {
    const pluginTheme = readBootPluginTheme();
    if (pluginTheme && pluginTheme.id === settings?.pluginThemeId) {
      const unistylesName = PLUGIN_THEME_NAMES[pluginTheme.theme.colorScheme];
      REGISTERED_THEMES[unistylesName] = pluginTheme.theme;
      return { initialTheme: unistylesName };
    }
    return { adaptiveThemes: true };
  }

  if (typeof preference === "string" && preference in THEME_TO_UNISTYLES) {
    return { initialTheme: THEME_TO_UNISTYLES[preference as ThemeName] };
  }

  return { adaptiveThemes: true };
}
