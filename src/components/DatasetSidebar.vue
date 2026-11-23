<template>
  <aside class="sidebar">
    <div class="sidebar-head">
      <div>
        <div class="panel-label">工作区</div>
        <h2>数据集</h2>
      </div>
      <button class="btn btn-icon" title="新建数据集" @click="openCreate">
        <svg class="icon" viewBox="0 0 16 16" fill="none">
          <path d="M8 3v10M3 8h10" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </button>
    </div>

    <div class="ds-list scroll-y">
      <div
        v-for="dataset in store.datasets"
        :key="dataset.id"
        class="ds-item"
        :class="{ active: dataset.id === store.ui.activeDatasetId }"
        role="button"
        tabindex="0"
        @click="selectDataset(dataset.id)"
        @keydown.enter="selectDataset(dataset.id)"
      >
        <div class="ds-icon">
          <svg class="icon" viewBox="0 0 16 16" fill="none">
            <rect x="2.2" y="2.6" width="11.6" height="10.8" rx="2" stroke="currentColor" stroke-width="1.4" />
            <path d="M2.2 6.2h11.6M6.4 6.2v7.2" stroke="currentColor" stroke-width="1.4" />
          </svg>
        </div>
        <div class="ds-info">
          <div class="ds-name truncate">{{ dataset.name }}</div>
          <div class="ds-meta">{{ dataset.rows.length }} 行 · {{ dataset.columns.length }} 列</div>
        </div>
        <div class="ds-actions" @click.stop>
          <button class="ds-action" title="创建副本" @click="handleDuplicate(dataset)">
            <svg class="icon-sm" viewBox="0 0 16 16" fill="none">
              <rect x="5.2" y="5.2" width="8" height="8" rx="1.6" stroke="currentColor" stroke-width="1.4" />
              <path d="M10.8 5.2V3.6A1.6 1.6 0 0 0 9.2 2H3.6A1.6 1.6 0 0 0 2 3.6v5.6a1.6 1.6 0 0 0 1.6 1.6h1.6" stroke="currentColor" stroke-width="1.4" />
            </svg>
          </button>
          <button class="ds-action" title="重命名" @click="openRename(dataset)">
            <svg class="icon-sm" viewBox="0 0 16 16" fill="none">
              <path d="m3 13 1-4 7.1-7.1a1.6 1.6 0 0 1 2.3 0l.7.7a1.6 1.6 0 0 1 0 2.3L7 12l-4 1Z" stroke="currentColor" stroke-width="1.4" stroke-linejoin="round" />
            </svg>
          </button>
          <button class="ds-action danger" title="删除" @click="askDelete(dataset)">
            <svg class="icon-sm" viewBox="0 0 16 16" fill="none">
              <path d="M3.6 4.8h8.8M6.4 4.8V3.4c0-.6.4-1 1-1h1.2c.6 0 1 .4 1 1v1.4M4.6 4.8l.5 8c0 .6.5 1 1.1 1h3.6c.6 0 1.1-.4 1.1-1l.5-8" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
            </svg>
          </button>
        </div>
      </div>

      <div v-if="!store.datasets.length" class="sidebar-empty">
        <p>还没有数据集</p>
        <span>新建一个，或导入 CSV 开始记录</span>
      </div>
    </div>

    <div class="sidebar-foot">
      <button class="btn btn-primary btn-block" @click="openCreate">新建数据集</button>
      <button class="btn btn-block" @click="triggerImport">导入 CSV</button>
      <input ref="fileInput" type="file" accept=".csv,text/csv" hidden @change="handleFile" />
      <p class="hint">数据保存在浏览器 IndexedDB 中，刷新不会丢失。</p>
    </div>

    <Modal :open="createOpen" title="新建数据集" @close="createOpen = false">
      <div class="field">
        <label>数据集名称</label>
        <input
          v-model="createName"
          class="input"
          placeholder="例如：物理实验第 3 组"
          maxlength="40"
          @keyup.enter="submitCreate"
        />
      </div>
      <template #footer>
        <button class="btn" @click="createOpen = false">取消</button>
        <button class="btn btn-primary" @click="submitCreate">创建</button>
      </template>
    </Modal>

    <Modal :open="Boolean(renameTarget)" title="重命名数据集" @close="renameTarget = null">
      <div class="field">
        <label>新的名称</label>
        <input
          v-model="renameName"
          class="input"
          maxlength="40"
          @keyup.enter="submitRename"
        />
      </div>
      <template #footer>
        <button class="btn" @click="renameTarget = null">取消</button>
        <button class="btn btn-primary" @click="submitRename">保存</button>
      </template>
    </Modal>

    <ConfirmDialog
      :open="Boolean(deleteTarget)"
      title="删除数据集"
      :message="deleteMessage"
      confirm-text="删除数据集"
      @close="deleteTarget = null"
      @confirm="confirmDelete"
    />
  </aside>
