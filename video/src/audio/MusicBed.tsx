import React from "react";
import { Sequence, staticFile, interpolate } from "remotion";
import { Audio } from "@remotion/media";

/**
 * Music bed for the full 180s film. Cue map mirrors docs/video/video_plan.md §2.
 *
 *   Track A — cold open + status quo  (00:02–00:32)  frames   60 → 960   src 95.0s
 *   Track B — build / S3 swap         (00:32–01:30)  frames  960 → 2700  src 172.0s
 *   Track C — hero climax             (01:30–02:40)  frames 2700 → 4800  src 151.6s
 *   Track D — outro                   (02:40–03:00)  frames 4800 → 5400  src 30.0s
 *                                                                        (synthesized
 *                                                                         from Track B
 *                                                                         tail, per plan)
 *
 * SFX (all trimmed to single-shot, mono-stereo @ 44.1 kHz):
 *   key-tick.wav   0.30s  · scene 5 S3 swap        — at frame 1200
 *   soft-chime.wav 1.32s  · scene 8 Knowledge: On  — at frame 2790
 *   vinyl-pop.wav  0.30s  · scene 11 MCP reveal    — at frame 4512
 */
export const MusicBed: React.FC = () => {
  return (
    <>
      {/* Track A — cold open, slow piano. 30 s window, in at 60 → 180, hold, out by 900 */}
      <Sequence from={60} durationInFrames={900} layout="none">
        <Audio
          src={staticFile("music/track-a-cold-open.mp3")}
          volume={(f) =>
            interpolate(
              f,
              [0, 60, 180, 840, 900],
              [0, 0.5, 0.7, 0.7, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      </Sequence>

      {/* Track B — build / S3 swap. 58 s window */}
      <Sequence from={960} durationInFrames={1740} layout="none">
        <Audio
          src={staticFile("music/track-b-build.mp3")}
          volume={(f) =>
            interpolate(
              f,
              [0, 60, 1680, 1740],
              [0, 0.6, 0.6, 0],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      </Sequence>

      {/* Track C — hero climax. 70 s window. Release the air around frame 4500 */}
      <Sequence from={2700} durationInFrames={2100} layout="none">
        <Audio
          src={staticFile("music/track-c-climax.mp3")}
          volume={(f) =>
            interpolate(
              f,
              [0, 60, 1800, 2100],
              [0, 0.7, 0.7, 0.25],
              { extrapolateLeft: "clamp", extrapolateRight: "clamp" },
            )
          }
        />
      </Sequence>

      {/* Track D — outro. Source has built-in fade-in (0–2.5s) and fade-out (24–30s),
          so the Sequence volume curve only normalizes level. 20 s window. */}
      <Sequence from={4800} durationInFrames={600} layout="none">
        <Audio
          src={staticFile("music/track-d-outro.mp3")}
          volume={0.5}
        />
      </Sequence>

      {/* SFX — key tick on the S3-endpoint swap (scene 5 begins at 960; swap at +240) */}
      <Sequence from={960 + 240} durationInFrames={12} layout="none">
        <Audio
          src={staticFile("sfx/key-tick.wav")}
          volume={0.25}
        />
      </Sequence>

      {/* SFX — soft chime on Knowledge: On (scene 8 begins at 2700; toggle at +90) */}
      <Sequence from={2700 + 90} durationInFrames={48} layout="none">
        <Audio
          src={staticFile("sfx/soft-chime.wav")}
          volume={0.18}
        />
      </Sequence>

      {/* SFX — vinyl pop on MCP window reveal (scene 11 begins at 4500; reveal at +12) */}
      <Sequence from={4500 + 12} durationInFrames={12} layout="none">
        <Audio
          src={staticFile("sfx/vinyl-pop.wav")}
          volume={0.12}
        />
      </Sequence>
    </>
  );
};
