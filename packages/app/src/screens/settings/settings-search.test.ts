import { describe, expect, it } from "vitest";
import { filterSettingsTargets, matchesSettingsSearch } from "./settings-search";

const translate = (key: string): string =>
  ({
    "settings.sections.editor": "Editor",
    "settings.sections.usage": "Usage",
  })[key] ?? key;

const editor = { labelKey: "settings.sections.editor", keywords: ["keybindings", "vim"] };
const usage = { labelKey: "settings.sections.usage", keywords: ["tokens", "cost"] };

describe("matchesSettingsSearch", () => {
  it("matches every target when the query is empty or only whitespace", () => {
    expect(matchesSettingsSearch("", editor, translate)).toBe(true);
    expect(matchesSettingsSearch("   ", editor, translate)).toBe(true);
  });

  it("matches the translated label case-insensitively", () => {
    expect(matchesSettingsSearch("edit", editor, translate)).toBe(true);
    expect(matchesSettingsSearch("EDITOR", editor, translate)).toBe(true);
  });

  it("matches a keyword the label does not contain", () => {
    expect(matchesSettingsSearch("keybind", editor, translate)).toBe(true);
    expect(matchesSettingsSearch("tokens", usage, translate)).toBe(true);
  });

  it("requires every whitespace-separated token", () => {
    expect(matchesSettingsSearch("editor keybind", editor, translate)).toBe(true);
    expect(matchesSettingsSearch("editor tokens", editor, translate)).toBe(false);
  });

  it("rejects an unrelated query", () => {
    expect(matchesSettingsSearch("providers", editor, translate)).toBe(false);
  });
});

describe("filterSettingsTargets", () => {
  it("keeps only matching targets", () => {
    expect(filterSettingsTargets("cost", [editor, usage], translate)).toEqual([usage]);
  });

  it("returns all targets for an empty query", () => {
    expect(filterSettingsTargets("", [editor, usage], translate)).toEqual([editor, usage]);
  });
});
