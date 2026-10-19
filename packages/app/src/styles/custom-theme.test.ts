import { describe, expect, it } from "vitest";
import {
  CUSTOM_THEME_COLOR_KEYS,
  customThemeFileName,
  newCustomThemeTemplate,
  paletteFromTheme,
  parseCustomThemeFile,
  serializeCustomThemeFile,
} from "./custom-theme";
import { darkPontifexTheme } from "./theme";
import { PONTIFEX_DARK_PALETTE, PONTIFEX_LIGHT_PALETTE } from "./theme-palettes";

describe("custom theme files", () => {
  it("parses a theme file and uses the file name as its id", () => {
    const theme = parseCustomThemeFile(
      "ocean.json",
      JSON.stringify({
        version: 1,
        name: "Ocean",
        appearance: "dark",
        colors: {
          background: "#081018",
          foreground: "#e6edf3",
          raised: "#101b26",
          control: "#172635",
          border: "#284052",
          accent: "#38bdf8",
          mutedForeground: "#94a3b8",
          ring: "#7dd3fc",
        },
      }),
    );

    expect(theme.id).toBe("ocean");
    expect(theme.name).toBe("Ocean");
    expect(theme.fileName).toBe("ocean.json");
    expect(theme.swatch).toBe("#081018");
    expect(theme.theme.colorScheme).toBe("dark");
  });

  it("rejects invalid JSON and invalid colors", () => {
    expect(() => parseCustomThemeFile("broken.json", "{ nope")).toThrow("not valid JSON");
    expect(() =>
      parseCustomThemeFile(
        "broken.json",
        JSON.stringify({
          name: "Broken",
          appearance: "dark",
          colors: {
            background: "black",
            foreground: "#ffffff",
            raised: "#111111",
            control: "#222222",
            border: "#333333",
            mutedForeground: "#888888",
            ring: "#ffffff",
          },
        }),
      ),
    ).toThrow("Invalid theme file");
  });

  it("round-trips the template through serialization", () => {
    const template = newCustomThemeTemplate();
    const parsed = parseCustomThemeFile("my-theme.json", serializeCustomThemeFile(template));
    expect(parsed.contribution.colors).toEqual(template.colors);
    expect(parsed.contribution.appearance).toBe(template.appearance);
  });

  it("starts from the Pontifex palettes", () => {
    expect(newCustomThemeTemplate().colors).toEqual(PONTIFEX_DARK_PALETTE);
    expect(newCustomThemeTemplate("light").colors).toEqual(PONTIFEX_LIGHT_PALETTE);
    expect(new Set(CUSTOM_THEME_COLOR_KEYS).size).toBe(8);
  });

  it("extracts the editable palette from a built-in theme", () => {
    expect(paletteFromTheme(darkPontifexTheme)).toEqual(PONTIFEX_DARK_PALETTE);
  });

  it("creates a unique slugged file name", () => {
    expect(customThemeFileName("Ocean Blue", new Set())).toBe("ocean-blue.json");
    expect(customThemeFileName("Ocean Blue", new Set(["ocean-blue.json"]))).toBe(
      "ocean-blue-2.json",
    );
    expect(customThemeFileName("   ", new Set())).toBe("theme.json");
  });
});
