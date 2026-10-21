import { useMemo } from "react";
import type { StreamItem } from "@/types/stream";
import type { StreamHistoryRowRevision } from "./strategy";

interface HistoryRowDisplayVariants {
  compact?: StreamItem;
}

const historyRowDisplayVariants = new WeakMap<StreamItem, HistoryRowDisplayVariants>();

function getHistoryRowDisplayVariant(item: StreamItem, compact: boolean): StreamItem {
  if (!compact) return item;
  let variants = historyRowDisplayVariants.get(item);
  if (!variants) {
    variants = {};
    historyRowDisplayVariants.set(item, variants);
  }
  variants.compact ??= { ...item };
  return variants.compact;
}

// Item identity is the render signal for history rows: the row boundary in view.tsx bails out
// until its item changes. Every viewport runs its history through this hook so a history host
// whose tool-call group keeps updating from the live head, a group whose expanded state changed,
// or a breakpoint change reaches the row as a fresh identity. Unchanged rows keep their identity,
// which is what limits a live update to the rows it touched.
export function useRevisedHistoryRows(
  items: StreamItem[],
  revision: StreamHistoryRowRevision | undefined,
): StreamItem[] {
  return useMemo(() => {
    if (!revision) return items;
    const { contentById, displayStateById, globalDisplayState } = revision;
    if (!globalDisplayState && displayStateById.size === 0 && contentById.size === 0) {
      return items;
    }
    return items.map((item) => {
      const displayItem = getHistoryRowDisplayVariant(item, globalDisplayState);
      if (!displayStateById.has(item.id) && !contentById.has(item.id)) return displayItem;
      return { ...displayItem };
    });
  }, [items, revision]);
}
