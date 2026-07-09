<template>
  <div class="slide">
    <div class="wash wash-krater" />

    <div class="center-col">
      <div class="eyebrow-num rise d1">
        <span class="digit">01</span><span class="label">the solution</span>
      </div>

      <div class="cols">
        <div class="left rise d2">
          <div class="headline">
            own your files.
            <span class="cont">prove every agent action.</span>
          </div>
          <p class="lead mt-6" style="max-width:440px">
            S3-compatible storage where you own the files — and every agent action is written as a
            receipt anyone can verify.
          </p>
          <div class="receipt mt-8">
            <span class="dot-ok" />
            <span>run · <span class="hash">3f4d…ae</span> · read 2 objects · replayable&nbsp;✓</span>
          </div>
        </div>

        <div class="ledger ticked rise d3">
          <span class="tick-bl" /><span class="tick-br" />
          <div class="cap mono">three guarantees no cloud can match</div>
          <div class="row" v-click>
            <span class="idx mono">01</span>
            <div class="body"><div class="act">cancel us</div><div class="out">your files stay — on-chain, still yours</div></div>
          </div>
          <div class="row" v-click>
            <span class="idx mono">02</span>
            <div class="body"><div class="act">revoke us</div><div class="out">we <em>can't</em> read them — cryptographically</div></div>
          </div>
          <div class="row" v-click>
            <span class="idx mono">03</span>
            <div class="body"><div class="act">leave us</div><div class="out">your files come with you</div></div>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<style scoped>
.cols { display: grid; grid-template-columns: 1.02fr 0.98fr; gap: var(--space-16); align-items: center; }

.ledger {
  border: 1px solid var(--stone-200); border-radius: var(--radius-lg);
  background: var(--stone-50); padding: var(--space-4) var(--space-6) var(--space-2);
}
.ledger .cap {
  font-size: 11px; text-transform: uppercase; letter-spacing: var(--tracking-micro);
  color: var(--stone-500); padding: var(--space-2) 0 var(--space-4);
}
.ledger .row {
  display: flex; align-items: baseline; gap: var(--space-4);
  padding: var(--space-4) 0; border-top: 1px solid var(--stone-200);
}
.ledger .idx { color: var(--stone-400); font-size: 13px; padding-top: 4px; }
.ledger .act { font-size: 22px; font-weight: 500; letter-spacing: -0.01em; }
.ledger .act em { font-style: normal; color: var(--krater); }
.ledger .out { font-size: 15px; color: var(--stone-500); margin-top: 2px; }
.ledger .out em { font-style: normal; color: var(--krater); font-weight: 500; }
</style>
