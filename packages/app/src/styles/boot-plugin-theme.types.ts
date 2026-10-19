import type { PluginThemeContribution } from "@getpaseo/plugin";
import type { Theme } from "./plugin-theme";
import { REGISTERED_THEMES } from "./theme";

export interface BootPluginTheme {
  id: string;
  serverId: string;
  name: string;
  swatch: string;
  theme: Theme;
  contribution: PluginThemeContribution;
}

export type BootThemeSettings =
  | { adaptiveThemes: true }
  | { initialTheme: keyof typeof REGISTERED_THEMES };

export interface BootPluginThemeSource {
  id: string;
  serverId: string;
  contribution: PluginThemeContribution;
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
