import { describe, expect, it } from "vitest";
import {
  darkPontifexTheme,
  darkPureBlackTheme,
  darkTheme,
  FONT_SIZE,
  getNextThemePreference,
  lightPontifexTheme,
  lightTheme,
  THEME_OPTIONS,
} from "./theme";

describe("Typography scale", () => {
  it("names 14px as the default interface tier", () => {
    expect(FONT_SIZE).toEqual({
      code: 12,
      content: 15,
      sm: 12,
      base: 14,
      lg: 16,
      xl: 18,
      "2xl": 20,
      "3xl": 22,
      "4xl": 26,
    });
  });
});

describe("Theme catalog", () => {
  it("owns the picker and shortcut order", () => {
    expect(THEME_OPTIONS.map((option) => option.name)).toEqual([
      "light",
      "dark",
      "auto",
      "pontifexLight",
      "pontifexDark",
      "zinc",
      "midnight",
      "claude",
      "ghostty",
      "pureBlack",
    ]);
    expect(getNextThemePreference("dark")).toBe("auto");
    expect(getNextThemePreference("pureBlack")).toBe("light");
  });
});

describe("Pontifex themes", () => {
  it("builds Pontifex Dark from the custom theme template palette", () => {
    expect(darkPontifexTheme.colorScheme).toBe("dark");
    expect(darkPontifexTheme.colors).toMatchObject({
      surface0: "#111111",
      surface1: "#18181b",
      surface2: "#27272a",
      surface3: "#444446",
      foreground: "#f4f4f5",
      foregroundMuted: "#a1a1aa",
      accent: "#f97316",
      ring: "#fafafa",
      surface4: "#59595b",
      foregroundExtraMuted: "#76767c",
      terminal: expect.objectContaining({ brightBlack: "#555555" }),
    });
  });

  it("builds Pontifex Light as the light counterpart", () => {
    expect(lightPontifexTheme.colorScheme).toBe("light");
    expect(lightPontifexTheme.colors).toMatchObject({
      surface0: "#ffffff",
      surface1: "#fafafa",
      surface2: "#f4f4f5",
      surface3: "#e2e2e4",
      foreground: "#18181b",
      foregroundMuted: "#71717a",
      accent: "#c2410c",
      ring: "#18181b",
      surface4: "#d2d2d4",
      foregroundExtraMuted: "#9c9ca2",
      terminal: expect.objectContaining({ brightBlack: "#5d5d5f" }),
    });
  });
});

describe("Pure black theme", () => {
  it("uses a pure black application and terminal background", () => {
    expect(darkPureBlackTheme.colors.surface0).toBe("#000000");
    expect(darkPureBlackTheme.colors.background).toBe("#000000");
    expect(darkPureBlackTheme.colors.terminal.background).toBe("#000000");
  });

  it("uses Paseo's muted green accent", () => {
    expect(darkPureBlackTheme.colors.accent).toBe("#20744A");
    expect(darkPureBlackTheme.colors.accentBright).toBe("#7ccba0");
  });

  it("derives sidebar interaction surfaces from the surface scale", () => {
    expect(darkPureBlackTheme.colors.surfaceSidebar).toBe("#000000");
    expect(darkPureBlackTheme.colors.surfaceSidebarHover).toBe(darkPureBlackTheme.colors.surface1);
    expect(darkPureBlackTheme.colors.surfaceSidebarSelected).toBe(
      darkPureBlackTheme.colors.surface2,
    );
  });

  it("keeps ANSI black output readable on its zero-luminance terminal background", () => {
    expect(darkPureBlackTheme.colors.terminal.black).toBe("#595959");
    expect(darkPureBlackTheme.colors.terminal.brightBlack).toBe("#8a8a8a");
  });
});

describe("Sidebar interaction surfaces", () => {
  it("keeps Light hover and selection darker than the sidebar surface", () => {
    expect(lightTheme.colors.surfaceSidebarHover).toBe(lightTheme.colors.surface3);
    expect(lightTheme.colors.surfaceSidebarSelected).toBe(lightTheme.colors.surface4);
    expect(lightTheme.colors.surfaceSidebarSelected).not.toBe(lightTheme.colors.surfaceSidebar);
  });

  it("derives Dark hover and selection from the first two raised surfaces", () => {
    expect(darkTheme.colors.surfaceSidebarHover).toBe(darkTheme.colors.surface1);
    expect(darkTheme.colors.surfaceSidebarSelected).toBe(darkTheme.colors.surface2);
  });
});

describe("Built-in light theme", () => {
  it("preserves its authored aliases and terminal contrast through the semantic builder", () => {
    expect(lightTheme.colors).toMatchObject({
      primary: "#18181b",
      primaryForeground: "#fafafa",
      destructiveForeground: "#ffffff",
      successForeground: "#ffffff",
      terminal: {
        black: "#1a1a1e",
        brightBlack: "#3f3f46",
      },
    });
  });
});
