<template>
  <div class="toast-host">
    <TransitionGroup name="toast">
      <div v-for="item in toasts" :key="item.id" class="toast" :class="item.type">
        <span class="dot"></span>
        <span>{{ item.message }}</span>
      </div>
    </TransitionGroup>
  </div>
</template>

<script setup>
import { toasts } from '../composables/useToast'
</script>

<style scoped>
.toast-enter-active,
.toast-leave-active {
  transition: opacity 0.18s ease, transform 0.18s ease;
}

.toast-enter-from,
.toast-leave-to {
  opacity: 0;
  transform: translateY(8px);
}
</style>
