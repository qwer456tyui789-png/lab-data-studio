<template>
  <aside class="style-panel">
    <div class="panel-head">
      <span class="panel-label">图表设置</span>
      <button class="btn btn-ghost btn-sm" @click="resetStyle">重置样式</button>
    </div>

    <section class="panel-section">
      <div class="panel-label">图表类型</div>
      <div class="segmented type-switch">
        <button
          v-for="item in CHART_TYPES"
          :key="item.value"
          :class="{ active: chart.type === item.value }"
          @click="setType(item.value)"
        >
          {{ item.label }}
        </button>
      </div>
      <p v-if="chart.type === 'bar'" class="hint type-hint">
        柱状图按 X 轴分类自动聚合，同一分类的多次测量取均值。
      </p>
    </section>

    <section class="panel-section">
      <div class="panel-label">数据绑定</div>
      <div class="field">
        <label>X 轴（维度）</label>
        <select class="select" :value="chart.xColumnId || ''" @change="setX">
          <option v-for="column in dataset.columns" :key="column.id" :value="column.id">
            {{ column.name }}{{ column.formula ? '（公式）' : '' }}
          </option>
        </select>
      </div>
      <div class="field">
        <label>Y 轴（指标，可多选）</label>
        <div class="y-list">
          <div v-for="(column, index) in numericColumns" :key="column.id" class="y-item">
            <label class="y-check">
              <input
                type="checkbox"
                :checked="chart.yColumnIds.includes(column.id)"
                @change="toggleY(column.id, $event.target.checked)"
              />
              <span class="y-name">{{ column.name }}</span>
              <span v-if="column.formula" class="badge badge-formula">ƒ</span>
            </label>
            <label class="color-dot" title="指定该指标颜色">
              <input
                type="color"
                :value="colorFor(column, index)"
                @input="setSeriesColor(column.id, $event.target.value)"
              />
              <span :style="{ background: colorFor(column, index) }"></span>
            </label>
          </div>
          <p v-if="!numericColumns.length" class="hint">
            当前数据集没有数值列，请先在「数据表格」中添加数值列或公式列。
          </p>
        </div>
      </div>
    </section>

    <section class="panel-section">
      <div class="panel-label">标题与坐标轴</div>
      <div class="field">
        <label>图表名称</label>
        <input class="input" :value="chart.name" maxlength="40" @input="setName" />
      </div>
      <div class="field">
        <label>标题文字</label>
        <input
          class="input"
          :value="style.title || ''"
          placeholder="默认使用图表名称"
          maxlength="60"
          @input="setStyle('title', $event.target.value)"
        />
      </div>
      <div class="grid-2">
        <div class="field">
          <label>X 轴名称</label>
          <input
            class="input"
            :value="style.xAxisName || ''"
            placeholder="默认列名"
            maxlength="24"
            @input="setStyle('xAxisName', $event.target.value)"
          />
        </div>
        <div class="field">
          <label>Y 轴名称</label>
          <input
            class="input"
            :value="style.yAxisName || ''"
            placeholder="可留空"
            maxlength="24"
            @input="setStyle('yAxisName', $event.target.value)"
          />
        </div>
      </div>
    </section>

    <section class="panel-section">
      <div class="panel-label">配色</div>
      <div class="palette-row">
        <label
          v-for="(color, index) in palette"
          :key="index"
          class="swatch"
          :title="`调色板 ${index + 1}`"
        >
          <input type="color" :value="color" @input="setPaletteColor(index, $event.target.value)" />
          <span :style="{ background: color }"></span>
        </label>
      </div>
      <p class="hint">指标按顺序取色，也可以点击 Y 轴右侧色点单独指定。</p>
    </section>

    <section class="panel-section">
      <div class="panel-label">显示选项</div>
      <div class="switch-row">
        <span>显示图例</span>
        <button
          class="switch"
          :class="{ on: style.showLegend !== false }"
          @click="setStyle('showLegend', style.showLegend === false)"
        ></button>
      </div>
      <div class="switch-row">
        <span>显示数值标签</span>
        <button
          class="switch"
          :class="{ on: Boolean(style.showLabel) }"
          @click="setStyle('showLabel', !style.showLabel)"
        ></button>
      </div>
      <template v-if="chart.type === 'line'">
        <div class="switch-row">
          <span>平滑曲线</span>
          <button
            class="switch"
            :class="{ on: Boolean(style.smooth) }"
            @click="setStyle('smooth', !style.smooth)"
          ></button>
        </div>
        <div class="switch-row">
          <span>面积填充</span>
          <button
            class="switch"
            :class="{ on: Boolean(style.area) }"
            @click="setStyle('area', !style.area)"
          ></button>
        </div>
        <div class="switch-row">
          <span>显示数据点</span>
          <button
            class="switch"
            :class="{ on: Boolean(style.showSymbol) }"
            @click="setStyle('showSymbol', !style.showSymbol)"
          ></button>
        </div>
      </template>
      <template v-if="chart.type === 'line' || chart.type === 'bar'">
        <div class="switch-row">
          <span>堆叠显示</span>
          <button
            class="switch"
            :class="{ on: Boolean(style.stack) }"
            @click="setStyle('stack', !style.stack)"
          ></button>
        </div>
      </template>
      <template v-if="chart.type === 'bar'">
        <div class="switch-row">
          <span>横向柱状图</span>
          <button
            class="switch"
            :class="{ on: Boolean(style.barHorizontal) }"
            @click="setStyle('barHorizontal', !style.barHorizontal)"
          ></button>
        </div>
      </template>
    </section>

    <section class="panel-section">
      <div class="panel-label">趋势线</div>
      <div class="switch-row" :class="{ disabled: chart.type === 'bar' }">
        <span>线性回归趋势线</span>
        <button
          class="switch"
          :class="{ on: Boolean(chart.trendline?.enabled) }"
          :disabled="chart.type === 'bar'"
          @click="toggleTrendline"
        ></button>
      </div>
      <p class="hint">
        {{
          chart.type === 'bar'
            ? '柱状图不适用趋势线，切换到折线图或散点图后可开启。'
            : '叠加最小二乘拟合直线，并在图表上方显示方程与 R²。'
        }}
      </p>
    </section>
  </aside>
