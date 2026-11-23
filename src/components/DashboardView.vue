<template>
  <section class="dashboard-view">
    <div class="view-head">
      <div>
        <h2>联动看板</h2>
        <p class="view-sub">可跨数据集组合图表，按同名分类字段（如「组别」「监测站」）联动筛选</p>
      </div>
      <div class="row toolbar">
        <select
          class="select linkage-select"
          :value="store.dashboard.linkageColumnName || ''"
          :disabled="!linkageOptions.length"
          @change="onLinkageChange"
        >
          <option value="" disabled>
            {{ linkageOptions.length ? '选择联动字段' : '没有可联动字段' }}
          </option>
          <option v-for="item in linkageOptions" :key="item.name" :value="item.name">
            {{ item.name }}{{ item.datasetCount > 1 ? `（${item.datasetCount} 个数据集）` : '' }}
          </option>
        </select>
        <select
          v-model="selectedAddId"
          class="select chart-select"
          :disabled="!availableCharts.length"
        >
          <option value="">
            {{ availableCharts.length ? '选择要加入的图表' : '没有可添加的图表' }}
          </option>
          <option v-for="item in availableCharts" :key="item.id" :value="item.id">
            {{ datasetNameOf(item) }} · {{ item.name }}
          </option>
        </select>
        <button class="btn btn-sm" :disabled="!selectedAddId" @click="handleAddChart">
          加入看板
        </button>
      </div>
    </div>

    <template v-if="dashboardCharts.length">
      <div class="card filter-bar">
        <div class="filter-left">
          <span class="panel-label">联动筛选</span>
          <div class="chips">
            <button
              class="chip"
              :class="{ active: !store.dashboard.filterValue }"
              @click="setDashboardFilter(null)"
            >
              全部
            </button>
            <button
              v-for="value in filterValues"
              :key="value"
              class="chip"
              :class="{ active: store.dashboard.filterValue === value }"
              @click="toggleValue(value)"
            >
              {{ value }}
            </button>
            <span v-if="!filterValues.length" class="hint">当前联动字段没有可筛选的值</span>
          </div>
        </div>
        <div class="filter-right">
          <span class="hint">
            共 {{ totalRows }} 条记录 · 当前显示 {{ filteredCount }} 条
          </span>
          <button
            v-if="store.dashboard.filterValue"
            class="btn btn-ghost btn-sm"
            @click="setDashboardFilter(null)"
          >
            重置筛选
          </button>
        </div>
      </div>

      <div v-if="!linkageOptions.length" class="notice">
        <span>看板图表的数据集没有同名文本或日期列，暂时无法联动。可在数据表格中添加同名的「组别」这类分类列。</span>
        <button class="btn btn-ghost btn-sm" @click="setActiveTab('data')">去数据表格</button>
      </div>

      <div class="dash-grid">
        <div v-for="item in dashboardCharts" :key="item.id" class="card dash-card">
          <div class="dash-head">
            <div class="row">
              <h3>{{ item.name }}</h3>
              <span class="badge">{{ chartTypeLabel(item.type) }}</span>
              <span class="badge badge-dataset">{{ datasetNameOf(item) }}</span>
            </div>
            <button class="btn btn-ghost btn-sm" @click="handleRemove(item.id)">移出看板</button>
          </div>
          <div class="dash-canvas">
            <EChart
              v-if="chartRowCount(item) > 0"
              :option="chartOptions[item.id]"
              @chart-click="(params) => onChartClick(item, params)"
            />
            <div v-else class="dash-canvas-empty">
              <p>当前筛选「{{ store.dashboard.filterValue }}」在该图表的数据集中没有匹配记录</p>
            </div>
          </div>
          <div class="dash-foot">
            <span class="hint">
              {{
                linkageColumnFor(item)
                  ? `联动字段：${linkageColumnFor(item).name}`
                  : '该图表的数据集缺少联动字段，不参与筛选'
              }}
            </span>
            <span class="hint">
              {{
                !linkageColumnFor(item)
                  ? '仅作为对照展示'
                  : store.dashboard.filterValue
                    ? '已按选中值筛选'
                    : '点击数据点进行联动'
              }}
            </span>
          </div>
        </div>
      </div>
    </template>

    <div v-else class="card empty-state dash-empty">
      <div class="empty-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.6" />
          <rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.6" />
          <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.6" />
          <rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </div>
      <h3>看板还是空的</h3>
      <p>从上方选择已有图表加入看板，图表可以来自不同数据集，只要它们有同名的分类列即可联动。</p>
      <button class="btn btn-primary btn-sm" @click="goCreateChart">去创建图表</button>
    </div>
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import EChart from './EChart.vue'
import { computeDataset } from '../lib/formula'
import { buildChartOption } from '../lib/chartOptions'
import { chartTypeLabel } from '../lib/chartTypes'
import { distinctValues } from '../lib/stats'
import {
  store,
  addDashboardChart,
  getDashboardCharts,
  getDashboardLinkageNames,
  linkageColumnOf,
  removeDashboardChart,
  setActiveTab,
  setDashboardFilter,
  setLinkageColumnName
} from '../store/useStore'
import { useToast } from '../composables/useToast'

