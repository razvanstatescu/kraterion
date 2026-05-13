/**
 * Diagonal wave of soft dots pulsing across the dark login pane. Each dot
 * sits on a grid intersection and shares a single keyframe — the per-dot
 * animation-delay ((row + col) * step) is what produces the traveling
 * wave. Pure CSS; no JS state.
 */

const COLS = 9;
const ROWS = 7;
const STEP_MS = 180;

export function GridPulse() {
  const dots: { row: number; col: number; delay: number }[] = [];
  for (let r = 0; r < ROWS; r++) {
    for (let c = 0; c < COLS; c++) {
      dots.push({ row: r, col: c, delay: (r + c) * STEP_MS });
    }
  }
  const stepX = 100 / (COLS - 1);
  const stepY = 100 / (ROWS - 1);

  return (
    <div className="ks-grid-pulse" aria-hidden="true">
      {dots.map(({ row, col, delay }) => (
        <span
          key={`${row}-${col}`}
          className="ks-grid-pulse-dot"
          style={{
            top: `${row * stepY}%`,
            left: `${col * stepX}%`,
            animationDelay: `${delay}ms`,
          }}
        />
      ))}
    </div>
  );
}