</template>

<script setup>
import { computed } from 'vue'
import { CHART_TYPES } from '../lib/chartTypes'
import { DEFAULT_PALETTE, DEFAULT_STYLE, seriesColor } from '../lib/chartOptions'
import { updateChart } from '../store/useStore'
import { useToast } from '../composables/useToast'

const props = defineProps({
  chart: { type: Object, required: true },
  dataset: { type: Object, required: true }
})

const { push } = useToast()

const style = computed(() => props.chart.style || {})
const numericColumns = computed(() =>
  props.dataset.columns.filter((column) => column.type === 'number')
)
const palette = computed(() =>
  Array.isArray(style.value.palette) && style.value.palette.length
    ? style.value.palette
    : DEFAULT_PALETTE
)

function setStyle(key, value) {
  if (!props.chart.style) props.chart.style = {}
  props.chart.style[key] = value
}

function setName(event) {
  updateChart(props.chart.id, { name: event.target.value })
}

function setX(event) {
  updateChart(props.chart.id, { xColumnId: event.target.value })
}

function setType(type) {
  updateChart(props.chart.id, { type })
}

function toggleY(columnId, checked) {
  const current = props.chart.yColumnIds || []
  if (!checked) {
    const next = current.filter((id) => id !== columnId)
    if (next.length === 0) {
      push('至少保留一个 Y 轴指标', 'error')
      return
    }
    updateChart(props.chart.id, { yColumnIds: next })
    return
  }
  if (current.includes(columnId)) return
  updateChart(props.chart.id, { yColumnIds: [...current, columnId] })
}

function colorFor(column, index) {
  return seriesColor(props.chart, column.id, index)
}

function setSeriesColor(columnId, value) {
  const style = props.chart.style
  style.seriesColors = { ...(style.seriesColors || {}), [columnId]: value }
}

function setPaletteColor(index, value) {
  const next = [...palette.value]
  next[index] = value
  setStyle('palette', next)
}

function toggleTrendline() {
  if (props.chart.type === 'bar') return
  updateChart(props.chart.id, {
    trendline: { ...(props.chart.trendline || {}), enabled: !props.chart.trendline?.enabled }
  })
}

function resetStyle() {
  updateChart(props.chart.id, {
    style: {
      ...DEFAULT_STYLE,
      palette: [...DEFAULT_STYLE.palette],
      seriesColors: {}
    }
  })
  push('样式已重置为默认', 'success')
}
</script>

<style scoped>
.style-panel {
  display: flex;
  flex-direction: column;
  gap: 18px;
  padding: 16px 16px 20px;
  max-height: calc(100vh - 232px);
  overflow-y: auto;
}

.panel-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.panel-section {
  display: flex;
  flex-direction: column;
  gap: 10px;
  padding-top: 14px;
  border-top: 1px solid var(--border);
}

.panel-section:first-of-type {
  border-top: none;
  padding-top: 0;
}

.type-switch {
  width: 100%;
}

.type-hint {
  margin-top: 8px;
  font-size: 11.5px;
  line-height: 1.5;
}

.type-switch button {
  flex: 1;
  height: 30px;
}

.y-list {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius-sm);
  background: var(--surface-2);
  max-height: 172px;
  overflow-y: auto;
}

.y-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  padding: 4px 6px;
  border-radius: 6px;
}

.y-item:hover {
  background: var(--surface);
}

.y-check {
  display: flex;
  align-items: center;
  gap: 7px;
  min-width: 0;
  cursor: pointer;
  font-size: 12.5px;
  color: var(--text-2);
}

.y-check input {
  width: 14px;
  height: 14px;
  accent-color: var(--accent);
  flex: none;
}

.y-name {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.color-dot {
  position: relative;
  width: 18px;
  height: 18px;
  flex: none;
  cursor: pointer;
}

.color-dot input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.color-dot span {
  display: block;
  width: 18px;
  height: 18px;
  border-radius: 50%;
  border: 2px solid var(--surface);
  box-shadow: 0 0 0 1px var(--border-strong);
}

.grid-2 {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.palette-row {
  display: flex;
  align-items: center;
  gap: 8px;
  flex-wrap: wrap;
}

.swatch {
  position: relative;
  width: 26px;
  height: 26px;
  cursor: pointer;
}

.swatch input {
  position: absolute;
  inset: 0;
  opacity: 0;
  cursor: pointer;
}

.swatch span {
  display: block;
  width: 26px;
  height: 26px;
  border-radius: 8px;
  border: 2px solid var(--surface);
  box-shadow: 0 0 0 1px var(--border-strong);
}

.switch-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  font-size: 12.5px;
  color: var(--text-2);
}

.switch-row.disabled {
  opacity: 0.55;
}

.switch:disabled {
  cursor: not-allowed;
}
</style>
