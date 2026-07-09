<!-- Kraterion aperture mark — three concentric rings.
     Canonical variants from design-system. Krater dot used sparingly. -->
<script setup lang="ts">
const props = defineProps<{
  variant?: 'light' | 'dark' | 'krater'
  size?: number
  pulse?: boolean
}>()

const palettes = {
  // for cream surfaces
  light: { outer: '#7C7158', middle: '#403930', dot: '#1A1610' },
  // for ink surfaces
  dark: { outer: '#7C7158', middle: '#F8F4EC', dot: '#C45B36' },
  // white-on-orange
  krater: { outer: '#F8F4EC', middle: '#F8F4EC', dot: '#F8F4EC' },
}
const p = palettes[props.variant ?? 'light']
const s = props.size ?? 96
</script>

<template>
  <svg
    :width="s" :height="s" viewBox="0 0 256 256"
    xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Kraterion"
    :class="{ 'k-pulse': pulse }"
  >
    <circle cx="128" cy="128" r="110" fill="none" :stroke="p.outer" stroke-width="6" data-ring="outer" />
    <circle cx="128" cy="128" r="68" fill="none" :stroke="p.middle" stroke-width="6" data-ring="middle" />
    <circle cx="128" cy="128" r="22" :fill="p.dot" data-ring="dot" />
  </svg>
</template>

<style scoped>
@keyframes k-aperture-pulse { 0%,100% { transform: scale(1) } 50% { transform: scale(1.05) } }
.k-pulse [data-ring="middle"] { transform-origin: center; animation: k-aperture-pulse 2.5s cubic-bezier(0.4,0,0.2,1) infinite; }
</style>
