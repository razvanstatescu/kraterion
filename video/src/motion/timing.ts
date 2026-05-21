/**
 * Timing grid — v6 (interactive-session rebuild).
 *
 *   S00 Problem       — "Your storage isn't yours."           (4 s)
 *   S01 Shift         — "Until now."                           (3 s)
 *   S02 Slam          — "Kraterion." + mark                    (5 s)
 *   S03 Session       — INTERACTIVE: bucket → file → inspector
 *                       → on-chain → knowledge tab → search    (24 s)
 *   S04 Verifiable    — lattice forms (proof-of-index on Sui)  (8 s)
 *   S05 Agents        — "Your key. Our API." (OpenAI-compatible) (8 s)
 *   S06 MCP           — "Any agent. That speaks MCP."          (9 s)
 *   S07 WOW Orbit     — Walrus + Sui + Seal composability     (15 s)
 *   S08 Close         — "Object storage. Stays yours."         (6 s)
 *
 * Total: ~82 s. Two act-boundary fades only.
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
  S00_Problem:     { duration: seconds(4)  },
  S01_Promise:     { duration: seconds(3)  },
  S02_S3Swap:      { duration: seconds(5)  },
  S03_Buckets:     { duration: seconds(24) },   // INTERACTIVE SESSION
  S04_Knowledge:   { duration: seconds(8)  },
  S05_Agents:      { duration: seconds(8)  },
  S06_RAG:         { duration: seconds(9)  },   // MCP
  S07_MCP:         { duration: seconds(15) },   // WOW orbit
  S08_Billing:     { duration: seconds(6)  },   // Close
  S09_Close:       { duration: seconds(0)  },   // (unused)
} as const;

export const TRANSITION_FRAMES = 8;
const NUM_TRANSITIONS = 2;

export const TOTAL_FRAMES =
  Object.values(scenes).reduce((sum, s) => sum + s.duration, 0) -
  TRANSITION_FRAMES * NUM_TRANSITIONS;
