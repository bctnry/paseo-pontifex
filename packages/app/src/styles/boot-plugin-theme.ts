import type {
  BootCustomTheme,
  BootCustomThemeSource,
  BootPluginTheme,
  BootPluginThemeSource,
  BootThemeSettings,
} from "./boot-plugin-theme.types";

export type {
  BootCustomTheme,
  BootCustomThemeSource,
  BootPluginTheme,
  BootPluginThemeSource,
  BootThemeSettings,
};

// Native has no synchronous settings store. The async settings gate already runs before
// screens mount, and the bridge exposes the settings as soon as the query resolves.
export function readBootPluginTheme(): BootPluginTheme | null {
  return null;
}

export function rememberBootPluginTheme(_input: BootPluginThemeSource): void {}

export function clearBootPluginTheme(): void {}

export function readBootCustomTheme(): BootCustomTheme | null {
  return null;
}

export function rememberBootCustomTheme(_input: BootCustomThemeSource): void {}

export function clearBootCustomTheme(): void {}

export function readBootThemeSettings(): BootThemeSettings {
  return { adaptiveThemes: true };
}
