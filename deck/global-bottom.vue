<!-- Persistent page furniture on every slide: quiet mono page number. -->
<script setup lang="ts">
import { useNav } from '@slidev/client'
const { currentPage, total } = useNav()
</script>

<template>
  <div class="deck-foot">
    {{ String(currentPage).padStart(2, '0') }} <span class="slash">/</span> {{ total }}
  </div>
</template>

<style>
.deck-foot {
  position: absolute; right: 28px; bottom: 22px; z-index: 20;
  font-family: var(--font-mono); font-size: 11px; letter-spacing: 0.08em;
  color: var(--stone-500); pointer-events: none;
  font-feature-settings: "tnum" 1, "lnum" 1;
}
.deck-foot .slash { color: var(--stone-400); margin: 0 2px; }
.slide-ink .deck-foot { color: var(--stone-400); }
</style>
