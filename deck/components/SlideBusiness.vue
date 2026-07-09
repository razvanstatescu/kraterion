<template>
  <div class="slide">
    <div class="wash wash-krater-tl" />

    <div class="center-col">
      <div class="eyebrow-num rise d1">
        <span class="digit">06</span><span class="label">business model</span>
      </div>

      <div class="cols">
        <div class="left rise d2">
          <div class="headline">
            we monetize like
            <span class="cont">Vercel and Supabase.</span>
          </div>
          <p class="lead mt-6" style="max-width:480px">
            Product-led and usage-based: developers start free, self-serve, and we earn more only as
            their usage grows. No sales gate. No lock-in.
          </p>
          <div class="micro-row mt-8">
            <span>egress ~9× cheaper than S3</span><span class="sep">/</span>
            <span>recurring storage</span><span class="sep">/</span>
            <span>near-zero CAC</span>
          </div>
        </div>

        <div class="card chart-card rise d3 ticked">
          <span class="tick-bl" /><span class="tick-br" />
          <div class="row between items-center">
            <span class="mono" style="font-size:13px; color:var(--stone-500)">Supabase ARR</span>
            <span class="cite">same motion we run</span>
          </div>

          <div class="bars">
            <div class="bar" v-for="(b, i) in bars" :key="b.year">
              <span class="val">{{ b.label }}</span>
              <span class="col" :style="{ height: b.h + 'px', animationDelay: (0.25 + i * 0.14) + 's' }" />
              <span class="yr mono">{{ b.year }}</span>
            </div>
          </div>

          <div class="vercel">
            <span class="dot-ok" style="background:var(--krater)" />
            <span class="mono" style="font-size:13px; color:var(--stone-600)">Vercel · ~$200M ARR · 1.7M developers</span>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// $30M (2024) → $70M (2025) → $170M (2026). Scaled to 168px max.
const max = 170
const raw = [
  { year: "'24", v: 30, label: '$30M' },
  { year: "'25", v: 70, label: '$70M' },
  { year: "'26", v: 170, label: '$170M' },
]
const bars = raw.map(b => ({ ...b, h: Math.round((b.v / max) * 168) }))
</script>

<style scoped>
.cols { display: grid; grid-template-columns: 1fr 0.85fr; gap: var(--space-16); align-items: center; }
.chart-card { display: flex; flex-direction: column; gap: var(--space-4); }
.bars { display: flex; align-items: flex-end; justify-content: space-around; height: 210px; gap: var(--space-6); padding: 0 var(--space-2); }
.bar { display: flex; flex-direction: column; align-items: center; gap: 8px; }
.bar .col {
  width: 56px; background: var(--krater); border-radius: 4px 4px 0 0;
  transform-origin: bottom; animation: grow-y .6s var(--ease) both;
}
.bar:nth-child(1) .col { background: var(--stone-400); }
.bar:nth-child(2) .col { background: var(--stone-500); }
.bar .val { font-size: 17px; font-weight: 500; }
.bar .yr { font-size: 12px; color: var(--stone-500); }
.vercel { display: flex; align-items: center; gap: 10px; border-top: 1px solid var(--border); padding-top: var(--space-4); }
</style>
