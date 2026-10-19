/**
 * The eight-slot palette used by plugin themes and desktop custom theme files.
 *
 * The built-in Pontifex themes use the same slots so "New theme" starts from the real Pontifex
 * Dark palette. Surface3, surface4, extra-muted text, and terminal bright black are derived in
 * `buildThemeFromPalette` rather than being separate picker slots.
 */
export interface ThemePalette {
  background: string;
  foreground: string;
  raised: string;
  control: string;
  border: string;
  accent?: string;
  mutedForeground: string;
  ring: string;
}

export const PONTIFEX_DARK_PALETTE = {
  background: "#111111",
  foreground: "#f4f4f5",
  raised: "#18181b",
  control: "#27272a",
  border: "#3f3f46",
  accent: "#f97316",
  mutedForeground: "#a1a1aa",
  ring: "#fafafa",
} as const satisfies ThemePalette;

export const PONTIFEX_LIGHT_PALETTE = {
  background: "#ffffff",
  foreground: "#18181b",
  raised: "#fafafa",
  control: "#f4f4f5",
  border: "#e4e4e7",
  accent: "#c2410c",
  mutedForeground: "#71717a",
  ring: "#18181b",
} as const satisfies ThemePalette;
