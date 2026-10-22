import type { PluginMessage, PluginText, PluginThemeContribution } from "@getpaseo/plugin";
import { isPluginMessage } from "@getpaseo/plugin/client/host";
import { z } from "zod";
import { buildThemeFromPalette, type Theme } from "./theme";

export type { Theme } from "./theme";

export const HEX_COLOR_PATTERN = /^#(?:[0-9a-fA-F]{3}|[0-9a-fA-F]{6}|[0-9a-fA-F]{8})$/;

const hexColorSchema = z.string().regex(HEX_COLOR_PATTERN, "Must be a hex color");

export const themeColorsSchema = z.strictObject({
  background: hexColorSchema,
  foreground: hexColorSchema,
  raised: hexColorSchema,
  control: hexColorSchema,
  border: hexColorSchema,
  accent: hexColorSchema.optional(),
  mutedForeground: hexColorSchema,
  ring: hexColorSchema,
});

const contributionSchema: z.ZodType<PluginThemeContribution<PluginText>> = z.strictObject({
  id: z.string(),
  name: z.union([z.string().trim().min(1).max(60), z.custom<PluginMessage>(isPluginMessage)]),
  appearance: z.enum(["light", "dark"]),
  colors: themeColorsSchema,
});

export function parsePluginThemeContribution(value: unknown): PluginThemeContribution<PluginText> {
  return contributionSchema.parse(value);
}

export function buildPluginTheme(contribution: PluginThemeContribution<PluginText>): Theme {
  return buildThemeFromPalette({
    appearance: contribution.appearance,
    colors: contribution.colors,
  });
}