</template>

<script setup>
import { computed, ref } from 'vue'
import Modal from './Modal.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import {
  store,
  selectDataset,
  createDataset,
  duplicateDataset,
  renameDataset,
  deleteDataset
} from '../store/useStore'
import { parseCSV, normalizeMatrix, inferColumnType } from '../lib/csv'
import { uid } from '../lib/id'
import { useToast } from '../composables/useToast'

const { push } = useToast()

const fileInput = ref(null)
const createOpen = ref(false)
const createName = ref('')
const renameTarget = ref(null)
const renameName = ref('')
const deleteTarget = ref(null)

const deleteMessage = computed(() => {
  if (!deleteTarget.value) return ''
  const chartCount = store.charts.filter(
    (chart) => chart.datasetId === deleteTarget.value.id
  ).length
  const chartPart = chartCount > 0 ? `同时删除 ${chartCount} 个关联图表。` : ''
  return `确定删除数据集「${deleteTarget.value.name}」吗？${chartPart}此操作不可撤销。`
})

function openCreate() {
  createName.value = ''
  createOpen.value = true
}

function submitCreate() {
  try {
    createDataset(createName.value.trim() || '新数据集')
    createOpen.value = false
    push('数据集已创建', 'success')
  } catch (error) {
    push(error.message || '创建失败', 'error')
  }
}

function openRename(dataset) {
  renameTarget.value = dataset
  renameName.value = dataset.name
}

function submitRename() {
  try {
    renameDataset(renameTarget.value.id, renameName.value)
    renameTarget.value = null
    push('数据集已重命名', 'success')
  } catch (error) {
    push(error.message || '重命名失败', 'error')
  }
}

function handleDuplicate(dataset) {
  duplicateDataset(dataset.id)
  push('已创建数据集副本', 'success')
}

function askDelete(dataset) {
  deleteTarget.value = dataset
}

function confirmDelete() {
  if (!deleteTarget.value) return
  deleteDataset(deleteTarget.value.id)
  deleteTarget.value = null
  push('数据集已删除', 'success')
}

function triggerImport() {
  fileInput.value?.click()
}

async function handleFile(event) {
  const file = event.target.files?.[0]
  if (!file) return
  event.target.value = ''
  try {
    const text = await file.text()
    const matrix = parseCSV(text)
    if (!matrix.length) throw new Error('文件内容为空')
    if (matrix[0].every((cell) => String(cell).trim() === '')) {
      throw new Error('第一行表头为空')
    }
    const normalized = normalizeMatrix(matrix)
    const seen = new Set()
    const headers = normalized[0].map((header, index) => {
      let name = String(header).trim() || `列${index + 1}`
      let suffix = 2
      while (seen.has(name)) {
        name = `${String(header).trim() || `列${index + 1}`}_${suffix}`
        suffix += 1
      }
      seen.add(name)
      return name
    })
    const dataRows = normalized
      .slice(1)
      .filter((row) => row.some((cell) => String(cell).trim() !== ''))
    const columns = headers.map((name, index) => ({
      id: uid('col'),
      name,
      type: inferColumnType(dataRows.map((row) => row[index])),
      formula: null
    }))
    const rows = dataRows.map((values) => {
      const cells = {}
      columns.forEach((column, index) => {
        cells[column.id] = values[index] ?? ''
      })
      return { id: uid('row'), cells }
    })
    const baseName = file.name.replace(/\.[^.]+$/, '') || '导入的数据'
    createDataset(baseName, { columns, rows })
    push(`已导入 ${rows.length} 行 × ${columns.length} 列`, 'success')
  } catch (error) {
    console.error(error)
    push(`CSV 导入失败：${error.message}`, 'error')
  }
}
</script>

<style scoped>
.sidebar {
  width: 254px;
  flex: none;
  display: flex;
  flex-direction: column;
  min-height: 0;
  background: var(--surface);
  border-right: 1px solid var(--border);
}

.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 18px 16px 10px;
}

.sidebar-head h2 {
  font-size: 16px;
  font-weight: 700;
  letter-spacing: -0.01em;
  margin-top: 2px;
}

