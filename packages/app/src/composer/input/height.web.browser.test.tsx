import React, { act, useCallback, useMemo, useRef } from "react";
import { createRoot, type Root } from "react-dom/client";
import { afterEach, describe, expect, it } from "vitest";
import { useComposerHeight } from "./height.web";

interface HeightHarnessController {
  text: { current: string };
  onTextChange?: (previousText: string, nextText: string) => void;
  height: number;
}

interface MountedHarness {
  root: Root;
  container: HTMLDivElement;
  textarea: HTMLTextAreaElement;
  controller: React.RefObject<HeightHarnessController | null>;
}

const mountedHarnesses: MountedHarness[] = [];

function HeightHarness({
  controller,
  initialText,
}: {
  controller: React.RefObject<HeightHarnessController | null>;
  initialText: string;
}) {
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const textRef = useRef(initialText);
  const getText = useCallback(() => textRef.current, []);
  const result = useComposerHeight({
    getText,
    textareaRef,
    minHeight: 24,
    maxHeight: 160,
    presentationKey: false,
  });

  controller.current = {
    text: textRef,
    onTextChange: result.mode === "measured" ? result.onTextChange : undefined,
    height: Number(result.style.height ?? 24),
  };

  const textareaStyle = useMemo<React.CSSProperties>(
    () => ({
      width: 320,
      boxSizing: "border-box",
      padding: 8,
      border: 0,
      resize: "none",
      font: "16px/22px monospace",
      ...(result.style as React.CSSProperties),
    }),
    [result.style],
  );

  return <textarea ref={textareaRef} defaultValue={initialText} style={textareaStyle} />;
}

function mountHarness(initialText = "seed"): MountedHarness {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  const controller = React.createRef<HeightHarnessController>();

  act(() => {
    root.render(<HeightHarness controller={controller} initialText={initialText} />);
  });

  const textarea = container.querySelector("textarea");
  if (!textarea) {
    throw new Error("Height harness did not render a textarea");
  }

  const mounted = { root, container, textarea, controller };
  mountedHarnesses.push(mounted);
  return mounted;
}

async function flushMeasurementFrame(): Promise<void> {
  await act(async () => {
    await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  });
}

afterEach(() => {
  for (const mounted of mountedHarnesses.splice(0)) {
    act(() => mounted.root.unmount());
    mounted.container.remove();
  }
});

describe("useComposerHeight web", () => {
  it("does not re-read computed styles for every text change", async () => {
    const mounted = mountHarness();
    await flushMeasurementFrame();

    const originalGetComputedStyle = window.getComputedStyle;
    let sourceStyleReads = 0;
    window.getComputedStyle = function measuredGetComputedStyle(element, pseudoElement) {
      if (element === mounted.textarea) sourceStyleReads += 1;
      return originalGetComputedStyle.call(window, element, pseudoElement);
    };

    try {
      const baselineReads = sourceStyleReads;
      act(() => {
        const controller = mounted.controller.current;
        if (!controller?.onTextChange) {
          throw new Error("Composer height did not expose onTextChange");
        }

        controller.text.current = "one";
        controller.onTextChange("seed", "one");
        controller.text.current = "one\ntwo";
        controller.onTextChange("one", "one\ntwo");
        controller.text.current = "one\ntwo\nthree";
        controller.onTextChange("one\ntwo", "one\ntwo\nthree");
      });
      await flushMeasurementFrame();

      expect(sourceStyleReads).toBe(baselineReads);
      expect(mounted.controller.current?.height).toBeGreaterThan(24);
    } finally {
      window.getComputedStyle = originalGetComputedStyle;
    }
  });
});
