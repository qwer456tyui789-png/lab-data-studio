import { describe, expect, it } from 'vitest'
import { recommendCharts } from '../src/lib/recommend'

function column(id, name, type = 'number') {
  return { id, name, type, formula: null }
}

function makeRows(valuesList) {
  return valuesList.map((values, index) => ({
    id: `r${index}`,
    values,
    display: values,
    errors: {}
  }))
}

describe('recommendCharts', () => {
  it('时间列优先推荐折线图', () => {
    const dataset = {
      columns: [column('date', '测量日期', 'date'), column('temp', '温度')],
      rows: []
    }
    const rows = makeRows([
      { date: '2026-01-01', temp: 10 },
      { date: '2026-01-02', temp: 12 }
    ])
    const result = recommendCharts(dataset, rows)
    expect(result.suggestions[0].type).toBe('line')
    expect(result.suggestions[0].xColumnId).toBe('date')
    expect(result.suggestions[0].confidence).toBeGreaterThan(0.9)
  })

  it('低基数分类列推荐柱状图', () => {
    const dataset = {
      columns: [column('group', '组别', 'text'), column('score', '成绩')],
      rows: []
    }
    const rows = makeRows([
      { group: 'A组', score: 90 },
      { group: 'B组', score: 85 },
      { group: 'C组', score: 92 }
    ])
    const result = recommendCharts(dataset, rows)
    const bar = result.suggestions.find((item) => item.type === 'bar')
    expect(bar).toBeTruthy()
    expect(bar.xColumnId).toBe('group')
    expect(bar.reasons.length).toBeGreaterThan(0)
  })

  it('多个数值列推荐散点图并建议趋势线', () => {
    const dataset = {
      columns: [column('x', '质量'), column('y', '伸长量')],
      rows: []
    }
    const rows = makeRows([
      { x: 50, y: 1.2 },
      { x: 100, y: 2.4 },
      { x: 150, y: 3.6 }
    ])
    const result = recommendCharts(dataset, rows)
    const scatter = result.suggestions.find((item) => item.type === 'scatter')
    expect(scatter).toBeTruthy()
    expect(scatter.trendline).toBe(true)
  })

  it('无数值列时给出提示', () => {
    const result = recommendCharts(
      { columns: [column('name', '名称', 'text')], rows: [] },
      makeRows([{ name: 'A' }])
    )
    expect(result.suggestions).toHaveLength(0)
    expect(result.hint).toContain('数值列')
  })

  it('无数据行时给出提示', () => {
    const result = recommendCharts(
      { columns: [column('x', 'x')], rows: [] },
      []
    )
    expect(result.suggestions).toHaveLength(0)
    expect(result.hint).toContain('数据行')
  })
})