.ds-list {
  flex: 1;
  min-height: 0;
  padding: 4px 10px 10px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.ds-item {
  display: flex;
  align-items: center;
  gap: 9px;
  padding: 9px 9px;
  border-radius: 10px;
  cursor: pointer;
  transition: background 0.14s ease;
  outline: none;
}

.ds-item:hover,
.ds-item:focus-visible {
  background: var(--surface-2);
}

.ds-item.active {
  background: var(--accent-soft);
}

.ds-icon {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 30px;
  height: 30px;
  flex: none;
  border-radius: 8px;
  background: var(--surface-3);
  color: var(--text-3);
}

.ds-item.active .ds-icon {
  background: #dfe5ff;
  color: var(--accent);
}

.ds-info {
  min-width: 0;
  flex: 1;
}

.ds-name {
  font-size: 13px;
  font-weight: 600;
  color: var(--text);
}

.ds-item.active .ds-name {
  color: var(--accent);
}

.ds-meta {
  font-size: 11px;
  color: var(--text-3);
  margin-top: 1px;
}

.ds-actions {
  display: flex;
  align-items: center;
  gap: 1px;
  opacity: 0;
  transition: opacity 0.14s ease;
}

.ds-item:hover .ds-actions,
.ds-item.active .ds-actions,
.ds-item:focus-within .ds-actions {
  opacity: 1;
}

.ds-action {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--text-3);
}

.ds-action:hover {
  background: rgba(255, 255, 255, 0.85);
  color: var(--text);
}

.ds-action.danger:hover {
  color: var(--danger);
  background: var(--danger-soft);
}

.sidebar-empty {
  margin: auto;
  padding: 30px 16px;
  text-align: center;
  color: var(--text-3);
  font-size: 12.5px;
}

.sidebar-empty p {
  font-weight: 600;
  color: var(--text-2);
  margin-bottom: 3px;
}

.sidebar-foot {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 14px 16px 16px;
  border-top: 1px solid var(--border);
}

.sidebar-foot .hint {
  margin-top: 2px;
}

/* refined dataset rail */
.sidebar {
  width: 264px;
  background: linear-gradient(180deg, #fbfcff 0%, #f6f8ff 100%);
  border-right-color: rgba(224, 229, 242, 0.95);
}

.sidebar-head {
  padding: 22px 18px 12px;
}

.sidebar-head h2 {
  font-size: 17px;
  letter-spacing: -0.025em;
}

.ds-list {
  padding: 6px 12px 12px;
  gap: 6px;
}

.ds-item {
  position: relative;
  gap: 10px;
  padding: 10px;
  border: 1px solid transparent;
  border-radius: 12px;
  transition: background 0.16s ease, border-color 0.16s ease, box-shadow 0.16s ease;
}

.ds-item:hover,
.ds-item:focus-visible {
  background: #ffffff;
  border-color: #e7ebf6;
  box-shadow: 0 5px 16px rgba(23, 32, 80, 0.05);
}

.ds-item.active {
  background: #ffffff;
  border-color: #dde4fb;
  box-shadow: 0 8px 22px rgba(75, 95, 232, 0.1);
}

.ds-item.active::before {
  content: "";
  position: absolute;
  left: -1px;
  top: 12px;
  bottom: 12px;
  width: 3px;
  border-radius: 0 4px 4px 0;
  background: linear-gradient(180deg, #6d7ffa, #7c5ce8);
}

.ds-icon {
  width: 32px;
  height: 32px;
  border-radius: 9px;
  background: #f0f3fb;
  color: #8a94aa;
}

.ds-item.active .ds-icon {
  background: linear-gradient(135deg, #eef1ff, #f3edff);
  color: var(--accent);
}

.ds-name {
  font-size: 13px;
  font-weight: 620;
}

.ds-item.active .ds-name {
  color: #3147c9;
}

.ds-meta {
  font-size: 10.5px;
  color: #939cb0;
}

.ds-actions {
  gap: 2px;
}

.ds-item.active .ds-actions {
  display: none;
}

.ds-item.active:hover .ds-actions,
.ds-item.active:focus-within .ds-actions {
  display: flex;
}

.ds-action {
  width: 25px;
  height: 25px;
  border-radius: 7px;
}

.ds-action:hover {
  background: #f1f4fc;
}

.sidebar-foot {
  gap: 9px;
  padding: 16px 18px 18px;
  background: rgba(255, 255, 255, 0.62);
  border-top-color: rgba(224, 229, 242, 0.95);
}

.sidebar-foot .hint {
  font-size: 11px;
  line-height: 1.55;
  color: #929bb0;
}

.sidebar-foot .btn-primary {
  height: 40px;
}
</style>
