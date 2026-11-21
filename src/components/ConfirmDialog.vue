<template>
  <Modal :open="open" :title="title" @close="$emit('close')">
    <p class="confirm-message">{{ message }}</p>
    <template #footer>
      <button class="btn" @click="$emit('close')">取消</button>
      <button class="btn btn-danger" @click="$emit('confirm')">{{ confirmText }}</button>
    </template>
  </Modal>
</template>

<script setup>
import Modal from './Modal.vue'

defineProps({
  open: { type: Boolean, default: false },
  title: { type: String, default: '确认操作' },
  message: { type: String, default: '' },
  confirmText: { type: String, default: '确认' }
})

defineEmits(['close', 'confirm'])
</script>

<style scoped>
.confirm-message {
  font-size: 13.5px;
  line-height: 1.7;
  color: var(--text-2);
}
</style>
