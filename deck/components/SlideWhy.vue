<template>
  <div class="slide">
    <div class="wash wash-krater" />

    <div class="center-col">
      <div class="eyebrow-num rise d1">
        <span class="digit">04</span><span class="label">why Sui</span>
      </div>

      <div class="headline rise d2">
        this only works on Sui.
        <span class="cont">no other stack composes all three.</span>
      </div>

      <div class="grid-hair mt-12 rise d3" style="grid-template-columns:1fr 1fr 1fr;">
        <div class="cell">
          <div class="tag">owned storage</div>
          <h3>Walrus</h3>
          <p>durable storage the user owns — the platform doesn't hold it.</p>
        </div>
        <div class="cell">
          <div class="tag">cryptographic revocation</div>
          <h3>Seal</h3>
          <p>revoke and we lose the key — enforced by threshold cryptography, not our policy.</p>
        </div>
        <div class="cell">
          <div class="tag">unforgeable receipts</div>
          <h3>Sui</h3>
          <p>every action anchored on-chain — permanent, and verifiable by anyone.</p>
        </div>
      </div>

      <div class="foot-cap mt-8 rise d4">
        <span class="micro-row"><span>Sui-native by necessity, not decoration</span></span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.foot-cap { display: flex; justify-content: flex-end; }
</style>
