import { describe, expect, it } from 'vitest'
import {
  describeTrend,
  distinctValues,
  formatEquation,
  isMonotonic,
  linearRegression
} from '../src/lib/stats'

describe('linearRegression', () => {
  it('拟合完美直线', () => {
    const regression = linearRegression([
      { x: 1, y: 3 },
      { x: 2, y: 5 },
      { x: 3, y: 7 }
    ])
    expect(regression.slope).toBeCloseTo(2, 10)
    expect(regression.intercept).toBeCloseTo(1, 10)
    expect(regression.r2).toBeCloseTo(1, 10)
    expect(regression.n).toBe(3)
  })

  it('忽略非法点并计算 R²', () => {
    const regression = linearRegression([
      { x: 0, y: 1 },
      { x: 1, y: 2 },
      { x: 2, y: 2 },
      { x: 3, y: 4 },
      { x: NaN, y: 5 },
      { x: 4, y: null }
    ])
    expect(regression.n).toBe(4)
    expect(regression.r2).toBeGreaterThan(0.8)
    expect(regression.r2).toBeLessThanOrEqual(1)
  })

  it('数据不足或方差为零时返回 null', () => {
    expect(linearRegression([{ x: 1, y: 1 }])).toBeNull()
    expect(
      linearRegression([
        { x: 1, y: 1 },
        { x: 1, y: 2 }
      ])
    ).toBeNull()
  })
})

describe('formatEquation', () => {
  it('输出带符号的方程', () => {
    expect(formatEquation({ slope: 2, intercept: 1 })).toBe('y = 2x + 1')
    expect(formatEquation({ slope: -0.5, intercept: -3 })).toBe('y = -0.5x - 3')
    expect(describeTrend({ slope: 2, intercept: 1, r2: 0.998765, n: 5 })).toBe(
      'y = 2x + 1，R² = 0.9988（n=5）'
    )
  })
})

describe('dataset helpers', () => {
  const rows = [
    { values: { group: 'A' } },
    { values: { group: 'B' } },
    { values: { group: 'A' } },
    { values: { group: '' } }
  ]

  it('去重分类值', () => {
    expect(distinctValues(rows, { id: 'group' })).toEqual(['A', 'B'])
  })

  it('识别单调序列', () => {
    expect(isMonotonic([1, 2, 3, 4])).toBe(true)
    expect(isMonotonic([4, 3, 2, 1])).toBe(true)
    expect(isMonotonic([1, 3, 2])).toBe(false)
    expect(isMonotonic([1, 2])).toBe(false)
  })
})
