import { formatNumber } from './formula'
import { linearRegression, formatEquation, formatR2 } from './stats'

export const DEFAULT_PALETTE = [
  '#3557e8',
  '#ee6c4d',
  '#18a37a',
  '#7b5cf0',
  '#e0a01e',
  '#0e9aa7',
  '#d45087',
  '#5f6caf'
]

export const DEFAULT_STYLE = {
  title: '',
  xAxisName: '',
  yAxisName: '',
  palette: [...DEFAULT_PALETTE],
  seriesColors: {},
  showLegend: true,
  smooth: true,
  area: false,
  showSymbol: true,
  showLabel: false,
  stack: false,
  barHorizontal: false,
  trendColor: '#7c869c'
}

function withAlpha(hex, alpha) {
  const fallback = `rgba(53, 87, 232, ${alpha})`
  if (typeof hex !== 'string' || !hex.startsWith('#')) return fallback
  let raw = hex.slice(1)
  if (raw.length === 3) raw = raw.split('').map((c) => c + c).join('')
  if (raw.length !== 6) return fallback
  const num = Number.parseInt(raw, 16)
  if (!Number.isFinite(num)) return fallback
  return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`
}

export function seriesColor(chart, columnId, index) {
  const style = chart?.style || {}
  const override = style.seriesColors?.[columnId]
  if (override) return override
  const palette = Array.isArray(style.palette) && style.palette.length ? style.palette : DEFAULT_PALETTE
  return palette[index % palette.length]
}

/**
 * 将图表配置 + 数据集行转换为 ECharts option。
 * filterValue / linkageColumnId 用于看板的联动过滤。
 */
export function buildChartOption({
  dataset,
  computedRows,
  chart,
  filterValue = null,
  linkageColumnId = null,
  forExport = false
}) {
  const columns = dataset?.columns || []
  const style = { ...DEFAULT_STYLE, ...(chart?.style || {}) }
  const allRows = computedRows || []

  let rows = allRows
  if (filterValue != null && linkageColumnId) {
    const linkColumn = columns.find((column) => column.id === linkageColumnId)
    if (linkColumn) {
      const target = String(filterValue)
      rows = allRows.filter((row) => String(row.values[linkColumn.id] ?? '') === target)
    }
  }

  const xColumn = columns.find((column) => column.id === chart?.xColumnId) || null
  const yColumns = (chart?.yColumnIds || [])
    .map((id) => columns.find((column) => column.id === id))
    .filter((column) => column && column.type === 'number')

  if (yColumns.length === 0) {
    return {
      option: {
        title: {
          text: '请选择至少一个数值指标',
          left: 'center',
          top: 'middle',
          textStyle: { color: '#8c94a8', fontSize: 13, fontWeight: 500 }
        }
      },
      trendlines: []
    }
  }

  const xIsNumeric = xColumn?.type === 'number'
  const xNumeric = rows.map((row, index) => {
    if (!xIsNumeric) return index
    const value = row.values[xColumn.id]
    return Number.isFinite(value) ? value : index
  })
  const rowLabels = rows.map((row, index) => {
    if (!xColumn) return String(index + 1)
    const display = row.display?.[xColumn.id]
    return display === '' || display == null ? String(xNumeric[index]) : String(display)
  })

  const chartType = chart?.type || 'line'
  const horizontal = chartType === 'bar' && !!style.barHorizontal
  const isScatter = chartType === 'scatter'
  const isPie = chartType === 'pie'
  const isLineLike = chartType === 'line' || chartType === 'area'
  const usesAggregation = chartType === 'bar' || isLineLike || isPie

  const numericColumnOrder = new Map(
    columns
      .filter((column) => column.type === 'number')
      .map((column, index) => [column.id, index])
  )

  function valuesOf(indices, columnId) {
    return indices
      .map((index) => rows[index].values[columnId])
      .filter((value) => Number.isFinite(value))
  }

  function meanOf(indices, columnId) {
    const values = valuesOf(indices, columnId)
    return values.length
      ? values.reduce((total, value) => total + value, 0) / values.length
      : null
  }

  function sumOf(indices, columnId) {
    const values = valuesOf(indices, columnId)
    return values.length
      ? values.reduce((total, value) => total + value, 0)
      : null
  }

  // 折线图 / 柱状图按 X 分类聚合（取均值），避免重复类目与乱序连线
  let groups = null
  if (usesAggregation) {
    const map = new Map()
    rows.forEach((row, index) => {
      const label = rowLabels[index]
      if (!map.has(label)) map.set(label, [])
      map.get(label).push(index)
    })
    groups = [...map.entries()].map(([label, indices]) => ({
      label,
      indices,
      xValue: xNumeric[indices[0]]
    }))
    if (xIsNumeric) {
      groups.sort((a, b) => a.xValue - b.xValue)
    }
  }
  const xLabels = groups ? groups.map((group) => group.label) : rowLabels

  const trendlines = []
  let series
  if (isPie) {
    const column = yColumns[0]
    series = [
      {
        name: column.name,
        type: 'pie',
        radius: ['40%', '68%'],
        center: ['50%', '56%'],
        data: groups
          .map((group) => ({
            value: sumOf(group.indices, column.id),
            name: group.label,
            category: group.label
          }))
          .filter((item) => item.value != null),
        itemStyle: { borderColor: '#ffffff', borderWidth: 2 },
        label: {
          show: true,
          formatter: '{b}\n{d}%',
          color: '#5b6479',
          fontSize: 11
        },
        labelLine: { length: 8, length2: 8 },
        emphasis: { scale: true, scaleSize: 6, label: { fontWeight: 600 } }
      }
    ]
  } else {
    series = yColumns.map((column, seriesIndex) => {
      const color = seriesColor(chart, column.id, numericColumnOrder.get(column.id) ?? seriesIndex)
      const data = groups
        ? groups.map((group) => ({
            value: meanOf(group.indices, column.id),
            category: group.label
          }))
        : rows.map((row, index) => {
            const y = row.values[column.id]
            return { value: [xNumeric[index], Number.isFinite(y) ? y : null], rowId: row.id }
          })

      return {
        name: column.name,
        type: isScatter ? 'scatter' : isLineLike ? 'line' : chartType,
        data,
        symbol: 'circle',
        symbolSize: isScatter ? 9 : 6,
        showSymbol: isScatter ? true : isLineLike ? !!style.showSymbol : false,
        smooth: isLineLike ? !!style.smooth : false,
        lineStyle: isLineLike ? { width: 2.5, color } : undefined,
        areaStyle:
          isLineLike && (style.area || chartType === 'area')
            ? { color: withAlpha(color, 0.16), opacity: 1 }
            : undefined,
        itemStyle: { color },
        barMaxWidth: 42,
        stack: style.stack && (chartType === 'bar' || isLineLike) ? 'total' : undefined,
        emphasis: isScatter ? { focus: 'series', scale: 1.4 } : { focus: 'series' },
        label: {
          show: !!style.showLabel,
          position: isScatter ? 'right' : horizontal ? 'right' : 'top',
          fontSize: 11,
          color: '#5b6479',
          formatter: (params) => {
            const value = params.value
            if (Array.isArray(value)) return `${formatNumber(value[0])}, ${formatNumber(value[1])}`
            if (value && typeof value === 'object') return formatNumber(value.value)
            return formatNumber(Number(value))
          }
        }
      }
    })
  }

  if (chart?.trendline?.enabled && (isLineLike || isScatter)) {
    const trendColor = style.trendColor || '#7c869c'
    for (const column of yColumns) {
      const points = isScatter
        ? rows
            .map((row, index) => ({ x: xNumeric[index], y: row.values[column.id] }))
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
        : groups
            .map((group, order) => ({
              x: xIsNumeric ? group.xValue : order,
              y: meanOf(group.indices, column.id)
            }))
            .filter((point) => Number.isFinite(point.x) && Number.isFinite(point.y))
      const regression = linearRegression(points)
      if (!regression) continue
      const seriesName = yColumns.length > 1 ? `趋势线 · ${column.name}` : '线性趋势线'
      const trendData = isScatter
        ? [...points]
            .sort((a, b) => a.x - b.x)
            .map((point) => [point.x, regression.intercept + regression.slope * point.x])
        : points.map((point) => ({
            value: regression.intercept + regression.slope * point.x
          }))
      series.push({
        name: seriesName,
        type: 'line',
        data: trendData,
        symbol: 'none',
        showSymbol: false,
        silent: true,
        smooth: false,
        lineStyle: { type: 'dashed', width: 1.8, color: trendColor },
        itemStyle: { color: trendColor },
        emphasis: { disabled: true },
        z: 1
      })
      trendlines.push({
        name: column.name,
        regression,
        text: `${formatEquation(regression)}，R² = ${formatR2(regression.r2)}${xIsNumeric ? '' : '（X 轴按序号回归）'}`
      })
    }
  }

  const titleText = (style.title || chart?.name || '未命名图表').trim() || '未命名图表'
  const trendSubtext = trendlines
    .map((item) => `${yColumns.length > 1 ? `${item.name}：` : ''}${item.text}`)
    .join('    ')

  const axisLabel = { color: '#7a8398', fontSize: 11 }
  const axisLine = { lineStyle: { color: '#d9dfec' } }
  const splitLine = { lineStyle: { color: '#eef1f7' } }
  const categoryAxis = {
    type: 'category',
    data: xLabels,
    name: style.xAxisName || xColumn?.name || '序号',
    nameLocation: 'middle',
    nameGap: 32,
    nameTextStyle: { color: '#8c94a8', fontSize: 11 },
    axisLabel: { ...axisLabel, hideOverlap: true },
    axisTick: { show: false },
    axisLine,
    splitLine: { show: false }
  }
  const valueAxis = {
    type: 'value',
    name: style.yAxisName || '',
    nameLocation: 'middle',
    nameGap: 42,
    nameTextStyle: { color: '#8c94a8', fontSize: 11 },
    axisLabel,
    axisLine: { show: false },
    splitLine,
    scale: isScatter
  }

  let xAxis
  let yAxis
  if (isScatter) {
    xAxis = {
      ...valueAxis,
      name: style.xAxisName || xColumn?.name || '序号',
      nameGap: 30,
      scale: true
    }
    yAxis = { ...valueAxis, name: style.yAxisName || '' }
  } else if (horizontal) {
    xAxis = { ...valueAxis, name: style.yAxisName || '' }
    yAxis = { ...categoryAxis, name: style.xAxisName || xColumn?.name || '序号' }
  } else {
    xAxis = categoryAxis
    yAxis = valueAxis
  }

  const option = {
    animation: forExport ? false : true,
    animationDuration: 450,
    animationEasing: 'cubicOut',
    color: style.palette?.length ? style.palette : DEFAULT_PALETTE,
    title: {
      text: titleText,
      subtext: trendSubtext,
      left: 8,
      top: 2,
      itemGap: 6,
      textStyle: { color: '#1a2138', fontSize: 15, fontWeight: 650 },
      subtextStyle: { color: '#8c94a8', fontSize: 11, lineHeight: 16 }
    },
    legend: {
      show: style.showLegend !== false,
      type: 'scroll',
      top: 6,
      right: 12,
      itemWidth: 14,
      itemHeight: 8,
      textStyle: { color: '#5b6479', fontSize: 11 },
      pageTextStyle: { color: '#8c94a8' },
      pageIconColor: '#8c94a8',
      pageIconInactiveColor: '#d4dae7'
    },
    tooltip: {
      trigger: isScatter || isPie ? 'item' : 'axis',
      axisPointer:
        isScatter || isPie
          ? undefined
          : { type: chartType === 'bar' ? 'shadow' : 'line', lineStyle: { color: '#c6cde0' } },
      confine: true,
      backgroundColor: 'rgba(29, 38, 57, 0.94)',
      borderWidth: 0,
      textStyle: { color: '#f4f6fb', fontSize: 12 },
      formatter: undefined
    },
    ...(isPie
      ? {}
      : {
          grid: {
            left: 18,
            right: 26,
            top: trendSubtext ? 92 : 62,
            bottom: 26,
            containLabel: true
          },
          xAxis,
          yAxis
        }),
    series
  }

  return { option, trendlines }
}
