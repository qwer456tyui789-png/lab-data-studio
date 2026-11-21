<template>
  <section class="chart-view">
    <div class="view-head">
      <div>
        <h2>图表</h2>
        <p class="view-sub">
          {{ dataset ? `${dataset.name} · 共 ${charts.length} 个图表` : '选择一个数据集开始可视化' }}
        </p>
      </div>
      <div v-if="dataset" class="row toolbar">
        <select
          class="select chart-select"
          :value="chart?.id || ''"
          :disabled="!charts.length"
          @change="onSelectChart"
        >
          <option v-if="!charts.length" value="">暂无图表</option>
          <option v-for="item in charts" :key="item.id" :value="item.id">
            {{ item.name }}
          </option>
        </select>
        <button class="btn btn-sm" @click="createNew">＋ 新建图表</button>
        <button class="btn btn-sm btn-subtle" @click="openRecommend">智能推荐</button>
        <button class="btn btn-sm" :disabled="!chart" @click="exportPNG">导出 PNG</button>
      </div>
    </div>

    <div v-if="!dataset" class="card empty-state">
      <div class="empty-icon">
        <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
          <path d="M4 19V10M10 19V5M16 19v-6M22 19H2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
        </svg>
      </div>
      <h3>还没有可用的数据集</h3>
      <p>先到左侧新建数据集并录入数据，再回来生成图表。</p>
      <button class="btn btn-primary btn-sm" @click="setActiveTab('data')">去录入数据</button>
    </div>

    <template v-else>
      <div v-if="!chart" class="card empty-state">
        <div class="empty-icon">
          <svg width="24" height="24" viewBox="0 0 24 24" fill="none">
            <path d="M4 19V10M10 19V5M16 19v-6M22 19H2" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" />
          </svg>
        </div>
        <h3>还没有图表</h3>
        <p>新建一个图表，或让智能推荐根据数据特征生成一版配置。</p>
        <div class="row">
          <button class="btn btn-primary btn-sm" @click="createNew">新建图表</button>
          <button
            class="btn btn-sm"
            :disabled="!numericColumns.length"
            @click="openRecommend"
          >
            智能推荐
          </button>
        </div>
      </div>

      <template v-else>
        <div v-if="!numericColumns.length" class="notice">
          <span>当前数据集没有数值列，图表暂时无法绘制。</span>
          <button class="btn btn-ghost btn-sm" @click="setActiveTab('data')">去添加数值列</button>
        </div>

        <div class="chart-layout">
          <div class="card chart-card">
            <div class="chart-head">
              <div class="row heading">
                <h3>{{ chart.name }}</h3>
                <span class="badge">{{ chartTypeLabel(chart.type) }}</span>
              </div>
              <div class="row">
                <span class="hint">{{ dataset.rows.length }} 行数据</span>
                <button class="btn btn-ghost btn-sm" @click="deleteOpen = true">删除图表</button>
              </div>
            </div>
            <div class="canvas-wrap">
              <EChart ref="chartRef" :option="option" />
            </div>
            <div v-if="trendlines.length" class="chart-foot">
              <span v-for="item in trendlines" :key="item.name" class="trend-pill">
                趋势线 · {{ item.name }}：{{ item.text }}
              </span>
            </div>
            <div v-else class="chart-foot muted small">
              提示：折线图与散点图可在右侧「趋势线」中开启线性回归，并显示方程与 R²。
            </div>
          </div>

          <ChartStylePanel :chart="chart" :dataset="dataset" class="card" />
        </div>
      </template>
    </template>

    <RecommendPanel
      :open="recommendOpen"
      :dataset="dataset"
      :computed-rows="computedRows?.rows || []"
      @close="recommendOpen = false"
      @apply="applySuggestion"
    />
    <ConfirmDialog
      :open="deleteOpen"
      title="删除图表"
      :message="`确定删除图表「${chart?.name || ''}」吗？此操作不可撤销。`"
      confirm-text="删除图表"
      @close="deleteOpen = false"
      @confirm="confirmDeleteChart"
    />
  </section>
</template>

<script setup>
import { computed, ref, watch } from 'vue'
import EChart from './EChart.vue'
import ChartStylePanel from './ChartStylePanel.vue'
import RecommendPanel from './RecommendPanel.vue'
import ConfirmDialog from './ConfirmDialog.vue'
import { computeDataset } from '../lib/formula'
import { buildChartOption, DEFAULT_STYLE } from '../lib/chartOptions'
import { chartTypeLabel } from '../lib/chartTypes'
import { downloadDataUrl, sanitizeFilename } from '../lib/download'
import {
  store,
  createChart,
  deleteChart,
  getActiveChart,
  getActiveDataset,
  chartsOf,
  selectChart,
  setActiveTab
} from '../store/useStore'
import { useToast } from '../composables/useToast'

