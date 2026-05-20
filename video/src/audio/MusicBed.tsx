import React from "react";

/**
 * Music + SFX deliberately disabled while the visual edit is being refined.
 * Once the cut is final we'll regenerate a fresh track and SFX hits with
 * ElevenLabs against the locked picture (cheaper than re-generating per draft).
 *
 * The visual edit is still beat-locked at 124 BPM — see motion/timing.ts —
 * so a generated track at that BPM will snap into place without re-cutting.
 */
export const MusicBed: React.FC = () => null;
