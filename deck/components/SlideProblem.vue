<template>
  <div class="slide">
    <div class="wash wash-grid" />

    <div class="center-col">
      <div class="eyebrow-num rise d1">
        <span class="digit">00</span><span class="label">the problem</span>
      </div>

      <div class="headline rise d2">
        what breaks when you
        <span class="cont">point AI at your data.</span>
      </div>

      <div class="grid-hair mt-12 rise d3" style="grid-template-columns:1fr 1fr 1fr;">
        <div class="cell" v-click>
          <div class="tag">unprovable</div>
          <p>You can't prove what an agent actually read, kept, or leaked. You trust it on faith.</p>
        </div>
        <div class="cell" v-click>
          <div class="tag">not yours</div>
          <p>Your provider owns your files — and can read them anytime. Cancel, and they vanish.</p>
        </div>
        <div class="cell" v-click>
          <div class="tag">locked in</div>
          <p>Leaving means paying to get your own data back — a 100&nbsp;TB exit runs ~$8k in egress.</p>
        </div>
      </div>

      <div class="whynow mt-8" v-click>
        <span class="pill pill-krater">why now</span>
        <p class="muted">
          Regulators are moving. The EU&nbsp;AI&nbsp;Act will <strong>require</strong> audit trails you can't
          forge — fines up to 3% of global revenue. Today's tools only give you logs the vendor controls.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.whynow { display: flex; align-items: center; gap: var(--space-4); }
.whynow .pill { flex: 0 0 auto; }
.whynow p { font-size: 16px; max-width: 860px; }
</style>