const { push } = useToast()

const selectedAddId = ref('')

const dashboardCharts = computed(() => getDashboardCharts())
const linkageOptions = computed(() => getDashboardLinkageNames())

const linkedEntries = computed(() => {
  const map = new Map()
  for (const chart of dashboardCharts.value) {
    if (map.has(chart.datasetId)) continue
    const dataset = store.datasets.find((item) => item.id === chart.datasetId)
    if (!dataset) continue
    map.set(chart.datasetId, { dataset, rows: computeDataset(dataset).rows })
  }
  return [...map.values()]
})

const totalRows = computed(() =>
  linkedEntries.value.reduce((total, entry) => total + entry.rows.length, 0)
)

const availableCharts = computed(() =>
  store.charts.filter((chart) => !(store.dashboard.chartIds || []).includes(chart.id))
)

const filterValues = computed(() => {
  const name = store.dashboard.linkageColumnName
  if (!name) return []
  const seen = new Set()
  const values = []
  for (const entry of linkedEntries.value) {
    const column = linkageColumnOf(entry.dataset, name)
    if (!column) continue
    for (const value of distinctValues(entry.rows, column)) {
      if (seen.has(value)) continue
      seen.add(value)
      values.push(value)
    }
  }
  return values.slice(0, 30)
})

const filteredCount = computed(() => {
  const filter = store.dashboard.filterValue
  if (filter == null) return totalRows.value
  let count = 0
  for (const entry of linkedEntries.value) {
    const column = linkageColumnOf(entry.dataset, store.dashboard.linkageColumnName)
    if (!column) {
      count += entry.rows.length
      continue
    }
    count += entry.rows.filter(
      (row) => String(row.values[column.id] ?? '') === String(filter)
    ).length
  }
  return count
})

const chartOptions = computed(() => {
  const map = {}
  const entries = new Map(linkedEntries.value.map((entry) => [entry.dataset.id, entry]))
  for (const chart of dashboardCharts.value) {
    const entry = entries.get(chart.datasetId)
    if (!entry) continue
    const column = linkageColumnOf(entry.dataset, store.dashboard.linkageColumnName)
    map[chart.id] = buildChartOption({
      dataset: entry.dataset,
      computedRows: entry.rows,
      chart,
      filterValue: column ? store.dashboard.filterValue : null,
      linkageColumnId: column?.id ?? null
    }).option
  }
  return map
})

watch(availableCharts, (list) => {
  if (selectedAddId.value && !list.some((chart) => chart.id === selectedAddId.value)) {
    selectedAddId.value = ''
  }
})

function datasetNameOf(chart) {
  return store.datasets.find((item) => item.id === chart.datasetId)?.name || '未知数据集'
}

function linkageColumnFor(chart) {
  const dataset = store.datasets.find((item) => item.id === chart.datasetId)
  return linkageColumnOf(dataset, store.dashboard.linkageColumnName)
}

function chartRowCount(chart) {
  const entry = linkedEntries.value.find((item) => item.dataset.id === chart.datasetId)
  if (!entry) return 0
  const filter = store.dashboard.filterValue
  const column = linkageColumnOf(entry.dataset, store.dashboard.linkageColumnName)
  if (filter == null || !column) return entry.rows.length
  return entry.rows.filter(
    (row) => String(row.values[column.id] ?? '') === String(filter)
  ).length
}

function onLinkageChange(event) {
  setLinkageColumnName(event.target.value)
}

function handleAddChart() {
  if (!selectedAddId.value) return
  const result = addDashboardChart(selectedAddId.value)
  if (!result.ok) {
    push(result.message, 'error')
    return
  }
  selectedAddId.value = ''
  push('图表已加入看板', 'success')
}

