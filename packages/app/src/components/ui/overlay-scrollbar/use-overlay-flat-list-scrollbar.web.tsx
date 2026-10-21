import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import {
  FlatList,
  type LayoutChangeEvent,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from "react-native";
import { OverlayScrollbar, type OverlayScrollbarMetrics } from "./overlay-scrollbar";
import type { OverlayFlatListScrollbar } from "./use-overlay-flat-list-scrollbar";

const EMPTY_METRICS: OverlayScrollbarMetrics = {
  offset: 0,
  viewportSize: 0,
  contentSize: 0,
};

function sameMetrics(left: OverlayScrollbarMetrics, right: OverlayScrollbarMetrics): boolean {
  return (
    left.offset === right.offset &&
    left.viewportSize === right.viewportSize &&
    left.contentSize === right.contentSize
  );
}

export function useOverlayFlatListScrollbar<ItemT>(
  listRef: RefObject<FlatList<ItemT> | null>,
  options: { enabled: boolean },
): OverlayFlatListScrollbar {
  const [metrics, setMetrics] = useState<OverlayScrollbarMetrics>(EMPTY_METRICS);
  const metricsRef = useRef<OverlayScrollbarMetrics>(EMPTY_METRICS);
  const frameRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    const next = metricsRef.current;
    setMetrics((previous) => (sameMetrics(previous, next) ? previous : next));
  }, []);

  const schedule = useCallback(
    (patch: Partial<OverlayScrollbarMetrics>) => {
      const next = { ...metricsRef.current, ...patch };
      if (sameMetrics(metricsRef.current, next)) return;
      metricsRef.current = next;
      if (!options.enabled || frameRef.current !== null) return;
      frameRef.current = requestAnimationFrame(flush);
    },
    [flush, options.enabled],
  );

  const onScroll = useCallback(
    (event: NativeSyntheticEvent<NativeScrollEvent>) => {
      schedule({
        offset: Math.max(0, event.nativeEvent.contentOffset.y),
        viewportSize: Math.max(0, event.nativeEvent.layoutMeasurement.height),
        contentSize: Math.max(0, event.nativeEvent.contentSize.height),
      });
    },
    [schedule],
  );
  const onLayout = useCallback(
    (event: LayoutChangeEvent) => {
      schedule({ viewportSize: Math.max(0, event.nativeEvent.layout.height) });
    },
    [schedule],
  );
  const onContentSizeChange = useCallback(
    (_width: number, height: number) => {
      schedule({ contentSize: Math.max(0, height) });
    },
    [schedule],
  );
  const scrollToOffset = useCallback(
    (offset: number) => listRef.current?.scrollToOffset({ offset, animated: false }),
    [listRef],
  );

  useEffect(() => {
    if (options.enabled && frameRef.current === null) {
      frameRef.current = requestAnimationFrame(flush);
    }
  }, [flush, options.enabled]);

  useEffect(() => {
    return () => {
      if (frameRef.current !== null) {
        cancelAnimationFrame(frameRef.current);
        frameRef.current = null;
      }
    };
  }, []);

  return {
    enabled: options.enabled,
    onContentSizeChange,
    onLayout,
    onScroll,
    overlay: options.enabled ? (
      <OverlayScrollbar metrics={metrics} onScrollToOffset={scrollToOffset} />
    ) : null,
  };
}
