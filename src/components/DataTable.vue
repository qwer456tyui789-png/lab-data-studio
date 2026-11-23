<template>
  <section v-if="!dataset" class="data-view">
    <div class="card empty-state">
      <div class="empty-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="4" width="18" height="16" rx="3" stroke="currentColor" stroke-width="1.6" />
          <path d="M3 9h18M9 9v11" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </div>
      <h3>还没有选择数据集</h3>
      <p>在左侧新建一个数据集，然后开始录入实验数据。</p>
    </div>
  </section>

  <section v-else class="data-view">
    <div class="view-head">
      <div>
        <h2>{{ dataset.name }}</h2>
        <p class="view-sub">
          {{ dataset.rows.length }} 行 × {{ dataset.columns.length }} 列
          · 直接点击单元格输入，也可从 Excel 复制区域后粘贴
        </p>
      </div>
      <div class="row toolbar">
        <button class="btn btn-sm" @click="addRows(dataset.id)">＋ 行</button>
        <button class="btn btn-sm" @click="openAddColumn">＋ 列</button>
        <button class="btn btn-sm btn-subtle" @click="openFormula">ƒ 公式列</button>
        <button class="btn btn-sm" @click="exportCSV">导出 CSV</button>
      </div>
    </div>

    <div v-if="!dataset.columns.length" class="card empty-state">
      <div class="empty-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M12 5v14M5 12h14" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" />
        </svg>
      </div>
      <h3>数据集还没有列</h3>
      <p>先添加一列，才能开始录入数据。</p>
      <button class="btn btn-primary btn-sm" @click="openAddColumn">添加第一列</button>
    </div>

    <div v-else class="card table-card">
      <div class="table-scroll">
        <table class="data-grid">
          <thead>
            <tr>
              <th class="index-col">#</th>
              <th
                v-for="column in dataset.columns"
                :key="column.id"
                :class="{ 'formula-col': column.formula }"
              >
                <div class="th-inner">
                  <button
                    class="th-name"
                    :title="column.formula ? '编辑公式列' : '编辑列'"
                    @click="editColumn(column)"
                  >
                    <span v-if="column.formula" class="fx-mark">ƒ</span>
                    {{ column.name }}
                  </button>
                  <span class="badge" :class="badgeClass(column)">{{ badgeText(column) }}</span>
                  <button class="th-del" title="删除列" @click="askDeleteColumn(column)">×</button>
                </div>
              </th>
              <th class="action-col"></th>
            </tr>
          </thead>
          <tbody>
            <tr v-for="(row, rowIndex) in dataset.rows" :key="row.id">
              <td class="index-col">{{ rowIndex + 1 }}</td>
              <td
                v-for="(column, columnIndex) in dataset.columns"
                :key="column.id"
                class="cell"
                :class="{ 'formula-col': column.formula }"
              >
                <div
                  v-if="column.formula"
                  class="formula-cell"
                  :class="{ invalid: Boolean(errorOf(row, column)) }"
                  :title="
                    errorOf(row, column)
                      ? ERROR_TEXT[errorOf(row, column)] || errorOf(row, column)
                      : column.formula
                  "
                >
                  <span>{{ displayOf(row, column) }}</span>
                </div>
                <input
                  v-else
                  class="cell-input"
                  :class="{
                    invalid:
                      Boolean(errorOf(row, column)) &&
                      String(row.cells?.[column.id] ?? '').trim() !== ''
                  }"
                  :value="row.cells?.[column.id] ?? ''"
                  :inputmode="column.type === 'number' ? 'decimal' : undefined"
                  :placeholder="column.type === 'date' ? 'YYYY-MM-DD' : '—'"
                  :title="
                    errorOf(row, column)
                      ? ERROR_TEXT[errorOf(row, column)] || errorOf(row, column)
                      : ''
                  "
                  @input="onCellInput(row, column, $event)"
                  @paste="onPaste(rowIndex, columnIndex, $event)"
                />
              </td>
              <td class="action-col">
                <button
                  class="row-del"
                  title="删除此行"
                  @click="deleteRow(dataset.id, row.id)"
                >
                  ×
                </button>
              </td>
            </tr>
          </tbody>
        </table>
        <div v-if="!dataset.rows.length" class="table-empty">
          还没有数据行，点击下方「添加一行」开始录入。
        </div>
      </div>
      <div class="table-foot">
        <button class="btn btn-ghost btn-sm" @click="addRows(dataset.id)">＋ 添加一行</button>
        <span class="hint">
          支持多行多列粘贴；数值列会校验格式，公式列自动计算并标出错误。
        </span>
      </div>
    </div>

    <ColumnDialog
      :open="columnDialog.open"
      :dataset-id="dataset.id"
      :column="columnDialog.column"
      @close="columnDialog = { open: false, column: null }"
    />
    <FormulaDialog
      :open="formulaDialog.open"
      :dataset="dataset"
      :column="formulaDialog.column"
      @close="formulaDialog = { open: false, column: null }"
    />
    <ConfirmDialog
      :open="Boolean(deleteTarget)"
      title="删除列"
      :message="deleteMessage"
      confirm-text="删除列"
      @close="deleteTarget = null"
      @confirm="confirmDeleteColumn"
    />
  </section>
