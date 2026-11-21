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

  it('时间序列单指标同时给出折线与面积备选', () => {
    const dataset = {
      columns: [column('date', '测量日期', 'date'), column('temp', '温度')],
      rows: []
    }
    const rows = makeRows([
      { date: '2026-01-01', temp: 10 },
      { date: '2026-01-02', temp: 12 },
      { date: '2026-01-03', temp: 11 },
      { date: '2026-01-04', temp: 14 },
      { date: '2026-01-05', temp: 16 }
    ])
    const result = recommendCharts(dataset, rows)
    expect(result.suggestions[0].type).toBe('line')
    expect(result.suggestions.map((item) => item.type)).toContain('area')
  })

  it('包含负值的时间序列不建议面积图', () => {
    const dataset = {
      columns: [column('date', '测量日期', 'date'), column('delta', '误差')],
      rows: []
    }
    const rows = makeRows([
      { date: '2026-01-01', delta: -2 },
      { date: '2026-01-02', delta: 3 },
      { date: '2026-01-03', delta: -1 },
      { date: '2026-01-04', delta: 4 }
    ])
    const result = recommendCharts(dataset, rows)
    expect(result.suggestions.some((item) => item.type === 'area')).toBe(false)
  })

  it('散点图挑选相关性最强的一对，并引用相关系数', () => {
    const dataset = {
      columns: [column('x', '电压'), column('y', '电流'), column('z', '噪声')],
      rows: []
    }
    const rows = makeRows([
      { x: 1, y: 3, z: 5 },
      { x: 2, y: 5, z: 1 },
      { x: 3, y: 7, z: 6 },
      { x: 4, y: 9, z: 2 },
      { x: 5, y: 11, z: 8 },
      { x: 6, y: 13, z: 4 }
    ])
    const result = recommendCharts(dataset, rows)
    const scatter = result.suggestions.find((item) => item.type === 'scatter')
    expect(scatter).toBeTruthy()
    expect(scatter.xColumnId).toBe('x')
    expect(scatter.yColumnIds).toEqual(['y'])
    expect(scatter.reasons[0]).toContain('r =')
    expect(scatter.confidence).toBeGreaterThan(0.9)
  })

  it('常量列和编号列不会进入指标', () => {
    const dataset = {
      columns: [
        column('group', '组别', 'text'),
        column('value', '测量值'),
        column('const', '固定值'),
        column('sid', '学号')
      ],
      rows: []
    }
    const rows = makeRows([
      { group: 'A', value: 10, const: 5, sid: 1 },
      { group: 'A', value: 12, const: 5, sid: 2 },
      { group: 'B', value: 20, const: 5, sid: 3 },
      { group: 'B', value: 22, const: 5, sid: 4 }
    ])
    const result = recommendCharts(dataset, rows)
    const bar = result.suggestions.find((item) => item.type === 'bar')
    expect(bar).toBeTruthy()
    expect(bar.yColumnIds).toEqual(['value'])
    expect(result.suggestions.some((item) => item.type === 'scatter')).toBe(false)
  })

  it('分类过多时不给柱状图或饼图建议', () => {
    const columns = [column('group', '组别', 'text'), column('score', '得分')]
    const dataset = { columns, rows: [] }
    const rows = makeRows(
      Array.from({ length: 13 }, (_, index) => ({
        group: `第${index + 1}类`,
        score: 60 + index
      }))
    )
    const result = recommendCharts(dataset, rows)
    expect(result.suggestions.some((item) => item.type === 'bar')).toBe(false)
    expect(result.suggestions.some((item) => item.type === 'pie')).toBe(false)
  })

  it('长分类名建议横向柱状图', () => {
    const dataset = {
      columns: [column('group', '组别', 'text'), column('score', '得分')],
      rows: []
    }
    const rows = makeRows([
      { group: '第一实验小组', score: 80 },
      { group: '第二实验小组', score: 90 }
    ])
    const result = recommendCharts(dataset, rows)
    const bar = result.suggestions.find((item) => item.type === 'bar')
    expect(bar.style.barHorizontal).toBe(true)
    expect(bar.title).toContain('横向')
  })

  it('量纲接近的多个指标共用 Y 轴', () => {
    const dataset = {
      columns: [
        column('date', '记录日期', 'date'),
        column('a', '温度'),
        column('b', '湿度'),
        column('c', '光照强度')
      ],
      rows: []
    }
    const rows = makeRows([
      { date: '2026-01-01', a: 10, b: 20, c: 10000 },
      { date: '2026-01-02', a: 20, b: 30, c: 20000 },
      { date: '2026-01-03', a: 30, b: 40, c: 30000 },
      { date: '2026-01-04', a: 40, b: 50, c: 40000 }
    ])
    const result = recommendCharts(dataset, rows)
    const line = result.suggestions.find((item) => item.type === 'line')
    expect(line.yColumnIds).toEqual(['a', 'b'])
    expect(line.reasons.some((reason) => reason.includes('量纲接近'))).toBe(true)
  })

  it('不同数据特征得到不同类型集合', () => {
    const timeResult = recommendCharts(
      {
        columns: [column('date', '日期', 'date'), column('temp', '温度')],
        rows: []
      },
      makeRows([
        { date: '2026-01-01', temp: 10 },
        { date: '2026-01-02', temp: 12 },
        { date: '2026-01-03', temp: 11 }
      ])
    )
    const categoryResult = recommendCharts(
      {
        columns: [column('group', '班级', 'text'), column('score', '成绩')],
        rows: []
      },
      makeRows([
        { group: '一班', score: 80 },
        { group: '二班', score: 90 },
        { group: '三班', score: 85 }
      ])
    )
    const pairResult = recommendCharts(
      {
        columns: [column('mass', '质量'), column('ext', '伸长量')],
        rows: []
      },
      makeRows([
        { mass: 50, ext: 1.2 },
        { mass: 100, ext: 2.4 },
        { mass: 150, ext: 3.6 }
      ])
    )

    const types = (result) => result.suggestions.map((item) => item.type).sort().join(',')
    expect(types(timeResult)).toContain('line')
    expect(types(categoryResult)).toContain('bar')
    expect(types(categoryResult)).toContain('pie')
    expect(types(pairResult)).toContain('scatter')
    expect(types(timeResult)).not.toBe(types(categoryResult))
    expect(types(categoryResult)).not.toBe(types(pairResult))
  })
})
