/**
 * @vitest-environment jsdom
 */
import React from "react";
import { render } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { MarkdownRenderer } from "./renderer";

// App sources compile with the automatic JSX runtime under Metro. Vitest's
// esbuild transform uses the classic runtime, so make React available globally.
vi.stubGlobal("React", React);

const { renderedMarkdown } = vi.hoisted(() => ({ renderedMarkdown: [] as string[] }));

vi.mock("./renderers", () => ({ WEB_RENDERERS: {} }));

vi.mock("expo-clipboard", () => ({
  setStringAsync: vi.fn(async () => true),
  getStringAsync: vi.fn(async () => ""),
  hasStringAsync: vi.fn(async () => false),
}));

vi.mock("react-native-enriched-markdown", async () => {
  const { createElement } = await import("react");
  return {
    EnrichedMarkdownText: ({ markdown }: { markdown: string }) => {
      renderedMarkdown.push(markdown);
      return createElement("div", null, markdown);
    },
  };
});

vi.mock("@/assistant-file-links", () => ({
  useAssistantFileLinkEnvironment: () => ({}),
  useAssistantFileLinkActions: () => ({
    canResolveFile: () => false,
    open: () => undefined,
  }),
}));

vi.mock("./images", () => ({
  useMarkdownSource: (text: string) => ({
    markdown: text,
    imageSources: {},
    linkRecognition: {},
    linkSource: (url: string) => ({ href: url }),
  }),
}));

describe("web streaming Markdown", () => {
  it("keeps the closed head mounted while only the tail grows", () => {
    renderedMarkdown.length = 0;
    const { rerender } = render(<MarkdownRenderer text={"First.\n\nSecond\n"} streaming />);

    expect(renderedMarkdown).toEqual(["First.\n\n", "Second\n"]);
    const headRendersAfterMount = renderedMarkdown.filter((text) => text === "First.\n\n").length;

    rerender(<MarkdownRenderer text={"First.\n\nSecond continues\n"} streaming />);

    expect(renderedMarkdown).toContain("Second continues\n");
    expect(renderedMarkdown.filter((text) => text === "First.\n\n")).toHaveLength(
      headRendersAfterMount,
    );
  });

  it("reunites the message when streaming completes", () => {
    renderedMarkdown.length = 0;
    const text = "First.\n\nSecond continues\n";
    const { rerender } = render(<MarkdownRenderer text={text} streaming />);
    renderedMarkdown.length = 0;

    rerender(<MarkdownRenderer text={text} />);

    expect(renderedMarkdown).toEqual([text]);
  });
});
