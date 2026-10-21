import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { RefObject } from "react";
import type { ComposerHeightResult } from "./height.types";

interface ComposerHeightArgs {
  getText: () => string;
  textareaRef: RefObject<HTMLElement | null>;
  minHeight: number;
  maxHeight: number;
  onRenderedLinesChange?: (lines: number) => void;
  presentationKey?: boolean;
}

const COPIED_STYLES = [
  "fontFamily",
  "fontSize",
  "fontWeight",
  "fontStyle",
  "fontVariant",
  "lineHeight",
  "letterSpacing",
  "wordSpacing",
  "textTransform",
  "textIndent",
  "whiteSpace",
  "wordWrap",
  "overflowWrap",
  "wordBreak",
  "tabSize",
  "paddingTop",
  "paddingRight",
  "paddingBottom",
  "paddingLeft",
] as const;

interface MirrorStyleCache {
  source: HTMLElement;
  width: number;
  presentationKey: boolean | undefined;
  padding: number;
  lineHeight: number;
}

function applyMirrorStyle(input: {
  mirror: HTMLTextAreaElement;
  source: HTMLElement;
  width: number;
  presentationKey: boolean | undefined;
}): MirrorStyleCache {
  const computedStyle = window.getComputedStyle(input.source);
  for (const property of COPIED_STYLES) {
    input.mirror.style[property] = computedStyle[property];
  }
  input.mirror.style.width = `${input.width}px`;
  return {
    source: input.source,
    width: input.width,
    presentationKey: input.presentationKey,
    padding:
      (Number.parseFloat(computedStyle.paddingTop) || 0) +
      (Number.parseFloat(computedStyle.paddingBottom) || 0),
    lineHeight: Number.parseFloat(computedStyle.lineHeight) || 0,
  };
}

