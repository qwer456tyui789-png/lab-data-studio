import { reactive } from 'vue'

export const toasts = reactive([])
let sequence = 0

export function useToast() {
  function push(message, type = 'info', duration = 2800) {
    const id = ++sequence
    toasts.push({ id, message, type })
    setTimeout(() => {
      const index = toasts.findIndex((item) => item.id === id)
      if (index !== -1) toasts.splice(index, 1)
    }, duration)
  }
  return { push }
}
