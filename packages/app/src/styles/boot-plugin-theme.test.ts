import type { PluginThemeContribution } from "@getpaseo/plugin";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { APP_SETTINGS_KEY } from "@/hooks/use-settings/keys";
import {
  clearBootPluginTheme,
  readBootPluginTheme,
  readBootThemeSettings,
  rememberBootPluginTheme,
} from "./boot-plugin-theme";
import { PLUGIN_THEME_NAMES, REGISTERED_THEMES } from "./theme";

const CONTRIBUTION: PluginThemeContribution = {
  id: "high-contrast-dark",
  name: "High Contrast Dark",
  appearance: "dark",
  colors: {
    background: "#101010",
    foreground: "#f5f5f5",
    raised: "#181818",
    control: "#242424",
    border: "#3a3a3a",
    accent: "#ffcc00",
    mutedForeground: "#b0b0b0",
    ring: "#ffffff",
  },
};

function installStorage(): Map<string, string> {
  const values = new Map<string, string>();
  vi.stubGlobal("window", {
    localStorage: {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    },
  });
  return values;
}

describe("boot plugin theme", () => {
  let values: Map<string, string>;

  beforeEach(() => {
    values = installStorage();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("restores the selected plugin theme before the settings query resolves", () => {
    rememberBootPluginTheme({
      id: "high-contrast/theme/high-contrast-dark",
      serverId: "host-a",
      contribution: CONTRIBUTION,
    });
    values.set(
      APP_SETTINGS_KEY,
      JSON.stringify({
        theme: "plugin",
        pluginThemeId: "high-contrast/theme/high-contrast-dark",
      }),
    );

    expect(readBootThemeSettings()).toEqual({
      initialTheme: PLUGIN_THEME_NAMES.dark,
    });
    expect(REGISTERED_THEMES[PLUGIN_THEME_NAMES.dark].colors.surface0).toBe(
      CONTRIBUTION.colors.background,
    );
    expect(readBootPluginTheme()).toMatchObject({
      id: "high-contrast/theme/high-contrast-dark",
      name: "High Contrast Dark",
      contribution: CONTRIBUTION,
    });
  });

  it("ignores a cached theme for a different plugin theme id", () => {
    rememberBootPluginTheme({
      id: "high-contrast/theme/high-contrast-dark",
      serverId: "host-a",
      contribution: CONTRIBUTION,
    });
    values.set(
      APP_SETTINGS_KEY,
      JSON.stringify({
        theme: "plugin",
        pluginThemeId: "high-contrast/theme/high-contrast-light",
      }),
    );

    expect(readBootThemeSettings()).toEqual({ adaptiveThemes: true });
  });

  it("uses the synchronous built-in preference", () => {
    values.set(APP_SETTINGS_KEY, JSON.stringify({ theme: "midnight" }));

    expect(readBootThemeSettings()).toEqual({ initialTheme: "darkMidnight" });
  });

  it("clears a stale contribution", () => {
    rememberBootPluginTheme({
      id: "high-contrast/theme/high-contrast-dark",
      serverId: "host-a",
      contribution: CONTRIBUTION,
    });
    clearBootPluginTheme();

    expect(readBootPluginTheme()).toBeNull();
    expect(readBootThemeSettings()).toEqual({ adaptiveThemes: true });
  });
});
