import type { PluginThemeContribution } from "@getpaseo/plugin";
import { z } from "zod";
import { buildPluginTheme, themeColorsSchema, type Theme } from "./plugin-theme";
import { PONTIFEX_DARK_PALETTE, PONTIFEX_LIGHT_PALETTE, type ThemePalette } from "./theme-palettes";

export const CUSTOM_THEME_COLOR_KEYS = [
  "background",
  "foreground",
  "raised",
  "control",
  "border",
  "accent",
  "mutedForeground",
  "ring",
] as const;

export type CustomThemeColorKey = (typeof CUSTOM_THEME_COLOR_KEYS)[number];

const customThemeFileSchema = z.strictObject({
  version: z.literal(1).optional(),
  name: z.string().trim().min(1).max(60),
  appearance: z.enum(["light", "dark"]),
  colors: themeColorsSchema,
});

export interface CustomThemeFile {
  version: 1;
  name: string;
  appearance: "light" | "dark";
  colors: ThemePalette;
}

export interface CustomThemeOption {
  id: string;
  fileName: string;
  name: string;
  swatch: string;
  theme: Theme;
  contribution: PluginThemeContribution;
}

export const CUSTOM_THEME_FILE_EXTENSION = ".json";

export function customThemeIdFromFileName(fileName: string): string {
  return fileName.slice(0, -CUSTOM_THEME_FILE_EXTENSION.length);
}

export function parseCustomThemeFile(fileName: string, raw: string | unknown): CustomThemeOption {
  let decoded: unknown = raw;
  if (typeof raw === "string") {
    try {
      decoded = JSON.parse(raw);
    } catch {
      throw new Error("Theme file is not valid JSON.");
    }
  }
  const parsed = customThemeFileSchema.safeParse(decoded);
  if (!parsed.success) {
    const detail = parsed.error.issues
      .map((issue) => `${issue.path.join(".") || "root"}: ${issue.message}`)
      .join("; ");
    throw new Error(`Invalid theme file: ${detail}`);
  }
  const id = customThemeIdFromFileName(fileName);
  const contribution: PluginThemeContribution = {
    id,
    name: parsed.data.name,
    appearance: parsed.data.appearance,
    colors: parsed.data.colors,
  };
  return {
    id,
    fileName,
    name: contribution.name,
    swatch: contribution.colors.background,
    theme: buildPluginTheme(contribution),
    contribution,
  };
}

export function serializeCustomThemeFile(file: CustomThemeFile): string {
  return `${JSON.stringify(file, null, 2)}\n`;
}

export function customThemeFileFromOption(option: CustomThemeOption): CustomThemeFile {
  return {
    version: 1,
    name: option.name,
    appearance: option.contribution.appearance,
    colors: paletteFromOption(option),
  };
}

export function paletteFromOption(option: CustomThemeOption): ThemePalette {
  return {
    ...option.contribution.colors,
    accent: option.contribution.colors.accent ?? option.contribution.colors.foreground,
  };
}

export function paletteFromTheme(theme: Theme): ThemePalette {
  return {
    background: theme.colors.surface0,
    foreground: theme.colors.foreground,
    raised: theme.colors.surface1,
    control: theme.colors.surface2,
    border: theme.colors.border,
    accent: theme.colors.accent,
    mutedForeground: theme.colors.foregroundMuted,
    ring: theme.colors.ring,
  };
}

export function customThemeFileFromPalette(
  name: string,
  appearance: "light" | "dark",
  colors: ThemePalette,
): CustomThemeFile {
  return {
    version: 1,
    name,
    appearance,
    colors: {
      ...colors,
      accent: colors.accent ?? colors.foreground,
    },
  };
}

export function customThemeFileName(name: string, existingFileNames: ReadonlySet<string>): string {
  const base =
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || "theme";
  let candidate = `${base}${CUSTOM_THEME_FILE_EXTENSION}`;
  let suffix = 2;
  while (existingFileNames.has(candidate)) {
    candidate = `${base}-${suffix}${CUSTOM_THEME_FILE_EXTENSION}`;
    suffix += 1;
  }
  return candidate;
}

export function newCustomThemeTemplate(appearance: "light" | "dark" = "dark"): CustomThemeFile {
  return {
    version: 1,
    name: "My theme",
    appearance,
    colors: {
      ...(appearance === "dark" ? PONTIFEX_DARK_PALETTE : PONTIFEX_LIGHT_PALETTE),
    },
  };
}
