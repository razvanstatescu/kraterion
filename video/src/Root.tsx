import React from "react";
import { Composition } from "remotion";

// Side-effect imports: fontsReady chain registers Inter + JetBrains Mono
// at module top level before any composition can mount. This is the
// #1 Remotion gotcha — never load fonts inside a render function or
// you risk a silent Arial fallback during headless rendering.
import "./tokens/type";

import { KraterionFilm } from "./compositions/KraterionFilm";
import { KraterionTeaser } from "./compositions/KraterionTeaser";
import { KraterionFilmShort } from "./compositions/KraterionFilmShort";
import { TOTAL_FRAMES, TEASER_FRAMES, FPS } from "./motion/timing";

export const RemotionRoot: React.FC = () => {
  return (
    <>
      <Composition
        id="KraterionFilm"
        component={KraterionFilm}
        durationInFrames={TOTAL_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="KraterionTeaser"
        component={KraterionTeaser}
        durationInFrames={TEASER_FRAMES}
        fps={FPS}
        width={1920}
        height={1080}
      />
      <Composition
        id="KraterionFilmShort"
        component={KraterionFilmShort}
        durationInFrames={3600}
        fps={FPS}
        width={1920}
        height={1080}
      />
    </>
  );
};
