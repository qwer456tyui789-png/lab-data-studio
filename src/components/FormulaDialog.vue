<template>
  <Modal :open="open" :title="isEditing ? '编辑公式列' : '添加公式列'" wide @close="$emit('close')">
    <form class="stack" @submit.prevent="submit">
      <div class="field">
        <label>列名</label>
        <input v-model="name" class="input" placeholder="例如：重力加速度(m/s²)" maxlength="40" />
      </div>
      <div class="field">
        <label>公式表达式</label>
        <textarea
          v-model="expression"
          class="textarea formula-input"
          spellcheck="false"
          placeholder="例如：round(2*[下落高度(m)]/[下落时间(s)]^2, 2)"
        ></textarea>
        <p class="hint">
          用 <code>[列名]</code> 引用列；支持 <code>+ - * / ^</code> 与括号；函数：<code>abs</code>
          <code>sqrt</code> <code>round</code> <code>avg</code> <code>sum</code> <code>min</code>
          <code>max</code>。聚合函数作用于整列，例如 <code>avg([质量])</code>。
        </p>
      </div>

      <div class="preview">
        <div class="panel-label">实时预览</div>
        <div v-if="!preview" class="hint preview-empty">输入公式后显示前 3 行结果</div>
        <p v-else-if="preview.error" class="error-text">{{ preview.error }}</p>
        <div v-else class="preview-rows">
          <div v-for="item in preview.rows" :key="item.row" class="preview-row">
            <span class="muted small">第 {{ item.row }} 行</span>
            <span :class="item.error ? 'formula-error' : 'mono'">
              {{ item.error ? `#${item.error}` : item.display || '（空）' }}
            </span>
          </div>
        </div>
      </div>

      <p v-if="error" class="error-text">{{ error }}</p>
    </form>
    <template #footer>
      <button class="btn" @click="$emit('close')">取消</button>
      <button
        class="btn btn-primary"
        :disabled="!name.trim() || !expression.trim()"
        @click="submit"
      >
        {{ isEditing ? '保存公式' : '添加公式列' }}
      </button>
    </template>
  </Modal>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import Modal from './Modal.vue'
import { computeDataset, validateFormula } from '../lib/formula'
import { addColumn, updateColumn } from '../store/useStore'
import { useToast } from '../composables/useToast'

const props = defineProps({
  open: { type: Boolean, default: false },
  dataset: { type: Object, default: null },
  column: { type: Object, default: null }
})

const emit = defineEmits(['close'])
const { push } = useToast()

const name = ref('')
const expression = ref('')
const error = ref('')

const isEditing = computed(() => Boolean(props.column))

watch(
  () => props.open,
  (open) => {
    if (!open) return
    name.value = props.column?.name || ''
    expression.value = props.column?.formula || ''
    error.value = ''
  }
)

const preview = computed(() => {
  if (!props.dataset || !expression.value.trim()) return null
  const otherColumns = props.dataset.columns.filter((column) => column.id !== props.column?.id)
  const tempColumn = {
    id: '__preview__',
    name: name.value.trim() || '预览',
    type: 'number',
    formula: expression.value
  }
  try {
    const result = computeDataset({
      columns: [...otherColumns, tempColumn],
      rows: props.dataset.rows.slice(0, 3)
    })
    return {
      rows: result.rows.map((row, index) => ({
        row: index + 1,
        display: row.display.__preview__,
        error: row.errors.__preview__
      }))
    }
  } catch (err) {
    return { error: err.message || '公式暂不可计算' }
  }
})

function submit() {
  error.value = ''
  if (!props.dataset) return
  try {
    const trimmed = name.value.trim()
    if (
      props.dataset.columns.some(
        (column) => column.id !== props.column?.id && column.name.trim() === trimmed
      )
    ) {
      throw new Error(`列名「${trimmed}」已存在`)
    }
    const otherColumns = props.dataset.columns.filter((column) => column.id !== props.column?.id)
    validateFormula(expression.value, otherColumns, trimmed)
    if (isEditing.value) {
      updateColumn(props.dataset.id, props.column.id, {
        name: trimmed,
        type: 'number',
        formula: expression.value.trim()
      })
      push('公式已更新', 'success')
    } else {
      addColumn(props.dataset.id, {
        name: trimmed,
        type: 'number',
        formula: expression.value.trim()
      })
      push('公式列已添加', 'success')
    }
    emit('close')
  } catch (err) {
    error.value = err.message || '公式校验失败'
  }
}
</script>

<style scoped>
.formula-input {
  min-height: 88px;
  font-family: var(--mono);
  font-size: 12.5px;
}

code {
  padding: 1px 5px;
  border-radius: 5px;
  background: var(--surface-3);
  font-family: var(--mono);
  font-size: 11.5px;
  color: var(--text-2);
}

.preview {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 12px 14px;
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  border: 1px solid var(--border);
}

.preview-empty {
  padding: 4px 0;
}

.preview-rows {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  font-size: 12.5px;
}

.formula-error {
  color: var(--danger);
  font-family: var(--mono);
  font-size: 12px;
}
</style>
