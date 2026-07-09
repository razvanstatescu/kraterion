<template>
  <div class="slide">
    <div class="wash wash-krater" />

    <div class="fill">
      <div class="row between items-end rise d1">
        <div>
          <div class="eyebrow-num"><span class="digit">02</span><span class="label">demo</span></div>
          <div class="headline" style="font-size:38px">
            storage you own.
            <span class="cont">agents you can prove. working today.</span>
          </div>
        </div>
        <div class="micro-row"><span>recorded on testnet</span></div>
      </div>

      <div class="frame ticked grow mt-6 rise d2">
        <span class="tick-bl" /><span class="tick-br" />

        <!-- Drop the recorded clip here → deck/public/video/demo.mp4 -->
        <video
          v-if="hasVideo"
          :src="'/video/demo.mp4'"
          autoplay muted loop playsinline
          class="vid"
        />
        <div v-else class="placeholder">
          <Aperture variant="dark" :size="48" pulse />
          <p class="mono tertiary" style="font-size:13px; margin-top:12px">demo video → deck/public/video/demo.mp4</p>
        </div>

        <div class="beats">
          <span>upload</span><span class="sep">→</span>
          <span>revoke, read fails</span><span class="sep">→</span>
          <span>agent answers</span><span class="sep">→</span>
          <span class="accent">on-chain receipt</span><span class="sep">→</span>
          <span>replay verifies</span>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
// Flip to true once the clip exists; kept false so the frame renders cleanly meanwhile.
const hasVideo = false
</script>

<style scoped>
.frame {
  border: 1px solid var(--stone-700);
  border-radius: 12px;
  background:
    radial-gradient(80% 120% at 50% 0%, rgba(196,91,54,0.06), rgba(196,91,54,0) 60%),
    var(--stone-900);
  display: flex; align-items: center; justify-content: center;
  position: relative; overflow: hidden;
}
.vid { width: 100%; height: 100%; object-fit: cover; }
.placeholder { display: flex; flex-direction: column; align-items: center; text-align: center; }
.beats {
  position: absolute; bottom: 16px; left: 20px;
  display: flex; align-items: center; gap: 10px;
  font-family: var(--font-mono); font-size: 12px; letter-spacing: 0.04em;
  color: var(--stone-400);
}
.beats .sep { color: var(--stone-600); }
.beats .accent { color: var(--krater); }
</style>
