import { useCallback, useEffect, useRef } from "react";
import type { View } from "react-native";
import { hasActiveWebOverlay, hasOpenDomPopover } from "@/lib/overlay-root";
import { isImeComposingKeyboardEvent } from "@/utils/keyboard-ime";
import type {
  SidebarTypeToSearchInput,
  SidebarTypeToSearchResult,
} from "./use-sidebar-type-to-search.types";

function isTypingTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false;
  if (target.isContentEditable) return true;
  return (
    target.tagName === "INPUT" ||
    target.tagName === "TEXTAREA" ||
    target.tagName === "SELECT" ||
    target.getAttribute("role") === "textbox"
  );
}

function isPrintableKey(event: KeyboardEvent): boolean {
  if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey) return false;
  if (isImeComposingKeyboardEvent(event)) return false;
  // `key` is the produced character for printable keys and a name like "ArrowLeft" otherwise.
  return event.key.length === 1;
}

/**
 * Type-to-search over the sidebar's list area.
 *
 * Hover is tracked with the canonical `onPointerEnter`/`onPointerLeave` pair from docs/hover.md;
 * the key listener is global because the sidebar list has no focusable container of its own. A
 * printable key only reaches search when the pointer is inside the list, focus is not in a text
 * field, and no overlay is on top.
 */
export function useSidebarTypeToSearch(input: SidebarTypeToSearchInput): SidebarTypeToSearchResult {
  const hostRef = useRef<View | null>(null);
  const hoveredRef = useRef(false);
  const enabledRef = useRef(input.enabled);
  const onStartRef = useRef(input.onStart);
  enabledRef.current = input.enabled;
  onStartRef.current = input.onStart;

  const handlePointerEnter = useCallback(() => {
    hoveredRef.current = true;
  }, []);
  const handlePointerLeave = useCallback(() => {
    hoveredRef.current = false;
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (!enabledRef.current || !hoveredRef.current) return;
      if (!isPrintableKey(event)) return;
      if (isTypingTarget(event.target) || isTypingTarget(document.activeElement)) return;
      if (hasActiveWebOverlay() || hasOpenDomPopover()) return;
      event.preventDefault();
      onStartRef.current(event.key);
    };
    window.addEventListener("keydown", handleKeyDown, true);
    return () => window.removeEventListener("keydown", handleKeyDown, true);
  }, []);

  return {
    hostRef,
    hoverProps: {
      onPointerEnter: handlePointerEnter,
      onPointerLeave: handlePointerLeave,
    },
  };
}
