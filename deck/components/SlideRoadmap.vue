<template>
  <div class="slide">
    <div class="wash wash-grid" />

    <div class="center-col">
      <div class="eyebrow-num rise d1">
        <span class="digit">07</span><span class="label">roadmap</span>
      </div>

      <div class="headline rise d2">where it goes.</div>

      <div class="rail mt-12 rise d3">
        <div class="step">
          <span class="node-dot done" />
          <div class="tag">now</div>
          <h3>testnet</h3>
          <p>working end-to-end; full S3 surface, on-chain receipts, live.</p>
        </div>
        <div class="track"><span class="packet" /></div>
        <div class="step">
          <span class="node-dot" />
          <div class="tag">next</div>
          <h3>mainnet</h3>
          <p>security audit, then production launch.</p>
        </div>
        <div class="track"><span class="packet" /></div>
        <div class="step">
          <span class="node-dot" />
          <div class="tag">then</div>
          <h3>programmable access</h3>
          <p>custom on-chain policies · Walrus Sites.</p>
        </div>
      </div>

      <div class="gtm mt-12 rise d4">
        <span class="pill pill-krater">go-to-market</span>
        <p class="muted">
          Adopting Kraterion means changing one URL — it spreads developer to developer, backed by our
          Walrus Foundation grant.
        </p>
      </div>
    </div>
  </div>
</template>

<style scoped>
.rail { display: flex; align-items: stretch; gap: 0; }
.step {
  flex: 1 1 0; position: relative; padding: var(--space-6);
  border: 1px solid var(--stone-200); border-radius: var(--radius-md); background: var(--stone-50);
}
.step .tag { font-family: var(--font-mono); font-size: 11px; color: var(--krater); margin-bottom: 8px; }
.step h3 { font-size: 21px; margin-bottom: 6px; }
.step p { font-size: 14px; color: var(--stone-600); }
.node-dot { position: absolute; top: -5px; left: 24px; width: 10px; height: 10px; border-radius: 999px;
  background: var(--cream); border: 1px solid var(--stone-400); }
.node-dot.done { background: var(--krater); border-color: var(--krater); }
.track { flex: 0 0 48px; align-self: center; height: 1px; background: var(--stone-300); position: relative; }
.packet { position: absolute; top: 50%; left: 0; width: 6px; height: 6px; border-radius: 999px;
  transform: translate(-50%, -50%); background: var(--krater); animation: packet-x 2.6s var(--ease) infinite; }
.track:nth-of-type(4) .packet { animation-delay: .9s; }
.gtm { display: flex; align-items: center; gap: var(--space-4); }
.gtm .pill { flex: 0 0 auto; }
.gtm p { font-size: 16px; max-width: 820px; }
</style>
