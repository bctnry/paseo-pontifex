import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown } from "mdast-util-gfm-table";
import type { Heading, Nodes } from "mdast";
import { gfmTable } from "micromark-extension-gfm-table";

const DEFAULT_DEPTH = 3;
const MIN_DEPTH = 1;
const MAX_DEPTH = 6;

export interface MarkdownOutlineItem {
  id: string;
  sectionId: string;
  depth: number;
  title: string;
  hasChildren: boolean;
}

export interface MarkdownOutlineSection {
  id: string;
  source: string;
}

export interface MarkdownOutline {
  items: MarkdownOutlineItem[];
  sections: MarkdownOutlineSection[];
}

interface SourceRange {
  source: string;
  start: number;
  end: number;
}

/**
 * Split a preview document at the headings the outline lists. Each section is rendered on its
 * own so its layout offset can drive scroll-to-heading on every platform.
 */
export function buildMarkdownOutline(source: string, maxDepth: number): MarkdownOutline {
  const depthLimit = resolveDepth(maxDepth);
  if (source.trim().length === 0) return { items: [], sections: [] };

  try {
    return parseOutline(source, depthLimit);
  } catch {
    return { items: [], sections: [{ id: "section-document", source }] };
  }
}

function parseOutline(source: string, depthLimit: number): MarkdownOutline {
  const tree = fromMarkdown(source, {
    extensions: [gfmTable()],
    mdastExtensions: [gfmTableFromMarkdown()],
  });
  const definitions: SourceRange[] = [];
  const headings: { heading: Heading; start: number }[] = [];

  for (const node of tree.children) {
    const start = node.position?.start.offset;
    const end = node.position?.end.offset;
    if (start === undefined || end === undefined) continue;
    if (node.type === "definition") {
      definitions.push({ source: source.slice(start, end), start, end });
      continue;
    }
    if (node.type !== "heading" || node.depth > depthLimit) continue;
    const title = headingTitle(node);
    if (title.length > 0) headings.push({ heading: node, start });
  }

  if (headings.length === 0) {
    return { items: [], sections: [{ id: "section-document", source }] };
  }

  const sections: MarkdownOutlineSection[] = [];
  const items: MarkdownOutlineItem[] = [];
  const intro = source.slice(0, headings[0].start);
  if (intro.trim().length > 0) {
    sections.push({
      id: "section-intro",
      source: appendExternalDefinitions(intro, definitions, 0, headings[0].start),
    });
  }

  headings.forEach(({ heading, start }, index) => {
    const next = headings[index + 1]?.heading;
    const end = headings[index + 1]?.start ?? source.length;
    const sectionId = `section-${start}`;
    const itemId = `outline-${start}`;
    const body = source.slice(start, end);
    sections.push({
      id: sectionId,
      source: appendExternalDefinitions(body, definitions, start, end),
    });
    items.push({
      id: itemId,
      sectionId,
      depth: heading.depth,
      title: headingTitle(heading),
      hasChildren: next !== undefined && next.depth > heading.depth,
    });
  });

  return { items, sections };
}

/**
 * Hide every heading below a collapsed item. The flat list is in document order, so a heading
 * belongs to a collapsed ancestor while its depth stays greater than the ancestor's depth.
 */
export function visibleMarkdownOutlineItems(
  items: readonly MarkdownOutlineItem[],
  collapsedIds: ReadonlySet<string>,
): MarkdownOutlineItem[] {
  const visible: MarkdownOutlineItem[] = [];
  let hiddenBelowDepth: number | null = null;

  for (const item of items) {
    if (hiddenBelowDepth !== null) {
      if (item.depth > hiddenBelowDepth) continue;
      hiddenBelowDepth = null;
    }
    visible.push(item);
    if (item.hasChildren && collapsedIds.has(item.id)) hiddenBelowDepth = item.depth;
  }

  return visible;
}

// Reference definitions are document-wide in Markdown. Splitting at headings would strand
// references whose definition lives in another section, so carry external definitions along.
function appendExternalDefinitions(
  section: string,
  definitions: readonly SourceRange[],
  sectionStart: number,
  sectionEnd: number,
): string {
  const external = definitions.filter(
    (definition) => definition.start < sectionStart || definition.end > sectionEnd,
  );
  if (external.length === 0) return section;
  return `${section}\n\n${external.map((definition) => definition.source).join("\n\n")}\n`;
}

function headingTitle(heading: Heading): string {
  return heading.children.map(nodeText).join("").replace(/\s+/g, " ").trim();
}

function nodeText(node: Nodes): string {
  if (node.type === "text" || node.type === "inlineCode" || node.type === "code") return node.value;
  if (node.type === "image") return node.alt ?? "";
  if (node.type === "break") return " ";
  if ("children" in node) return node.children.map(nodeText).join("");
  return "";
}

function resolveDepth(value: number): number {
  if (!Number.isFinite(value)) return DEFAULT_DEPTH;
  return Math.min(MAX_DEPTH, Math.max(MIN_DEPTH, Math.trunc(value)));
}
