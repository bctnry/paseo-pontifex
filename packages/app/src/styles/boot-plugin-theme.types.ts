import type { PluginText, PluginThemeContribution } from "@getpaseo/plugin";
import type { Theme } from "./plugin-theme";
import { REGISTERED_THEMES } from "./theme";

export interface BootPluginTheme {
  id: string;
  serverId: string;
  name: string;
  swatch: string;
  theme: Theme;
  contribution: PluginThemeContribution<PluginText>;
}

export type BootThemeSettings =
  | { adaptiveThemes: true }
  | { initialTheme: keyof typeof REGISTERED_THEMES };

export interface BootPluginThemeSource {
  id: string;
  serverId: string;
  /** Resolved name, so the boot cache does not need the plugin translation runtime. */
  name?: string;
  contribution: PluginThemeContribution<PluginText>;
}

export interface BootCustomTheme {
  id: string;
  name: string;
  swatch: string;
  theme: Theme;
  contribution: PluginThemeContribution;
}

export interface BootCustomThemeSource {
  id: string;
  contribution: PluginThemeContribution;
}
