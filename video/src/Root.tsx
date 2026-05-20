import React from "react";
import { Composition } from "remotion";

// Side-effect import: fonts load at module top level before any composition
// mounts. Without this, Remotion's headless render silently falls back to
// Arial — the #1 Remotion gotcha.
import "./tokens/type";

import { KraterionFilm } from "./compositions/KraterionFilm";
import { TOTAL_FRAMES, FPS } from "./motion/timing";

export const RemotionRoot: React.FC = () => {
  return (
    <Composition
      id="KraterionFilm"
      component={KraterionFilm}
      durationInFrames={TOTAL_FRAMES}
      fps={FPS}
      width={1920}
      height={1080}
    />
  );
};