</template>

<script setup>
import { computed, ref } from 'vue'
import ColumnDialog from './ColumnDialog.vue'
import FormulaDialog from './FormulaDialog.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { computeDataset, ERROR_TEXT } from '../lib/formula'
import { parseTSV, serializeCSV } from '../lib/csv'
import { downloadText, sanitizeFilename } from '../lib/download'
import {
  addRows,
  deleteColumn,
  deleteRow,
  pasteBlock,
  setCell
} from '../store/useStore'
import { useToast } from '../composables/useToast'

const props = defineProps({
  dataset: { type: Object, default: null }
})

const { push } = useToast()

const columnDialog = ref({ open: false, column: null })
const formulaDialog = ref({ open: false, column: null })
const deleteTarget = ref(null)

const computedRows = computed(() =>
  props.dataset ? computeDataset(props.dataset).rows : []
)

const rowMap = computed(() => {
  const map = new Map()
  for (const row of computedRows.value) map.set(row.id, row)
  return map
})

function errorOf(row, column) {
  return rowMap.value.get(row.id)?.errors?.[column.id] || null
}

function displayOf(row, column) {
  return rowMap.value.get(row.id)?.display?.[column.id] ?? ''
}

const deleteMessage = computed(() => {
  if (!deleteTarget.value) return ''
  const name = deleteTarget.value.name
  return `确定删除列「${name}」吗？引用该列的公式与图表会被调整，此操作不可撤销。`
})

function badgeClass(column) {
  if (column.formula) return 'badge-formula'
  if (column.type === 'number') return 'badge-number'
  if (column.type === 'date') return 'badge-date'
  return 'badge-text'
}

function badgeText(column) {
  if (column.formula) return '公式'
  if (column.type === 'number') return '数值'
  if (column.type === 'date') return '日期'
  return '文本'
}

function openAddColumn() {
  columnDialog.value = { open: true, column: null }
}

function openFormula() {
  formulaDialog.value = { open: true, column: null }
}

function editColumn(column) {
  if (column.formula) formulaDialog.value = { open: true, column }
  else columnDialog.value = { open: true, column }
}

function askDeleteColumn(column) {
  deleteTarget.value = column
}

function confirmDeleteColumn() {
  if (!deleteTarget.value || !props.dataset) return
  deleteColumn(props.dataset.id, deleteTarget.value.id)
  deleteTarget.value = null
  push('列已删除', 'success')
}

function onCellInput(row, column, event) {
  setCell(props.dataset.id, row.id, column.id, event.target.value)
}

function onPaste(rowIndex, columnIndex, event) {
  const text = event.clipboardData?.getData('text/plain') || ''
  if (!text.includes('\t') && !text.includes('\n')) return
  event.preventDefault()
  const matrix = parseTSV(text)
  if (!matrix.length) return
  const result = pasteBlock(props.dataset.id, rowIndex, columnIndex, matrix)
  const parts = ['已粘贴数据']
  if (result.rowsAdded) parts.push(`新增 ${result.rowsAdded} 行`)
  if (result.columnsAdded) parts.push(`新增 ${result.columnsAdded} 列`)
  push(parts.join('，'), 'success')
}

function exportCSV() {
  if (!props.dataset) return
  const columns = props.dataset.columns
  const matrix = [
    columns.map((column) => column.name),
    ...computedRows.value.map((row) =>
      columns.map((column) => row.display?.[column.id] ?? '')
    )
  ]
  downloadText(
    `${sanitizeFilename(props.dataset.name)}.csv`,
    serializeCSV(matrix)
  )
  push('CSV 已导出', 'success')
}
</script>

<style scoped>
.data-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
  height: 100%;
  min-height: 0;
}

.view-head {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 18px;
  flex-wrap: wrap;
}

.view-head h2 {
  font-size: 20px;
  font-weight: 720;
  letter-spacing: -0.02em;
}

.view-sub {
  margin-top: 4px;
  font-size: 12.5px;
  color: var(--text-3);
}

.toolbar {
  flex-wrap: wrap;
}

.table-card {
  display: flex;
  flex-direction: column;
  min-height: 0;
  flex: 1;
  overflow: hidden;
}

.table-scroll {
  overflow: auto;
  min-height: 0;
  flex: 1;
}

.data-grid {
  width: 100%;
  border-collapse: separate;
  border-spacing: 0;
  font-size: 13px;
}

.data-grid th {
  position: sticky;
  top: 0;
  z-index: 2;
  background: var(--surface-2);
  border-bottom: 1px solid var(--border);
  text-align: left;
  padding: 0;
  white-space: nowrap;
}

.th-inner {
  display: flex;
  align-items: center;
  gap: 7px;
  padding: 10px 10px 9px 12px;
  min-width: 168px;
}

.th-name {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font-size: 12.5px;
  font-weight: 650;
  color: var(--text);
  max-width: 220px;
  overflow: hidden;
  text-overflow: ellipsis;
  padding: 2px 4px;
  border-radius: 6px;
}