const { push } = useToast()

const chartRef = ref(null)
const recommendOpen = ref(false)
const deleteOpen = ref(false)

const chart = computed(() => getActiveChart())
const dataset = computed(() => {
  if (chart.value) return store.datasets.find((item) => item.id === chart.value.datasetId) || null
  return getActiveDataset()
})
const charts = computed(() => (dataset.value ? chartsOf(dataset.value.id) : []))
const numericColumns = computed(() =>
  dataset.value ? dataset.value.columns.filter((column) => column.type === 'number') : []
)
const computedRows = computed(() => (dataset.value ? computeDataset(dataset.value) : null))
const optionResult = computed(() =>
  chart.value && dataset.value
    ? buildChartOption({
        dataset: dataset.value,
        computedRows: computedRows.value.rows,
        chart: chart.value
      })
    : null
)
const option = computed(() => optionResult.value?.option || null)
const trendlines = computed(() => optionResult.value?.trendlines || [])

watch(
  () => chart.value?.id,
  () => {
    const current = chart.value
    if (!current) return
    current.style = {
      ...DEFAULT_STYLE,
      palette: [...DEFAULT_STYLE.palette],
      seriesColors: {},
      ...(current.style || {})
    }
    if (!Array.isArray(current.style.palette) || current.style.palette.length === 0) {
      current.style.palette = [...DEFAULT_STYLE.palette]
    }
    if (!current.style.seriesColors) current.style.seriesColors = {}
    if (!current.trendline) current.trendline = { enabled: false }
  },
  { immediate: true }
)

function onSelectChart(event) {
  selectChart(event.target.value)
}

function createNew() {
  if (!dataset.value) return
  const created = createChart(dataset.value.id)
  if (created) push('已创建新图表', 'success')
}

function openRecommend() {
  if (!dataset.value) {
    push('请先选择数据集', 'error')
    return
  }
  recommendOpen.value = true
}

function applySuggestion(suggestion) {
  if (!dataset.value) return
  createChart(dataset.value.id, {
    name: suggestion.title,
    type: suggestion.type,
    xColumnId: suggestion.xColumnId,
    yColumnIds: suggestion.yColumnIds,
    trendline: suggestion.trendline,
    style: { title: suggestion.title }
  })
  recommendOpen.value = false
  push(`已应用「${suggestion.title}」`, 'success')
}

function confirmDeleteChart() {
  if (!chart.value) return
  deleteChart(chart.value.id)
  deleteOpen.value = false
  push('图表已删除', 'success')
}

async function exportPNG() {
  const instance = chartRef.value?.getInstance()
  if (!instance || !chart.value) return
  try {
    instance.setOption({ animation: false })
    await new Promise((resolve) => setTimeout(resolve, 180))
    const url = instance.getDataURL({
      type: 'png',
      pixelRatio: 2,
      backgroundColor: '#ffffff'
    })
    downloadDataUrl(`${sanitizeFilename(chart.value.name)}.png`, url)
    instance.setOption(option.value, { notMerge: true })
    push('图表已导出为 PNG', 'success')
  } catch (error) {
    console.error(error)
    push('PNG 导出失败，请重试', 'error')
  }
}
</script>

<style scoped>
.chart-view {
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

.chart-select {
  width: 190px;
}

.chart-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 344px;
  gap: 16px;
  align-items: start;
  min-height: 0;
}

.chart-card {
  display: flex;
  flex-direction: column;
  min-width: 0;
  overflow: hidden;
}

.chart-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 14px;
  padding: 13px 18px 12px;
  border-bottom: 1px solid var(--border);
}

.chart-head .heading {
  min-width: 0;
}

.chart-head h3 {
  font-size: 14.5px;
  font-weight: 680;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.canvas-wrap {
  height: clamp(420px, calc(100vh - 330px), 720px);
  padding: 4px 8px;
}

.chart-foot {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
  padding: 9px 18px 12px;
  border-top: 1px dashed var(--border);
}

.trend-pill {
  font-size: 11.5px;
  color: #55627e;
  background: var(--surface-2);
  border: 1px solid var(--border);
  border-radius: 999px;
  padding: 3px 10px;
  font-family: var(--mono);
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

@media (max-width: 1180px) {
  .chart-layout {
    grid-template-columns: minmax(0, 1fr);
  }

  .canvas-wrap {
    height: 460px;
  }
}
</style>
