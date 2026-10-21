/**
 * @vitest-environment jsdom
 */
import React, { type ReactNode } from "react";
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { SideQuestionSheet, type SideQuestionState } from "@/components/side-question-sheet";

const { theme } = vi.hoisted(() => ({
  theme: {
    spacing: { 2: 8 },
    fontFamily: { ui: "Test UI" },
    fontSize: { base: 15, sm: 13 },
    colors: {
      foregroundMuted: "#aaa",
      palette: { red: { 300: "#f87171" } },
    },
  },
}));

vi.mock("react-native-unistyles", () => ({
  StyleSheet: {
    create: (factory: unknown) => (typeof factory === "function" ? factory(theme) : factory),
  },
  withUnistyles:
    (Component: React.ComponentType<Record<string, unknown>>) =>
    ({
      uniProps,
      ...rest
    }: {
      uniProps?: (theme: unknown) => Record<string, unknown>;
    } & Record<string, unknown>) => {
      const themed = uniProps ? uniProps(theme) : {};
      return React.createElement(Component, { ...rest, ...themed });
    },
}));

vi.mock("react-i18next", () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock("@/components/adaptive-modal-sheet", () => ({
  AdaptiveModalSheet: ({
    visible,
    header,
    children,
  }: {
    visible: boolean;
    header: { title: string; subtitle?: ReactNode };
    children: ReactNode;
  }) =>
    visible
      ? React.createElement(
          "div",
          { "data-testid": "sheet" },
          React.createElement("div", { "data-testid": "sheet-title" }, header.title),
          header.subtitle
            ? React.createElement("div", { "data-testid": "sheet-question" }, header.subtitle)
            : null,
          children,
        )
      : null,
}));

vi.mock("@/components/markdown/renderer", () => ({
  MarkdownRenderer: ({ text }: { text: string }) =>
    React.createElement("div", { "data-testid": "side-question-answer" }, text),
}));

vi.mock("@/components/ui/loading-spinner", () => ({
  LoadingSpinner: () => React.createElement("span", { "data-testid": "side-question-spinner" }),
}));

afterEach(cleanup);

function renderSheet(state: SideQuestionState | null) {
  return render(<SideQuestionSheet state={state} onClose={vi.fn()} />);
}

describe("SideQuestionSheet", () => {
  it("shows the question and a spinner while the answer is pending", () => {
    renderSheet({ question: "what changed?", answer: null, error: null, loading: true });
    expect(screen.getByTestId("sheet-title").textContent).toBe("/btw");
    expect(screen.getByTestId("sheet-question").textContent).toBe("what changed?");
    expect(screen.getByTestId("side-question-spinner")).toBeTruthy();
    expect(screen.queryByTestId("side-question-answer")).toBeNull();
  });

  it("renders the answer as markdown", () => {
    renderSheet({ question: "what changed?", answer: "**Done.**", error: null, loading: false });
    expect(screen.getByTestId("side-question-answer").textContent).toBe("**Done.**");
  });

  it("renders provider errors inline", () => {
    renderSheet({
      question: "what changed?",
      answer: null,
      error: "OpenCode returned no answer",
      loading: false,
    });
    expect(screen.getByText("OpenCode returned no answer")).toBeTruthy();
  });

  it("renders nothing when closed", () => {
    const { container } = renderSheet(null);
    expect(container.firstChild).toBeNull();
  });
});
