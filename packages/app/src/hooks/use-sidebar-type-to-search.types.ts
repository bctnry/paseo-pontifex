import type { RefObject } from "react";
import type { View } from "react-native";

export interface SidebarTypeToSearchInput {
  enabled: boolean;
  onStart: (text: string) => void;
}

export interface SidebarTypeToSearchResult {
  hostRef: RefObject<View | null>;
  hoverProps: {
    onPointerEnter?: () => void;
    onPointerLeave?: () => void;
  };
}
