<template>
  <div class="slide slide-close">
    <div class="wash wash-krater" />
    <div class="wash wash-grid" />

    <div class="center-col gap-8">
      <div class="row items-center gap-4 rise d1">
        <Aperture variant="dark" :size="52" pulse />
        <span class="wordmark" style="font-size:24px">Kraterion</span>
      </div>

      <div class="headline rise d2" style="font-size:56px">
        storage you can't be locked out of.
        <span class="cont">a platform that can't lock you in.</span>
      </div>

      <p class="lead rise d3" style="max-width:700px">
        Built for the humans writing the code and the agents reading the data.
      </p>

      <div class="micro-row mt-4 rise d4">
        <span>built by the maker behind</span>
        <span class="accent">Inkray</span><span class="sep">·</span>
        <span class="accent">CoinDrip</span><span class="sep">·</span>
        <span class="accent">SuiDevHub</span>
      </div>
    </div>

    <div class="row items-center gap-4 foot fadein d5">
      <span class="pill pill-krater">kraterion.xyz</span>
      <span class="micro-row"><span>thank you</span></span>
    </div>
  </div>
</template>

<style scoped>
.foot { position: absolute; bottom: 52px; left: 72px; }
</style>
