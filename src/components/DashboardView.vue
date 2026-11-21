<template>
  <section class="dashboard-view">
    <div class="view-head">
      <div>
        <h2>联动看板</h2>
        <p class="view-sub">同一数据集下的多个图表共享联动字段，点击任意柱或数据点即可筛选</p>
      </div>
      <div v-if="dataset" class="row toolbar">
        <select class="select dataset-select" :value="dataset.id" @change="onDatasetChange">
          <option v-for="item in store.datasets" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
        <select
          class="select linkage-select"
          :value="store.dashboard.linkageColumnId || ''"
          :disabled="!categoryColumns.length"
          @change="onLinkageChange"
        >
          <option value="" disabled>选择联动字段</option>
          <option v-for="column in categoryColumns" :key="column.id" :value="column.id">
            {{ column.name }}
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
            {{ item.name }}
          </option>
        </select>
        <button class="btn btn-sm" :disabled="!selectedAddId" @click="handleAddChart">
          加入看板
        </button>
      </div>
    </div>

    <div v-if="!dataset" class="card empty-state">
      <div class="empty-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.6" />
          <rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.6" />
          <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.6" />
          <rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.6" />
        </svg>
      </div>
      <h3>还没有选择数据集</h3>
      <p>在左侧选择一个数据集，即可搭建多图联动的看板。</p>
      <button class="btn btn-primary btn-sm" @click="setActiveTab('data')">去录入数据</button>
    </div>

    <template v-else>
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
          <span class="hint">共 {{ rows.length }} 条记录 · 当前显示 {{ filteredCount }} 条</span>
          <button
            v-if="store.dashboard.filterValue"
            class="btn btn-ghost btn-sm"
            @click="setDashboardFilter(null)"
          >
            重置筛选
          </button>
        </div>
      </div>

      <div v-if="!linkageColumn" class="notice">
        <span>当前数据集没有文本或日期列，无法设置联动字段。先在数据表格添加「组别」这类分类列。</span>
        <button class="btn btn-ghost btn-sm" @click="setActiveTab('data')">去数据表格</button>
      </div>

      <div class="dash-grid">
        <div v-for="item in dashboardCharts" :key="item.id" class="card dash-card">
          <div class="dash-head">
            <div class="row">
              <h3>{{ item.name }}</h3>
              <span class="badge">{{ chartTypeLabel(item.type) }}</span>
            </div>
            <button class="btn btn-ghost btn-sm" @click="handleRemove(item.id)">移出看板</button>
          </div>
          <div class="dash-canvas">
            <EChart
              :option="chartOptions[item.id]"
              @chart-click="(params) => onChartClick(item, params)"
            />
          </div>
          <div class="dash-foot">
            <span class="hint">
              {{ linkageColumn ? `联动字段：${linkageColumn.name}` : '未设置联动字段' }}
            </span>
            <span class="hint">{{ store.dashboard.filterValue ? '已按选中值筛选' : '点击数据点进行联动' }}</span>
          </div>
        </div>

        <div v-if="!dashboardCharts.length" class="card empty-state dash-empty">
          <div class="empty-icon">
            <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
              <rect x="3" y="3" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.6" />
              <rect x="13" y="3" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.6" />
              <rect x="3" y="13" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.6" />
              <rect x="13" y="13" width="8" height="8" rx="2" stroke="currentColor" stroke-width="1.6" />
            </svg>
          </div>
          <h3>看板还是空的</h3>
          <p>从上方选择已有图表加入看板，或者先到「图表」页创建图表。</p>
          <button class="btn btn-primary btn-sm" @click="goCreateChart">去创建图表</button>
        </div>
      </div>
    </template>
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
  chartsOf,
  getDashboardDataset,
  removeDashboardChart,
  selectDataset,
  setActiveTab,
  setDashboardDataset,
  setDashboardFilter,
  setLinkageColumn
} from '../store/useStore'
import { useToast } from '../composables/useToast'

const { push } = useToast()

const selectedAddId = ref('')

const dataset = computed(() => getDashboardDataset())
const rows = computed(() => (dataset.value ? computeDataset(dataset.value).rows : []))
const categoryColumns = computed(() =>
  dataset.value
    ? dataset.value.columns.filter((column) => column.type === 'text' || column.type === 'date')
    : []
)
const linkageColumn = computed(() => {
  if (!dataset.value) return null
  return (
    dataset.value.columns.find(
      (column) => column.id === store.dashboard.linkageColumnId && column.type !== 'number'
    ) || null
  )
})
const dashboardCharts = computed(() => {
  if (!dataset.value) return []
  return (store.dashboard.chartIds || [])
    .map((id) => chartsOf(dataset.value.id).find((chart) => chart.id === id))
    .filter(Boolean)
})
const availableCharts = computed(() => {
  if (!dataset.value) return []
  return chartsOf(dataset.value.id).filter(
    (chart) => !(store.dashboard.chartIds || []).includes(chart.id)
  )
})
const filterValues = computed(() =>
  linkageColumn.value ? distinctValues(rows.value, linkageColumn.value).slice(0, 30) : []
)
const filteredCount = computed(() => {
  if (!linkageColumn.value || store.dashboard.filterValue == null) return rows.value.length
  return rows.value.filter(
    (row) => String(row.values[linkageColumn.value.id] ?? '') === String(store.dashboard.filterValue)
  ).length
})
const chartOptions = computed(() => {
  const map = {}
  if (!dataset.value) return map
  for (const chart of dashboardCharts.value) {
    map[chart.id] = buildChartOption({
      dataset: dataset.value,
      computedRows: rows.value,
      chart,
      filterValue: store.dashboard.filterValue,
      linkageColumnId: store.dashboard.linkageColumnId
    }).option
  }
  return map
})

watch(availableCharts, (list) => {
  if (selectedAddId.value && !list.some((chart) => chart.id === selectedAddId.value)) {
    selectedAddId.value = ''
  }
})

function onDatasetChange(event) {
  setDashboardDataset(event.target.value)
  selectedAddId.value = ''
}

function onLinkageChange(event) {
  setLinkageColumn(event.target.value)
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
  if (!linkageColumn.value) return
  let value
  const rowId = params?.data?.rowId
  if (rowId) {
    const row = rows.value.find((item) => item.id === rowId)
    if (!row) return
    value = row.values[linkageColumn.value.id]
  } else if (
    chart?.xColumnId === linkageColumn.value.id &&
    params?.data?.category != null
  ) {
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
  if (!dataset.value) return
  selectDataset(dataset.value.id)
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

.dataset-select {
  width: 190px;
}

.linkage-select {
  width: 150px;
}

.chart-select {
  width: 180px;
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
</style>
