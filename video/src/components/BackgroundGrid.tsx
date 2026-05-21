import React from "react";
import { AbsoluteFill } from "remotion";
import { color } from "../tokens/color";

/**
 * Brand says "No gradients. No noise textures. No background patterns."
 * (design-system/README.md §Backgrounds.) The krater-orange dot grid we
 * had here is gone.
 *
 * This component is now a flat cream backdrop kept only as a compatibility
 * shim — scenes that import it just get a cream fill. New code shouldn't
 * use it at all; just set the scene's AbsoluteFill background to cream.
 */
type Props = {
  /** @deprecated */
  opacity?: number;
  /** @deprecated */
  flashOnBeat?: boolean;
  /** @deprecated */
  beatOrigin?: number;
};

export const BackgroundGrid: React.FC<Props> = () => (
  <AbsoluteFill style={{ background: color.cream, zIndex: 0 }} />
);
