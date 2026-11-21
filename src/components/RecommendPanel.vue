<template>
  <Modal :open="open" title="智能图表推荐" wide @close="$emit('close')">
    <p class="rec-intro">
      根据当前数据集的列类型、分类数量和行数生成建议。所有分析都在浏览器本地完成，数据不会上传。
    </p>

    <div v-if="result.suggestions.length" class="rec-list">
      <div v-for="item in result.suggestions" :key="item.key" class="rec-card">
        <div class="rec-top">
          <div class="rec-heading">
            <span class="rec-type">{{ chartTypeLabel(item.type) }}</span>
            <h4>{{ item.title }}</h4>
          </div>
          <span class="confidence">可信度 {{ Math.round(item.confidence * 100) }}%</span>
        </div>
        <ul class="reasons">
          <li v-for="(reason, index) in item.reasons" :key="index">{{ reason }}</li>
        </ul>
        <div class="rec-footer">
          <span class="rec-cols">
            X：{{ columnName(item.xColumnId) }} ·
            Y：{{ item.yColumnIds.map(columnName).join('、') }}
          </span>
          <button class="btn btn-primary btn-sm" @click="$emit('apply', item)">应用此建议</button>
        </div>
      </div>
    </div>

    <div v-else class="rec-empty">
      <p>{{ result.hint }}</p>
    </div>

    <template #footer>
      <p class="rec-note">规则式推荐 · 无需外部 API · 可随时在图表设置中调整</p>
      <button class="btn" @click="$emit('close')">关闭</button>
    </template>
  </Modal>
</template>

<script setup>
import { computed } from 'vue'
import Modal from './Modal.vue'
import { recommendCharts } from '../lib/recommend'
import { chartTypeLabel } from '../lib/chartTypes'

const props = defineProps({
  open: { type: Boolean, default: false },
  dataset: { type: Object, default: null },
  computedRows: { type: Array, default: () => [] }
})

defineEmits(['close', 'apply'])

const result = computed(() => {
  if (!props.dataset) return { suggestions: [], hint: '请先选择数据集' }
  return recommendCharts(props.dataset, props.computedRows)
})

function columnName(columnId) {
  return props.dataset?.columns.find((column) => column.id === columnId)?.name || '—'
}
</script>

<style scoped>
.rec-intro {
  font-size: 12.5px;
  line-height: 1.7;
  color: var(--text-2);
  background: var(--accent-soft);
  border-radius: var(--radius-sm);
  padding: 11px 14px;
  margin-bottom: 14px;
}

.rec-list {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.rec-card {
  padding: 14px 16px;
  border: 1px solid var(--border);
  border-radius: 12px;
  background: var(--surface-2);
  transition: border-color 0.15s ease, box-shadow 0.15s ease;
}

.rec-card:hover {
  border-color: #cdd6ee;
  box-shadow: var(--shadow-sm);
}

.rec-top {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 12px;
}

.rec-heading {
  display: flex;
  align-items: center;
  gap: 8px;
  min-width: 0;
}

.rec-type {
  flex: none;
  padding: 2px 8px;
  border-radius: 6px;
  background: var(--accent-soft-2);
  color: var(--accent);
  font-size: 11px;
  font-weight: 700;
}

.rec-heading h4 {
  font-size: 13.5px;
  font-weight: 650;
}

.confidence {
  flex: none;
  font-size: 11.5px;
  font-weight: 650;
  color: var(--success);
  background: var(--success-soft);
  padding: 2px 8px;
  border-radius: 999px;
}

.reasons {
  margin: 9px 0 11px;
  padding-left: 17px;
  font-size: 12.5px;
  line-height: 1.75;
  color: var(--text-2);
}

.reasons li::marker {
  color: var(--accent);
}

.rec-footer {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  flex-wrap: wrap;
}

.rec-cols {
  font-size: 11.5px;
  color: var(--text-3);
  font-family: var(--mono);
}

.rec-empty {
  padding: 30px 20px;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
  border: 1px dashed var(--border-strong);
  border-radius: 12px;
}

.rec-note {
  margin-right: auto;
  font-size: 11.5px;
  color: var(--text-3);
}
</style>
