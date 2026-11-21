import { describe, expect, it } from 'vitest'
import {
  FormulaError,
  computeDataset,
  formatNumber,
  parseFormula,
  validateFormula
} from '../src/lib/formula'

function column(id, name, type = 'number', formula = null) {
  return { id, name, type, formula }
}

function row(id, cells) {
  return { id, cells }
}

function evaluate(expression, rows = [{ id: 'r1', cells: {} }]) {
  const formulaColumn = column('calc', '结果', 'number', expression)
  const dataset = { columns: [formulaColumn], rows }
  return computeDataset(dataset).rows[0]
}

describe('parseFormula', () => {
  it('计算优先级与括号', () => {
    expect(evaluate('1+2*3').values.calc).toBe(7)
    expect(evaluate('(1+2)*3').values.calc).toBe(9)
    expect(evaluate('2^3^2').values.calc).toBe(512)
    expect(evaluate('-2^2').values.calc).toBe(-4)
    expect(evaluate('2^-1').values.calc).toBe(0.5)
    expect(evaluate('10/4').values.calc).toBe(2.5)
  })

  it('拒绝非法表达式', () => {
    expect(() => parseFormula('')).toThrow(FormulaError)
    expect(() => parseFormula('1+')).toThrow(FormulaError)
    expect(() => parseFormula('1 2')).toThrow(FormulaError)
    expect(() => parseFormula('[未闭合')).toThrow(FormulaError)
    expect(() => parseFormula('foo(1)')).toThrow(FormulaError)
    expect(() => parseFormula('round(1,2,3)')).toThrow(FormulaError)
  })
})

describe('computeDataset', () => {
  const columns = [
    column('mass', '质量(g)'),
    column('height', '下落高度(m)'),
    column('time', '下落时间(s)'),
    column('g', '重力加速度(m/s²)', 'number', 'round(2*[下落高度(m)]/[下落时间(s)]^2, 2)')
  ]
  const rows = [
    row('r1', { mass: '10', height: '1.00', time: '0.45' }),
    row('r2', { mass: '20', height: '2.00', time: '0.64' })
  ]

  it('按列名引用并计算公式列', () => {
    const computed = computeDataset({ columns, rows })
    expect(computed.rows[0].values.g).toBeCloseTo(9.88, 2)
    expect(computed.rows[1].values.g).toBeCloseTo(9.77, 2)
    expect(computed.rows[0].display.g).toBe('9.88')
  })

  it('支持聚合函数', () => {
    const dataset = {
      columns: [column('x', 'x'), column('avg', '平均值', 'number', 'avg([x])'), column('sum', '合计', 'number', 'sum([x])')],
      rows: [row('r1', { x: '1' }), row('r2', { x: '2' }), row('r3', { x: '3' })]
    }
    const computed = computeDataset(dataset)
    expect(computed.rows.map((r) => r.values.avg)).toEqual([2, 2, 2])
    expect(computed.rows.map((r) => r.values.sum)).toEqual([6, 6, 6])
  })

  it('公式可以引用其它公式列', () => {
    const dataset = {
      columns: [
        column('x', 'x'),
        column('double', '双倍', 'number', '[x]*2'),
        column('plus', '再加一', 'number', '[双倍]+1')
      ],
      rows: [row('r1', { x: '5' })]
    }
    const computed = computeDataset(dataset)
    expect(computed.rows[0].values.double).toBe(10)
    expect(computed.rows[0].values.plus).toBe(11)
  })

  it('返回具体错误码', () => {
    expect(evaluate('[不存在]+1', [row('r1', {})]).errors.calc).toBe('REF')
    expect(evaluate('1/0').errors.calc).toBe('DIV0')
    expect(evaluate('[x]+1', [row('r1', { x: '' })])).toBeTruthy()
    const missing = computeDataset({
      columns: [column('x', 'x'), column('calc', '结果', 'number', '[x]+1')],
      rows: [row('r1', { x: '' })]
    })
    expect(missing.rows[0].errors.calc).toBe('VALUE')
  })

  it('检测循环引用', () => {
    const dataset = {
      columns: [
        column('a', 'A', 'number', '[B]+1'),
        column('b', 'B', 'number', '[A]+1')
      ],
      rows: [row('r1', {})]
    }
    const computed = computeDataset(dataset)
    expect(computed.rows[0].errors.a).toBe('CYCLE')
    expect(computed.rows[0].errors.b).toBe('CYCLE')
  })

  it('标记无效数字单元格', () => {
    const computed = computeDataset({
      columns: [column('x', 'x')],
      rows: [row('r1', { x: 'abc' })]
    })
    expect(computed.rows[0].errors.x).toBe('VALUE')
    expect(computed.rows[0].values.x).toBeNull()
  })
})

describe('validateFormula', () => {
  const columns = [column('x', 'x'), column('y', 'y')]
  it('校验引用存在性', () => {
    expect(() => validateFormula('[x]+1', columns)).not.toThrow()
    expect(() => validateFormula('[缺失]+1', columns)).toThrow(FormulaError)
    expect(() => validateFormula('[x]+1', columns, 'x')).toThrow(FormulaError)
  })
})

describe('formatNumber', () => {
  it('格式化展示值', () => {
    expect(formatNumber(3)).toBe('3')
    expect(formatNumber(3.14159265)).toBe('3.141593')
    expect(formatNumber(null)).toBe('')
    expect(formatNumber(0.00000001)).toContain('e')
  })
})
