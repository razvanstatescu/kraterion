/**
 * Timing grid — v5 (dynamic rebuild, research-validated).
 *
 * 9-scene arc, ~75 s total. Tighter per Stripe-launch benchmark
 * (research said 2 min is too long for an infra product; 75 s hovers).
 *
 * Story (per user direction + research):
 *   S00 Problem      — "Your storage isn't yours."  (cold open)
 *   S01 Shift        — "Until now."                 (the pivot)
 *   S02 Slam         — "Kraterion."                 (type slam, mark appears)
 *   S03 Identity     — "Smart object storage. Humans + agents."
 *   S04 Verifiable   — Knowledge base, on-chain proof
 *   S05 Agents       — OpenAI-compatible
 *   S06 MCP          — Claude / Cursor integration
 *   S07 WOW Orbit    — Walrus + Sui + Seal composability (the screenshot)
 *   S08 Close        — "Object storage. Stays yours."
 */

export const FPS = 30;
export const BPM = 124;
export const MUSIC_START = 30;

export const BEAT = (60 / BPM) * FPS;
export const BAR = BEAT * 4;
export const HALF = BEAT / 2;
export const QUARTER = BEAT / 4;

const seconds = (s: number) => Math.round(s * FPS);

export const scenes = {
  S00_Problem:     { duration: seconds(4)  },   // 4 s  — cold open indictment
  S01_Promise:     { duration: seconds(3)  },   // 3 s  — "Until now."
  S02_S3Swap:      { duration: seconds(5)  },   // 5 s  — "Kraterion." slam + mark
  S03_Buckets:     { duration: seconds(11) },   // 11 s — S3 identity (renamed concept)
  S04_Knowledge:   { duration: seconds(9)  },   // 9 s  — verifiable knowledge
  S05_Agents:      { duration: seconds(8)  },   // 8 s  — agents
  S06_RAG:         { duration: seconds(9)  },   // 9 s  — MCP (reused slot)
  S07_MCP:         { duration: seconds(17) },   // 17 s — WOW orbit (Walrus+Sui+Seal)
  S08_Billing:     { duration: seconds(9)  },   // 9 s  — close
  S09_Close:       { duration: seconds(0)  },   // unused; kept for layout-key stability
} as const;

/** Brief 8-frame fade only at major act boundaries. */
export const TRANSITION_FRAMES = 8;
const NUM_TRANSITIONS = 2;

export const TOTAL_FRAMES =
  Object.values(scenes).reduce((sum, s) => sum + s.duration, 0) -
  TRANSITION_FRAMES * NUM_TRANSITIONS;
