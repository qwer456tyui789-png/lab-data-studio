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
})
