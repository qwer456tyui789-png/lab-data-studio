<template>
  <Modal :open="open" :title="isEditing ? '编辑列' : '添加列'" @close="$emit('close')">
    <form class="stack" @submit.prevent="submit">
      <div class="field">
        <label>列名</label>
        <input v-model="name" class="input" placeholder="例如：砝码质量(g)" maxlength="40" />
      </div>
      <div class="field">
        <label>数据类型</label>
        <select v-model="type" class="select" :disabled="isEditing && column?.formula">
          <option value="text">文本（分类、名称）</option>
          <option value="number">数值（参与计算与图表）</option>
          <option value="date">日期（YYYY-MM-DD）</option>
        </select>
        <p class="hint">数值列可以参与图表与公式；日期列适合按时间展示趋势。</p>
      </div>
      <p v-if="error" class="error-text">{{ error }}</p>
    </form>
    <template #footer>
      <button class="btn" @click="$emit('close')">取消</button>
      <button class="btn btn-primary" :disabled="!name.trim()" @click="submit">
        {{ isEditing ? '保存修改' : '添加列' }}
      </button>
    </template>
  </Modal>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Modal from './Modal.vue'
import { addColumn, updateColumn } from '../store/useStore'
import { useToast } from '../composables/useToast'

const props = defineProps({
  open: { type: Boolean, default: false },
  datasetId: { type: String, default: '' },
  column: { type: Object, default: null }
})

const emit = defineEmits(['close'])
const { push } = useToast()

const name = ref('')
const type = ref('text')
const error = ref('')

const isEditing = computed(() => Boolean(props.column))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    name.value = props.column?.name || ''
    type.value = props.column?.type || 'text'
    error.value = ''
  }
)

function submit() {
  error.value = ''
  try {
    if (isEditing.value) {
      updateColumn(props.datasetId, props.column.id, { name: name.value, type: type.value })
      push('列已更新', 'success')
    } else {
      addColumn(props.datasetId, { name: name.value, type: type.value })
      push('列已添加', 'success')
    }
    emit('close')
  } catch (err) {
    error.value = err.message || '操作失败'
  }
}
</script>
