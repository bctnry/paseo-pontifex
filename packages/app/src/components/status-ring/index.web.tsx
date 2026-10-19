import { memo } from "react";
import { View } from "react-native";
import {
  StatusRingFrame,
  type StatusRingProps,
  rotatorStyles,
  styles,
} from "@/components/status-ring/frame";

/**
 * Web running indicator. The rotation is deliberately omitted here: an infinite transform
 * animation on the small border arc still caused the sidebar row to repaint every frame in
 * Electron, even with a promoted layer. The static quarter keeps the running state legible and
 * leaves the web renderer idle. Native keeps the animated ring.
 */
export const StatusRing = memo(function StatusRing({ backdrop }: StatusRingProps) {
  return (
    <StatusRingFrame backdrop={backdrop}>
      <View style={rotatorStyles.rotator}>
        <View style={styles.arc} />
      </View>
    </StatusRingFrame>
  );
});