.th-name:hover {
  background: var(--surface-3);
  color: var(--accent);
}

.fx-mark {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 15px;
  height: 15px;
  border-radius: 4px;
  background: #f0ebfe;
  color: #6b4fd8;
  font-size: 11px;
  font-weight: 700;
  flex: none;
}

.th-del {
  margin-left: auto;
  width: 20px;
  height: 20px;
  border-radius: 5px;
  color: var(--text-3);
  font-size: 15px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.12s ease, background 0.12s ease;
}

.data-grid th:hover .th-del {
  opacity: 1;
}

.th-del:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.index-col {
  width: 46px;
  min-width: 46px;
  max-width: 46px;
  padding: 0 !important;
  text-align: center !important;
  color: var(--text-3);
  font-size: 11.5px;
  font-variant-numeric: tabular-nums;
  background: var(--surface-2);
  border-right: 1px solid var(--border);
}

thead .index-col {
  background: var(--surface-2);
}

.action-col {
  width: 38px;
  min-width: 38px;
  max-width: 38px;
  padding: 0 !important;
}

.data-grid tbody td {
  border-bottom: 1px solid #edf0f6;
  background: var(--surface);
}

.data-grid tbody tr:hover td {
  background: #fafbff;
}

.data-grid tbody tr:hover .index-col {
  background: #f3f5fb;
}

.cell {
  padding: 0;
  min-width: 168px;
}

.cell-input {
  width: 100%;
  min-width: 168px;
  height: 38px;
  padding: 0 12px;
  border: none;
  outline: none;
  background: transparent;
  font-size: 13px;
  color: var(--text);
  font-variant-numeric: tabular-nums;
}

.cell-input:focus {
  box-shadow: inset 0 0 0 2px var(--accent);
  background: #fbfcff;
}

.cell-input.invalid {
  color: var(--danger);
  box-shadow: inset 0 0 0 1.5px #f0b4b4;
}

.cell-input::placeholder {
  color: #c2c8d6;
}

.formula-col {
  background: #fbfaff;
}

.data-grid tbody tr:hover .formula-col {
  background: #f8f6ff;
}

.formula-cell {
  display: flex;
  align-items: center;
  height: 38px;
  padding: 0 12px;
  font-family: var(--mono);
  font-size: 12.5px;
  color: #5f49c0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.formula-cell.invalid {
  color: var(--danger);
  background: #fff7f7;
}

.row-del {
  width: 24px;
  height: 24px;
  border-radius: 6px;
  color: var(--text-3);
  font-size: 15px;
  line-height: 1;
  opacity: 0;
  transition: opacity 0.12s ease, background 0.12s ease;
}

.data-grid tbody tr:hover .row-del {
  opacity: 1;
}

.row-del:hover {
  background: var(--danger-soft);
  color: var(--danger);
}

.table-empty {
  padding: 34px;
  text-align: center;
  color: var(--text-3);
  font-size: 13px;
}

.table-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 9px 14px;
  border-top: 1px solid var(--border);
  background: var(--surface);
  flex-wrap: wrap;
}

/* editorial data sheet */
.view-head h2 {
  font-size: 22px;
  font-weight: 760;
  letter-spacing: -0.035em;
}

.view-sub {
  margin-top: 5px;
  font-size: 12.5px;
  color: #8b94a9;
}

.table-card {
  border-radius: 18px;
  box-shadow: 0 1px 2px rgba(20, 30, 70, 0.04), 0 14px 36px rgba(23, 32, 80, 0.05);
}

.data-grid th {
  background: #f8faff;
  border-bottom-color: #e3e8f4;
}

.th-inner {
  gap: 8px;
  padding: 12px 12px 11px 14px;
  min-width: 176px;
}

.th-name {
  font-size: 12.5px;
  font-weight: 660;
  color: #3d4761;
}

.th-name:hover {
  background: #eef2ff;
}

.index-col {
  width: 48px;
  min-width: 48px;
  max-width: 48px;
  background: #f8faff;
  border-right-color: #e8ecf6;
  color: #9aa3b6;
  font-family: var(--mono);
  font-size: 10.5px;
}

.data-grid tbody td {
  border-bottom-color: #eff2f9;
}

.data-grid tbody tr:hover td {
  background: #f9fbff;
}

.data-grid tbody tr:hover .index-col {
  background: #f2f6ff;
}

.cell-input {
  height: 42px;
  padding: 0 14px;
  font-size: 13px;
}

.cell-input:focus {
  background: #fbfcff;
  box-shadow: inset 0 0 0 2px var(--accent);
}

.formula-cell {
  height: 42px;
  padding: 0 14px;
  font-size: 12px;
  color: #6650c7;
}

.table-foot {
  padding: 10px 16px;
  background: #fbfcff;
  font-size: 12px;
}

.table-foot .btn {
  height: 32px;
  padding: 0 11px;
  font-size: 12px;
}

.table-empty {
  font-size: 12.5px;
}
</style>