export function useComposerHeight({
  getText,
  textareaRef,
  minHeight,
  maxHeight,
  onRenderedLinesChange,
  presentationKey,
}: ComposerHeightArgs): ComposerHeightResult {
  const [height, setHeight] = useState(minHeight);
  const heightRef = useRef(minHeight);
  const paramsRef = useRef({
    getText,
    minHeight,
    maxHeight,
    onRenderedLinesChange,
    presentationKey,
  });
  paramsRef.current = { getText, minHeight, maxHeight, onRenderedLinesChange, presentationKey };
  const mirrorRef = useRef<HTMLTextAreaElement | null>(null);
  const styleCacheRef = useRef<MirrorStyleCache | null>(null);
  const pendingTextRef = useRef<string | null>(null);
  const frameRef = useRef<number | null>(null);

  const setBoundedHeight = useCallback((nextHeight: number) => {
    const { minHeight: currentMin, maxHeight: currentMax } = paramsRef.current;
    const bounded = Math.max(currentMin, Math.min(currentMax, nextHeight));
    if (Math.abs(heightRef.current - bounded) < 1) return;
    heightRef.current = bounded;
    setHeight(bounded);
  }, []);

  const measureNow = useCallback(
    (text: string) => {
      const mirror = mirrorRef.current;
      const source = textareaRef.current;
      if (!mirror || !source || typeof window === "undefined") return;
      if (!text) {
        setBoundedHeight(paramsRef.current.minHeight);
        paramsRef.current.onRenderedLinesChange?.(1);
        return;
      }
      const sourceWidth = source.clientWidth;
      if (sourceWidth <= 0) return;

      let cache = styleCacheRef.current;
      if (
        !cache ||
        cache.source !== source ||
        Math.abs(cache.width - sourceWidth) >= 1 ||
        cache.presentationKey !== paramsRef.current.presentationKey
      ) {
        cache = applyMirrorStyle({
          mirror,
          source,
          width: sourceWidth,
          presentationKey: paramsRef.current.presentationKey,
        });
        styleCacheRef.current = cache;
      }

      mirror.value = text.endsWith("\n") ? `${text} ` : text;
      const scrollHeight = mirror.scrollHeight;
      const onLinesChange = paramsRef.current.onRenderedLinesChange;
      if (onLinesChange && cache.lineHeight > 0) {
        onLinesChange(Math.round((scrollHeight - cache.padding) / cache.lineHeight));
      }
      setBoundedHeight(scrollHeight);
    },
    [setBoundedHeight, textareaRef],
  );

  const scheduleMeasure = useCallback(
    (text: string) => {
      pendingTextRef.current = text;
      if (frameRef.current !== null) return;
      if (typeof requestAnimationFrame !== "function") {
        const pending = pendingTextRef.current;
        pendingTextRef.current = null;
        if (pending !== null) measureNow(pending);
        return;
      }
      frameRef.current = requestAnimationFrame(() => {
        frameRef.current = null;
        const pending = pendingTextRef.current;
        pendingTextRef.current = null;
        if (pending !== null) measureNow(pending);
      });
    },
    [measureNow],
  );

  const invalidateStyleCache = useCallback(() => {
    styleCacheRef.current = null;
    scheduleMeasure(paramsRef.current.getText());
  }, [scheduleMeasure]);

  useEffect(() => {
    if (typeof document === "undefined") return;
    const mirror = document.createElement("textarea");
    mirror.setAttribute("aria-hidden", "true");
    mirror.setAttribute("tabindex", "-1");
    mirror.readOnly = true;
    mirror.rows = 1;
    Object.assign(mirror.style, {
      position: "absolute",
      top: "0",
      left: "0",
      visibility: "hidden",
      pointerEvents: "none",
      overflow: "hidden",
      border: "0",
      margin: "0",
      resize: "none",
      zIndex: "-1",
      boxSizing: "border-box",
    });
    document.body.appendChild(mirror);
    mirrorRef.current = mirror;
    measureNow(paramsRef.current.getText());
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
      pendingTextRef.current = null;
      mirror.remove();
      mirrorRef.current = null;
      styleCacheRef.current = null;
    };
  }, [measureNow]);

  useLayoutEffect(() => {
    measureNow(getText());
  }, [getText, maxHeight, measureNow, minHeight, onRenderedLinesChange, presentationKey]);

  useEffect(() => {
    const source = textareaRef.current;
    if (!source || typeof ResizeObserver === "undefined") return;
    let previousWidth = source.clientWidth;
    const observer = new ResizeObserver(() => {
      const nextWidth = source.clientWidth;
      if (Math.abs(nextWidth - previousWidth) < 1) return;
      previousWidth = nextWidth;
      styleCacheRef.current = null;
      scheduleMeasure(paramsRef.current.getText());
    });
    observer.observe(source);
    return () => observer.disconnect();
  }, [scheduleMeasure, textareaRef, presentationKey]);

  useEffect(() => {
    if (typeof MutationObserver === "undefined" || typeof document === "undefined") return;
    // Theme and root font changes can alter the textarea's computed font without
    // changing its width. Invalidate the cached mirror styles instead of reading
    // getComputedStyle on every keystroke.
    const observer = new MutationObserver(invalidateStyleCache);
    for (const target of [document.documentElement, document.body]) {
      if (!target) continue;
      observer.observe(target, {
        attributes: true,
        attributeFilter: ["class", "style", "data-theme"],
      });
    }
    const source = textareaRef.current;
    if (source) {
      observer.observe(source, { attributes: true, attributeFilter: ["class"] });
    }
    const fonts = document.fonts;
    const handleFontLoad = () => invalidateStyleCache();
    fonts?.addEventListener?.("loadingdone", handleFontLoad);
    return () => {
      observer.disconnect();
      fonts?.removeEventListener?.("loadingdone", handleFontLoad);
    };
  }, [invalidateStyleCache, textareaRef, presentationKey]);

  const onTextChange = useCallback(
    (_previousText: string, nextText: string) => scheduleMeasure(nextText),
    [scheduleMeasure],
  );
  const reset = useCallback(() => {
    if (frameRef.current !== null) {
      cancelAnimationFrame(frameRef.current);
      frameRef.current = null;
    }
    pendingTextRef.current = null;
    setBoundedHeight(paramsRef.current.minHeight);
    paramsRef.current.onRenderedLinesChange?.(1);
  }, [setBoundedHeight]);
  const style = useMemo(() => ({ height, minHeight, maxHeight }), [height, maxHeight, minHeight]);

  return {
    mode: "measured",
    style,
    scrollEnabled: height >= maxHeight,
    onTextChange,
    reset,
  };
}
