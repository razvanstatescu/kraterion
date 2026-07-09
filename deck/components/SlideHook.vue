<template>
  <div class="slide slide-hook">
    <div class="wash wash-krater" />
    <div class="wash wash-grid" />

    <div class="center-col gap-8">
      <div class="row items-center gap-4 rise d1">
        <Aperture variant="dark" :size="60" pulse />
        <span class="wordmark" style="font-size:30px">Kraterion</span>
      </div>

      <div class="headline rise d2" style="font-size:68px">
        a verifiable runtime
        <span class="cont">for AI agents.</span>
      </div>

      <p class="lead rise d3" style="max-width:660px">
        Storage you actually own — where every move an AI agent makes over your data is provable.
      </p>

      <div class="micro-row mt-4 rise d4">
        <span>own your data</span><span class="sep">/</span>
        <span>prove your agents</span><span class="sep">/</span>
        <span>S3-compatible</span>
      </div>
    </div>

    <div class="row items-center gap-4 foot fadein d5">
      <span class="pill pill-krater">v0.1 · testnet</span>
      <span class="micro-row"><span>Sui Overflow 2026 — Walrus track</span></span>
    </div>
  </div>
</template>

<style scoped>
.foot { position: absolute; bottom: 52px; left: 72px; }
</style>
