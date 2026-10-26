import { useRef } from "react";
import type { View } from "react-native";
import type {
  SidebarTypeToSearchInput,
  SidebarTypeToSearchResult,
} from "./use-sidebar-type-to-search.types";

/**
 * Native has no physical keyboard and no pointer hover. The base implementation exists so the
 * sidebar can call the hook unconditionally; Metro swaps in the web implementation for browsers.
 */
export function useSidebarTypeToSearch(
  _input: SidebarTypeToSearchInput,
): SidebarTypeToSearchResult {
  const hostRef = useRef<View | null>(null);
  return { hostRef, hoverProps: {} };
}
