<template>
  <div class="slide">
    <div class="wash wash-krater" />

    <div class="fill">
      <div class="eyebrow-num rise d1">
        <span class="digit">05</span><span class="label">market</span>
      </div>

      <div class="headline rise d2" style="font-size:42px">
        a $15B market, colliding
        <span class="cont">with a $12B one.</span>
      </div>

      <div class="band">
        <div class="left rise d3">
          <p class="focal">
            88% of companies use AI.<br />
            <span class="accent">8%</span> can govern it.
          </p>
          <p class="muted buyers mt-6">
            Buyers: developers escaping cloud lock-in, and enterprise AI teams facing the compliance
            deadline — AI governance alone reaches $5.6B by 2030.
          </p>
        </div>

        <div class="chart-box rise d3">
          <!-- Lines/areas: SVG with non-scaling strokes (shape fills the box) -->
          <svg class="svg" viewBox="0 0 100 100" preserveAspectRatio="none">
            <line x1="6" y1="88" x2="92" y2="88" class="axis" />
            <polygon class="area area-stone"
              points="6,67.3 20.3,65.2 34.7,63.1 49,61.1 63.3,59 77.7,56.9 92,54.8 92,88 6,88" />
            <polyline class="line line-stone"
              points="6,67.3 20.3,65.2 34.7,63.1 49,61.1 63.3,59 77.7,56.9 92,54.8" />
            <polygon class="area area-krater"
              points="6,81.1 20.3,77.6 34.7,72.8 49,65.9 63.3,54.8 77.7,39.6 92,18.9 92,88 6,88" />
            <polyline class="line line-krater"
              points="6,81.1 20.3,77.6 34.7,72.8 49,65.9 63.3,54.8 77.7,39.6 92,18.9" />
          </svg>

          <!-- Collision guide + everything that must stay proportional: HTML overlay -->
          <div class="guide" style="left:63.3%" />
          <div class="dot dot-stone" style="left:92%; top:54.8%" />
          <div class="dot dot-krater" style="left:92%; top:18.9%" />

          <div class="lbl lbl-krater">AI agents <span class="up">↑</span> ~45%/yr</div>
          <div class="lbl lbl-stone">object storage · ~$15B+</div>
          <div class="lbl lbl-collide" style="left:63.3%">collision ~2028</div>

          <div class="xaxis">
            <span style="left:6%">2024</span>
            <span style="left:63.3%">2028</span>
            <span style="left:92%">2030</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.fill { height: 100%; display: flex; flex-direction: column; }

.band {
  flex: 1; display: grid; grid-template-columns: 0.8fr 1.2fr; gap: var(--space-12);
  align-items: center; margin-top: var(--space-6);
}
.focal { font-size: 30px; font-weight: 500; line-height: 1.15; letter-spacing: -0.02em; }
.focal .accent { color: var(--krater); }
.buyers { font-size: 14px; max-width: 420px; }

/* ---- chart ---- */
.chart-box { position: relative; height: 300px; }
.svg { position: absolute; inset: 0; width: 100%; height: 100%; display: block; }
.axis { stroke: var(--stone-400); stroke-width: 1; vector-effect: non-scaling-stroke; }
.area-stone { fill: rgba(124,113,88,0.07); }
.area-krater { fill: rgba(196,91,54,0.09); }
.line {
  fill: none; stroke-width: 2.5; vector-effect: non-scaling-stroke;
  stroke-linecap: round; stroke-linejoin: round;
  stroke-dasharray: 400; --len: 400; animation: draw 1.5s var(--ease) .25s both;
}
.line-stone { stroke: var(--stone-500); }
.line-krater { stroke: var(--krater); animation-delay: .4s; }

.guide {
  position: absolute; top: 34%; bottom: 12%; width: 1px;
  background: repeating-linear-gradient(var(--stone-300) 0 3px, transparent 3px 8px);
  transform: translateX(-50%);
}
.dot { position: absolute; width: 9px; height: 9px; border-radius: 999px; transform: translate(-50%,-50%); }
.dot-stone { background: var(--stone-500); }
.dot-krater { background: var(--krater); animation: pulse-dot 2.4s var(--ease) infinite 1.8s; }

.lbl { position: absolute; font-size: 13px; font-weight: 500; white-space: nowrap; }
.lbl-krater { top: 6%; right: 2%; color: var(--krater); }
.lbl-krater .up { font-size: 11px; }
.lbl-stone { top: 46%; right: 2%; color: var(--stone-500); }
.lbl-collide {
  top: 26%; transform: translateX(-50%); font-family: var(--font-mono);
  font-size: 10px; letter-spacing: 0.04em; color: var(--stone-500);
}

.xaxis { position: absolute; left: 0; right: 0; bottom: -22px; height: 14px; }
.xaxis span {
  position: absolute; transform: translateX(-50%);
  font-family: var(--font-mono); font-size: 11px; color: var(--stone-400);
}
</style>
