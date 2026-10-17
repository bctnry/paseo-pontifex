import { useMemo } from "react";
import { type StyleProp, Text, type TextStyle, View } from "react-native";
import { ProjectIconImage } from "@/components/project-icon-image";
import { deriveIdentityColorName, identityColor } from "@/styles/identity-colors";

const WHITE_TEXT = { color: "#ffffff" } as const;
const FALLBACK_LAYOUT = { alignItems: "center", justifyContent: "center" } as const;

/**
 * Corner radius of the *generated* project icon — the colored square with an initial. Corners are
 * square, so this is 0 at every size.
 *
 * A **user-uploaded icon is never rounded** — it is someone's mark, and clipping its corners
 * distorts branding we don't own. A square logo stays square, a round one is already round.
 */
export function projectIconRadius(_size: number): number {
  return 0;
}

/**
 * A project's icon: its chosen image, or a colored square carrying its initial.
 *
 * Geometry lives here, not at the call site. It used to be five copies of the same
 * width/height/radius/centering block, which is how the radius drifted apart in the first
 * place — pass a `size` and the shape follows.
 */

export function ProjectIconView({
  iconDataUri,
  initial,
  projectViewKey,
  size,
  textStyle,
}: {
  iconDataUri: string | null;
  initial: string;
  projectViewKey: string;
  size: number;
  textStyle: StyleProp<TextStyle>;
}) {
  // The uploaded image is sized but never clipped — see projectIconRadius.
  const box = useMemo(() => ({ width: size, height: size }), [size]);
  const fallbackStyles = useMemo(
    () => [
      box,
      { borderRadius: projectIconRadius(size) },
      FALLBACK_LAYOUT,
      { backgroundColor: identityColor(deriveIdentityColorName(projectViewKey)) },
    ],
    [box, size, projectViewKey],
  );
  const textStyles = useMemo(() => [textStyle, WHITE_TEXT], [textStyle]);

  const fallback = useMemo(
    () => (
      <View style={fallbackStyles}>
        <Text style={textStyles}>{initial}</Text>
      </View>
    ),
    [fallbackStyles, initial, textStyles],
  );

  return iconDataUri ? (
    <ProjectIconImage dataUri={iconDataUri} fallback={fallback} style={box} />
  ) : (
    fallback
  );
}
