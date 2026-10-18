import { describe, expect, it } from "vitest";
import { buildMarkdownOutline, visibleMarkdownOutlineItems } from "./outline";

describe("buildMarkdownOutline", () => {
  it("lists headings up to the requested depth and keeps deeper headings in their section", () => {
    const source = `# One

intro

## Two

body

\`\`\`
# not a heading
\`\`\`

### Three
`;
    const outline = buildMarkdownOutline(source, 2);
    const secondStart = source.indexOf("## Two");

    expect(outline.items).toEqual([
      {
        id: "outline-0",
        sectionId: "section-0",
        depth: 1,
        title: "One",
        hasChildren: true,
      },
      {
        id: `outline-${secondStart}`,
        sectionId: `section-${secondStart}`,
        depth: 2,
        title: "Two",
        hasChildren: false,
      },
    ]);
    expect(outline.sections).toEqual([
      { id: "section-0", source: "# One\n\nintro\n\n" },
      { id: `section-${secondStart}`, source: source.slice(secondStart) },
    ]);
  });

  it("uses the rendered text of inline markup for labels", () => {
    const outline = buildMarkdownOutline(
      `# **Bold** and \`code\`

Title
=====
`,
      2,
    );

    expect(outline.items.map((item) => item.title)).toEqual(["Bold and code", "Title"]);
    expect(outline.items.map((item) => item.depth)).toEqual([1, 1]);
  });

  it("only splits at top-level headings", () => {
    const source = `# One

> ## Quoted

## Two
`;
    const outline = buildMarkdownOutline(source, 6);

    expect(outline.items.map((item) => item.title)).toEqual(["One", "Two"]);
    expect(outline.sections[0].source).toContain("> ## Quoted");
  });

  it("keeps reference definitions available in every section that needs them", () => {
    const source = `# One

[link][ref]

# Two

[ref]: https://example.com
`;
    const outline = buildMarkdownOutline(source, 6);

    expect(outline.sections).toHaveLength(2);
    expect(outline.sections[0].source).toContain("[ref]: https://example.com");
    expect(outline.sections[1].source).toContain("[ref]: https://example.com");
  });

  it("falls back to one section when the document has no usable headings", () => {
    expect(buildMarkdownOutline("   \n", 3)).toEqual({ items: [], sections: [] });
    expect(buildMarkdownOutline("Just a paragraph\n", 3)).toEqual({
      items: [],
      sections: [{ id: "section-document", source: "Just a paragraph\n" }],
    });
    expect(buildMarkdownOutline("# \n", 3)).toEqual({
      items: [],
      sections: [{ id: "section-document", source: "# \n" }],
    });
  });

  it("clamps the depth", () => {
    const source = `# One

## Two

### Three
`;
    expect(buildMarkdownOutline(source, 0).items.map((item) => item.depth)).toEqual([1]);
    expect(buildMarkdownOutline(source, 99).items.map((item) => item.depth)).toEqual([1, 2, 3]);
  });

  it("marks headings that own the headings immediately below them", () => {
    const outline = buildMarkdownOutline(
      `# One

## Two

### Three

## Four

# Five
`,
      6,
    );

    expect(outline.items.map((item) => [item.title, item.hasChildren])).toEqual([
      ["One", true],
      ["Two", true],
      ["Three", false],
      ["Four", false],
      ["Five", false],
    ]);
  });

  it("hides a collapsed heading's subtree and keeps its siblings visible", () => {
    const outline = buildMarkdownOutline(
      `# One

## A

### A1

### A2

## B

# Two

## C
`,
      6,
    );
    const idFor = (title: string) => {
      const item = outline.items.find((candidate) => candidate.title === title);
      if (!item) throw new Error(`Missing outline item ${title}`);
      return item.id;
    };
    const titles = (collapsed: string[]) =>
      visibleMarkdownOutlineItems(outline.items, new Set(collapsed)).map((item) => item.title);

    expect(titles([])).toEqual(["One", "A", "A1", "A2", "B", "Two", "C"]);
    expect(titles([idFor("A")])).toEqual(["One", "A", "B", "Two", "C"]);
    expect(titles([idFor("One")])).toEqual(["One", "Two", "C"]);
    expect(titles([idFor("One"), idFor("Two")])).toEqual(["One", "Two"]);
    expect(titles([idFor("A1")])).toEqual(["One", "A", "A1", "A2", "B", "Two", "C"]);
  });
});
