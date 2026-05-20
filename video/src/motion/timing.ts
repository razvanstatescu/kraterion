/**
 * Beat-locked timing grid for the Kraterion film — v3 (storytelling rebuild).
 *
 * Track BPM = 124 (the music we'll generate later targets this), 30 fps.
 *   beat (quarter) = 60 / 124 * 30 = 14.5161 frames
 *   bar  (4 beats) =                 58.0645 frames
 *
 * Structural arc (per research — Vercel / Linear / Stripe / Supabase patterns):
 *   - Problem statement opens (single indictment line)
 *   - Promise lands the brand
 *   - Concrete trust-earning feature (S3 drop-in)
 *   - Lived-in product moment (Buckets)
 *   - "Wait, it does that?" features get MORE time: Knowledge, Agents, RAG
 *   - MCP lands as the strategic surprise
 *   - Recontextualize with Billing
 *   - Callback close (inverted indictment)
 *
 * Time-weighting rule from research: features that are hardest to *explain* or
 * hardest to *believe* get the most seconds. For us: Knowledge / Agents / RAG.
 */

export const FPS = 30;
export const BPM = 124;
export const MUSIC_START = 30;          // 1.0 s of pre-music silence

export const BEAT = (60 / BPM) * FPS;   // 14.5161
export const BAR = BEAT * 4;            // 58.0645
export const HALF = BEAT / 2;
export const QUARTER = BEAT / 4;

const barFrames = (count: number) => Math.round(BAR * count);

/**
 * 10-scene arc, ~2:28 total. Scenes only carry `duration` because <Series>
 * places them sequentially — absolute frame positions are computed at render.
 */
export const scenes = {
  // 0:00 — Problem (~8.7 s): 1 s silent indictment + 4 bars of pain beats
  S00_Problem:   { duration: MUSIC_START + barFrames(4) },
  // 0:09 — Promise (~5.8 s): hero rect "lock" unfolds → aperture, tagline lands
  S01_Promise:   { duration: barFrames(3) },
  // 0:14 — S3 drop-in (~13.5 s): code reveal, URL strike-through morph
  S02_S3Swap:    { duration: barFrames(7) },
  // 0:28 — Buckets (~13.5 s): dashboard tour, one hero metric
  S03_Buckets:   { duration: barFrames(7) },
  // 0:42 — Knowledge (~19.4 s): toggle, indexing, the "wait, it does that?" beat
  S04_Knowledge: { duration: barFrames(10) },
  // 1:01 — Agents (~19.4 s): form fills field-by-field, create button, build moment
  S05_Agents:    { duration: barFrames(10) },
  // 1:20 — RAG (~19.4 s): chat + citations + grounded answer
  S06_RAG:       { duration: barFrames(10) },
  // 1:40 — MCP (~17.5 s): chat shrinks left, MCP appears right, 7 tools, revoke beat
  S07_MCP:       { duration: barFrames(9) },
  // 1:57 — Billing (~13.5 s): one sentence, one number, on-chain receipt
  S08_Billing:   { duration: barFrames(7) },
  // 2:11 — Close (~17.5 s): callback inversion + URL + small Sui mark
  S09_Close:     { duration: barFrames(9) },
} as const;

export const TOTAL_FRAMES = Object.values(scenes).reduce(
  (sum, s) => sum + s.duration,
  0,
);
