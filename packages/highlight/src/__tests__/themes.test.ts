import { describe, it, expect } from "vitest";
import { darkHighlightColors, lightHighlightColors } from "../colors.js";
import { SYNTAX_THEME_IDS, isSyntaxThemeId, resolveSyntaxColors } from "../themes.js";
import type { HighlightStyle } from "../types.js";

const allStyles: HighlightStyle[] = [
  "keyword",
  "comment",
  "string",
  "number",
  "literal",
  "function",
  "definition",
  "class",
  "type",
  "tag",
  "attribute",
  "property",
  "variable",
  "operator",
  "punctuation",
  "regexp",
  "escape",
  "meta",
  "heading",
  "link",
];

const colorSchemes: ("light" | "dark")[] = ["light", "dark"];

describe("resolveSyntaxColors", () => {
  for (const id of SYNTAX_THEME_IDS) {
    for (const colorScheme of colorSchemes) {
      describe(`${id} (${colorScheme})`, () => {
        const colors = resolveSyntaxColors(id, colorScheme);

        it("covers all HighlightStyle values", () => {
          for (const style of allStyles) {
            expect(colors[style]).toBeDefined();
            expect(typeof colors[style]).toBe("string");
          }
        });

        it("has valid hex color values", () => {
          for (const style of allStyles) {
            expect(colors[style]).toMatch(/^#[0-9a-fA-F]{6}$/);
          }
        });
      });
    }
  }

  it("github + light deep-equals lightHighlightColors", () => {
    expect(resolveSyntaxColors("github", "light")).toEqual(lightHighlightColors);
  });

  it("github + dark deep-equals darkHighlightColors", () => {
    expect(resolveSyntaxColors("github", "dark")).toEqual(darkHighlightColors);
  });

  it("single-palette themes ignore the color scheme", () => {
    for (const id of [
      "dracula",
      "leuven",
      "leuven-dark",
      "dichromacy",
      "manoj-dark",
      "misterioso",
      "modus-operandi",
      "modus-operandi-tinted",
      "modus-operandi-deuteranopia",
      "modus-operandi-tritanopia",
      "modus-vivendi",
      "modus-vivendi-tinted",
      "modus-vivendi-deuteranopia",
      "modus-vivendi-tritanopia",
    ] as const) {
      expect(resolveSyntaxColors(id, "light")).toEqual(resolveSyntaxColors(id, "dark"));
    }
  });

  it("maps Emacs faces onto the role palette", () => {
    const leuven = resolveSyntaxColors("leuven", "light");
    expect(leuven.keyword).toBe("#0000ff");
    expect(leuven.comment).toBe("#8d8d84");
    expect(leuven.function).toBe("#006699");
    expect(leuven.attribute).toBe("#ba36a5");

    const vivendi = resolveSyntaxColors("modus-vivendi", "dark");
    expect(vivendi.keyword).toBe("#b6a0ff");
    expect(vivendi.type).toBe("#6ae4b9");
    expect(vivendi.comment).toBe("#989898");
  });

  it("nord uses a dark text palette in light mode", () => {
    const light = resolveSyntaxColors("nord", "light");
    const dark = resolveSyntaxColors("nord", "dark");

    expect(light).not.toEqual(dark);
    expect(light.variable).toBe("#2e3440");
    expect(light.comment).toBe("#6b7280");
  });
});

describe("isSyntaxThemeId", () => {
  it("accepts every id in SYNTAX_THEME_IDS", () => {
    for (const id of SYNTAX_THEME_IDS) {
      expect(isSyntaxThemeId(id)).toBe(true);
    }
  });

  it("rejects unknown ids", () => {
    expect(isSyntaxThemeId("auto")).toBe(false);
    expect(isSyntaxThemeId("github-light")).toBe(false);
    expect(isSyntaxThemeId("one-dark")).toBe(false);
    expect(isSyntaxThemeId("nope")).toBe(false);
  });
});
