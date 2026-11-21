import { describe, expect, it } from 'vitest'
import { buildChartOption } from '../src/lib/chartOptions'

function column(id, name, type = 'number') {
  return { id, name, type, formula: null }
}

const dataset = {
  columns: [column('group', '组别', 'text'), column('value', '测量值'), column('t', '时间')],
  rows: []
}

function makeRows(valuesList) {
  return valuesList.map((values, index) => ({
    id: `r${index}`,
    values,
    display: Object.fromEntries(
      Object.entries(values).map(([key, value]) => [key, String(value)])
    ),
    errors: {}
  }))
}

const rows = makeRows([
  { group: '第1组', value: 10, t: 0 },
  { group: '第1组', value: 20, t: 1 },
  { group: '第2组', value: 30, t: 2 }
])

const chart = {
  name: '测试图表',
  type: 'bar',
  xColumnId: 'group',
  yColumnIds: ['value'],
  style: {},
  trendline: { enabled: false }
}

describe('buildChartOption', () => {
  it('柱状图按分类聚合并取均值', () => {
    const { option } = buildChartOption({ dataset, computedRows: rows, chart })
    const barSeries = option.series.find((item) => item.type === 'bar')
    expect(option.xAxis.data).toEqual(['第1组', '第2组'])
    expect(barSeries.data.map((item) => item.value)).toEqual([15, 30])
    expect(barSeries.data.map((item) => item.category)).toEqual(['第1组', '第2组'])
  })

  it('柱状图聚合项不携带行 id，散点图保留行 id', () => {
    const { option: barOption } = buildChartOption({ dataset, computedRows: rows, chart })
    expect(barOption.series[0].data[0].rowId).toBeUndefined()

    const scatterChart = { ...chart, type: 'scatter', xColumnId: 't' }
    const { option: scatterOption } = buildChartOption({
      dataset,
      computedRows: rows,
      chart: scatterChart
    })
    expect(scatterOption.series[0].data[1].rowId).toBe('r1')
  })

  it('折线图按分类聚合，数值 X 轴自动升序', () => {
    const numericDataset = {
      columns: [column('mass', '质量(g)'), column('ext', '伸长量(cm)')],
      rows: []
    }
    const numericRows = makeRows([
      { mass: 100, ext: 2 },
      { mass: 50, ext: 1 },
      { mass: 100, ext: 4 }
    ])
    const lineChart = {
      ...chart,
      type: 'line',
      xColumnId: 'mass',
      yColumnIds: ['ext']
    }
    const { option } = buildChartOption({
      dataset: numericDataset,
      computedRows: numericRows,
      chart: lineChart
    })
    expect(option.xAxis.data).toEqual(['50', '100'])
    expect(option.series[0].data.map((item) => item.value)).toEqual([1, 3])
  })

  it('系列颜色按数值列顺序分配，与样式面板一致', () => {
    const colorDataset = {
      columns: [column('group', '组别', 'text'), column('a', '甲'), column('b', '乙')],
      rows: []
    }
    const colorRows = makeRows([{ group: 'A组', a: 1, b: 2 }])
    const lineChart = {
      ...chart,
      type: 'line',
      xColumnId: 'group',
      yColumnIds: ['b']
    }
    const { option } = buildChartOption({
      dataset: colorDataset,
      computedRows: colorRows,
      chart: lineChart
    })
    expect(option.series[0].itemStyle.color).toBe('#ee6c4d')
  })

  it('联动过滤后仅使用匹配行', () => {
    const { option } = buildChartOption({
      dataset,
      computedRows: rows,
      chart,
      filterValue: '第2组',
      linkageColumnId: 'group'
    })
    expect(option.xAxis.data).toEqual(['第2组'])
    expect(option.series[0].data[0].value).toBe(30)
  })

  it('无数值指标时返回提示而不是空图', () => {
    const { option } = buildChartOption({
      dataset,
      computedRows: rows,
      chart: { ...chart, yColumnIds: ['group'] }
    })
    expect(option.title.text).toContain('请选择至少一个数值指标')
    expect(option.series).toBeUndefined()
  })

  it('饼图按分类求和，且不生成坐标轴', () => {
    const pieChart = { ...chart, type: 'pie' }
    const { option } = buildChartOption({ dataset, computedRows: rows, chart: pieChart })
    expect(option.xAxis).toBeUndefined()
    expect(option.yAxis).toBeUndefined()
    expect(option.grid).toBeUndefined()
    expect(option.tooltip.trigger).toBe('item')
    expect(option.series[0].type).toBe('pie')
    expect(option.series[0].data.map((item) => item.value)).toEqual([30, 30])
    expect(option.series[0].data.map((item) => item.category)).toEqual(['第1组', '第2组'])
  })

  it('面积图强制填充并保留折线系列', () => {
    const areaChart = { ...chart, type: 'area', style: { area: false } }
    const { option } = buildChartOption({ dataset, computedRows: rows, chart: areaChart })
    const series = option.series[0]
    expect(series.type).toBe('line')
    expect(series.areaStyle).toBeTruthy()
    expect(option.xAxis.data).toEqual(['第1组', '第2组'])
  })
})
