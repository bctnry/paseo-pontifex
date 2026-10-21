import React, { useLayoutEffect, useMemo, useState } from "react";
import { View, type StyleProp, type ViewStyle } from "react-native";
import Animated, {
  makeMutable,
  type SharedValue,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
} from "react-native-reanimated";
import { scheduleOnUI } from "react-native-worklets";
import { useRetainedPanelActive } from "@/components/retained-panel";
import {
  SYNCED_LOADER_DOT_COUNT,
  getSyncedLoaderDotOpacity,
  getSyncedLoaderStep,
} from "@/components/synced-loader-state";

const GRID_COLUMNS = 2;
const DOT_KEYS = Array.from({ length: SYNCED_LOADER_DOT_COUNT }, (_, i) => `dot-${i}`);
const SMALL_SIZE = 14;
const LARGE_SIZE = 28;

// One clock for every spinner in the app. Each mounted spinner only mirrors the current step;
// it does not run its own animation timer.
const sharedStep = makeMutable(0);
const activeLoaderCount = makeMutable(0);
const clockRunning = makeMutable(false);
let nextStepListenerId = 1;

type SpinnerSize = "small" | "large" | number;

interface LoadingSpinnerProps {
  color: string;
  size?: SpinnerSize;
  style?: StyleProp<ViewStyle>;
}

function advanceSharedStep(): void {
  "worklet";
  if (activeLoaderCount.value === 0) {
    clockRunning.value = false;
    return;
  }

  const nextStep = getSyncedLoaderStep(Date.now());
  if (sharedStep.value !== nextStep) {
    sharedStep.value = nextStep;
  }
  requestAnimationFrame(advanceSharedStep);
}

function registerStepListener(
  step: SharedValue<number>,
  registered: SharedValue<boolean>,
  listenerId: number,
): void {
  "worklet";
  if (registered.value) {
    return;
  }

  registered.value = true;
  step.value = getSyncedLoaderStep(Date.now());
  sharedStep.addListener(listenerId, (nextStep) => {
    step.value = nextStep;
  });
  activeLoaderCount.value += 1;

  if (!clockRunning.value) {
    clockRunning.value = true;
    sharedStep.value = step.value;
    requestAnimationFrame(advanceSharedStep);
  }
}

function unregisterStepListener(registered: SharedValue<boolean>, listenerId: number): void {
  "worklet";
  if (!registered.value) {
    return;
  }

  registered.value = false;
  sharedStep.removeListener(listenerId);
  activeLoaderCount.value -= 1;
}

function useSharedSpinnerStep(active: boolean, reduceMotion: boolean): SharedValue<number> {
  // Retained loaders detach from the app-wide clock without unmounting their animated views.
  const step = useSharedValue(reduceMotion ? 0 : getSyncedLoaderStep(Date.now()));
  const registered = useSharedValue(false);
  const [listenerId] = useState(() => nextStepListenerId++);

  useLayoutEffect(() => {
    if (!active || reduceMotion) {
      return;
    }

    scheduleOnUI(registerStepListener, step, registered, listenerId);
    return () => {
      scheduleOnUI(unregisterStepListener, registered, listenerId);
    };
  }, [active, listenerId, reduceMotion, registered, step]);

  return step;
}

function resolveSpinnerSize(size: SpinnerSize): number {
  if (typeof size === "number") {
    return size;
  }
  return size === "large" ? LARGE_SIZE : SMALL_SIZE;
}

/**
 * The app's single spinner. Every instance mirrors one shared step clock, so mounting several
 * spinners does not create several animations. Size may be `small`, `large`, or a pixel value;
 * the six-dot grid fills that square.
 */
export function LoadingSpinner({ color, size = "small", style }: LoadingSpinnerProps) {
  const active = useRetainedPanelActive();
  const reduceMotion = useReducedMotion();
  const step = useSharedSpinnerStep(active, reduceMotion);
  const resolvedSize = resolveSpinnerSize(size);

  // The 2x3 grid fills `size` exactly on its long axis: the dot is whatever is left after the
  // two gaps, not a floored integer. Fractional dots are fine at these sub-pixel radii.
  const gap = Math.max(1, Math.round(resolvedSize * 0.12));
  const dotSize = Math.max(2, (resolvedSize - gap * 2) / 3);
  const gridWidth = dotSize * 2 + gap;
  const gridHeight = dotSize * 3 + gap * 2;

  const gridStyle = useMemo(
    () => ({ width: gridWidth, height: gridHeight }),
    [gridHeight, gridWidth],
  );
  const containerStyle = useMemo(
    () => [
      {
        width: resolvedSize,
        height: resolvedSize,
        alignItems: "center",
        justifyContent: "center",
      } as const,
      style,
    ],
    [resolvedSize, style],
  );

  return (
    <View style={containerStyle}>
      <View style={gridStyle}>
        {Array.from({ length: SYNCED_LOADER_DOT_COUNT }).map((_, dotIndex) => {
          const rowIndex = Math.floor(dotIndex / GRID_COLUMNS);
          const columnIndex = dotIndex % GRID_COLUMNS;

          return (
            <SpinnerDot
              key={DOT_KEYS[dotIndex]}
              color={color}
              dotSize={dotSize}
              dotIndex={dotIndex}
              step={step}
              left={columnIndex * (dotSize + gap)}
              top={rowIndex * (dotSize + gap)}
            />
          );
        })}
      </View>
    </View>
  );
}

function SpinnerDot({
  color,
  dotSize,
  dotIndex,
  step,
  left,
  top,
}: {
  color: string;
  dotSize: number;
  dotIndex: number;
  step: SharedValue<number>;
  left: number;
  top: number;
}) {
  const animatedStyle = useAnimatedStyle(() => ({
    opacity: getSyncedLoaderDotOpacity(step.value, dotIndex),
  }));

  const dotStyle = useMemo(
    () => [
      animatedStyle,
      {
        width: dotSize,
        height: dotSize,
        borderRadius: dotSize / 2,
        backgroundColor: color,
        position: "absolute" as const,
        left,
        top,
      },
    ],
    [animatedStyle, dotSize, color, left, top],
  );

  return <Animated.View style={dotStyle} />;
}
