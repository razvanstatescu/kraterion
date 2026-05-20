export const FPS = 30;

export const scenes = {
  S01_ColdOpen:        { from: 0,    duration: 120 },
  S02_MarkReveal:      { from: 120,  duration: 150 },
  S03_StatusQuo:       { from: 270,  duration: 270 },
  S04_Pivot:           { from: 540,  duration: 420 },
  S05_S3Swap:          { from: 960,  duration: 660 },
  S06_SuiWalrusSeal:   { from: 1620, duration: 780 },
  S07_Dashboard:       { from: 2400, duration: 300 },
  S08_ToggleKnowledge: { from: 2700, duration: 600 },
  S09_HeroTitle:       { from: 3300, duration: 150 },
  S10_AgentChat:       { from: 3450, duration: 1050 },
  S11_MCP:             { from: 4500, duration: 600 },
  S12_Outro:           { from: 5100, duration: 240 },
  S13_FadeOut:         { from: 5340, duration: 60 },
} as const;

export const TOTAL_FRAMES = 5400;
export const TEASER_FRAMES = 900;