function handleRemove(chartId) {
  removeDashboardChart(chartId)
  push('图表已移出看板', 'success')
}

function toggleValue(value) {
  setDashboardFilter(store.dashboard.filterValue === value ? null : value)
}

function onChartClick(chart, params) {
  const name = store.dashboard.linkageColumnName
  if (!name) return
  const entry = linkedEntries.value.find((item) => item.dataset.id === chart.datasetId)
  if (!entry) return
  const column = linkageColumnOf(entry.dataset, name)
  if (!column) return

  let value
  const rowId = params?.data?.rowId
  if (rowId) {
    const row = entry.rows.find((item) => item.id === rowId)
    if (!row) return
    value = row.values[column.id]
  } else if (chart.xColumnId === column.id && params?.data?.category != null) {
    value = params.data.category
  } else {
    return
  }
  if (value == null || String(value).trim() === '') {
    setDashboardFilter(null)
    return
  }
  const text = String(value)
  setDashboardFilter(store.dashboard.filterValue === text ? null : text)
}

function goCreateChart() {
  setActiveTab('chart')
}
</script>

<style scoped>
.dashboard-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
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

.linkage-select {
  width: 170px;
}

.chart-select {
  width: 240px;
}

.badge-dataset {
  background: var(--surface-2);
  color: var(--text-3);
  border: 1px solid var(--border);
  max-width: 150px;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.filter-bar {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 16px;
  padding: 12px 16px;
  flex-wrap: wrap;
}

.filter-left {
  display: flex;
  align-items: center;
  gap: 12px;
  min-width: 0;
  flex-wrap: wrap;
}

.chips {
  display: flex;
  align-items: center;
  gap: 6px;
  flex-wrap: wrap;
}

.filter-right {
  display: flex;
  align-items: center;
  gap: 10px;
}

.notice {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 11px 16px;
  border-radius: var(--radius-sm);
  background: var(--warning-soft);
  border: 1px solid #f0ddb9;
  color: #8a6219;
  font-size: 13px;
}

.dash-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(440px, 1fr));
  gap: 16px;
  align-items: stretch;
}

.dash-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.dash-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 16px 10px;
  border-bottom: 1px solid var(--border);
}

.dash-head h3 {
  font-size: 13.5px;
  font-weight: 650;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.dash-canvas {
  height: 330px;
  padding: 2px 6px;
}

.dash-canvas-empty {
  height: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 0 28px;
  text-align: center;
  color: var(--text-3);
  font-size: 12.5px;
  line-height: 1.6;
}

.dash-foot {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  padding: 8px 16px 11px;
  border-top: 1px dashed var(--border);
}

.dash-empty {
  min-height: 330px;
}

@media (max-width: 1100px) {
  .dash-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}

/* refined linked dashboard */
.view-head h2 {
  font-size: 22px;
  font-weight: 760;
  letter-spacing: -0.035em;
}

.view-sub {
  margin-top: 5px;
  color: #8b94a9;
}

.filter-bar {
  padding: 13px 16px;
  background: linear-gradient(135deg, #fbfcff 0%, #f5f8ff 100%);
  border-radius: 14px;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.9);
}

.linkage-select {
  width: 180px;
}

.chart-select {
  width: 248px;
}

.badge-dataset {
  background: #f1f4fc;
  border-color: #e1e6f3;
  color: #66718a;
}

.dash-grid {
  gap: 18px;
}

.dash-card {
  border-radius: 18px;
  box-shadow: 0 1px 2px rgba(20, 30, 70, 0.04), 0 14px 36px rgba(23, 32, 80, 0.05);
  transition: box-shadow 0.18s ease, transform 0.18s ease;
}

.dash-card:hover {
  box-shadow: 0 2px 4px rgba(20, 30, 70, 0.05), 0 20px 46px rgba(23, 32, 80, 0.08);
  transform: translateY(-2px);
}

.dash-head {
  padding: 14px 18px 12px;
  background: linear-gradient(180deg, #ffffff, #fcfdff);
}

.dash-head h3 {
  font-size: 14px;
  font-weight: 670;
}

.dash-canvas {
  height: 340px;
  padding: 4px 8px;
}

.dash-foot {
  padding: 9px 18px 12px;
  border-top-color: #e9edf7;
}

.dash-empty {
  min-height: 340px;
}

@media (max-width: 1100px) {
  .dash-grid {
    grid-template-columns: minmax(0, 1fr);
  }
}
</style>
