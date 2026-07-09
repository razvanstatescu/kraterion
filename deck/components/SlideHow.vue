<template>
  <div class="slide">
    <div class="wash wash-grid" />

    <div class="center-col">
      <div class="eyebrow-num rise d1">
        <span class="digit">03</span><span class="label">how it works</span>
      </div>

      <div class="headline rise d2">
        simple to use.
        <span class="cont">impossible to fake.</span>
      </div>

      <div class="flow-rail mt-12 rise d3">
        <div class="node ticked">
          <div class="kicker mono">your files</div>
          <div class="name">Walrus</div>
          <div class="benefit">you own them — not us.</div>
          <img :src="'/brands/walrus.svg'" class="logo" />
        </div>

        <div class="conn"><span class="packet" /></div>

        <div class="node ticked">
          <div class="kicker mono">locked with</div>
          <div class="name">Seal</div>
          <div class="benefit">only you can unlock them.</div>
          <img :src="'/brands/seal.svg'" class="logo" />
        </div>

        <div class="conn"><span class="packet" /></div>

        <div class="node ticked">
          <div class="kicker mono">every action</div>
          <div class="name">Sui</div>
          <div class="benefit">a receipt no one can forge.</div>
          <img :src="'/brands/sui.svg'" class="logo" style="height:26px" />
        </div>
      </div>

      <div class="micro-row mt-8 rise d4">
        <span>it's just S3 to use</span><span class="sep">/</span>
        <span>it's on-chain, so it can't be faked</span>
      </div>
    </div>
  </div>
</template>

<style scoped>
.flow-rail { display: flex; align-items: stretch; gap: 0; }
.node {
  flex: 1 1 0; border: 1px solid var(--stone-200); border-radius: var(--radius-md);
  padding: var(--space-6); background: var(--stone-50);
  display: flex; flex-direction: column; gap: var(--space-2);
}
.node .kicker { font-size: 13px; color: var(--stone-500); }
.node .name { font-size: 26px; font-weight: 500; }
.node .benefit { font-size: 15px; color: var(--stone-600); }
.node .logo { height: 22px; width: auto; margin-top: 10px; opacity: .85; align-self: flex-start; }
.conn {
  flex: 0 0 56px; align-self: center; height: 1px; background: var(--stone-300);
  position: relative;
}
.packet {
  position: absolute; top: 50%; left: 0; width: 6px; height: 6px;
  transform: translate(-50%, -50%);
  border-radius: 999px; background: var(--krater);
  animation: packet-x 2.4s var(--ease) infinite;
}
.conn:nth-of-type(4) .packet { animation-delay: .8s; }
</style>
