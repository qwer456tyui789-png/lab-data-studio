import { describe, expect, it } from 'vitest'
import {
  inferColumnType,
  isDateText,
  isNumericText,
  normalizeMatrix,
  parseCSV,
  parseTSV,
  serializeCSV
} from '../src/lib/csv'

describe('parseCSV', () => {
  it('解析基础 CSV 与 CRLF', () => {
    expect(parseCSV('a,b\r\n1,2\r\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })

  it('支持引号内的逗号、换行与转义引号', () => {
    const text = 'name,note\r\n"张, 三","第一行\n第二行"\r\n"李""四",ok'
    expect(parseCSV(text)).toEqual([
      ['name', 'note'],
      ['张, 三', '第一行\n第二行'],
      ['李"四', 'ok']
    ])
  })

  it('去除 BOM 并忽略末尾空行', () => {
    expect(parseCSV('﻿a,b\n1,2\n\n')).toEqual([
      ['a', 'b'],
      ['1', '2']
    ])
  })
})

describe('serializeCSV', () => {
  it('自动加 BOM 并转义', () => {
    const text = serializeCSV([
      ['名称', '备注'],
      ['张, 三', '他说"好"\n第二行']
    ])
    expect(text.startsWith('﻿')).toBe(true)
    expect(text).toContain('"张, 三"')
    expect(text).toContain('"他说""好""\n第二行"')
  })

  it('往返一致', () => {
    const matrix = [
      ['组别', '数值'],
      ['A组', '1.5'],
      ['B组', '-2']
    ]
    expect(parseCSV(serializeCSV(matrix))).toEqual(matrix)
  })
})

describe('TSV 与类型推断', () => {
  it('解析 Excel 粘贴的 TSV', () => {
    expect(parseTSV('A\t1\t9.8\nB\t2\t9.7')).toEqual([
      ['A', '1', '9.8'],
      ['B', '2', '9.7']
    ])
  })

  it('推断列类型', () => {
    expect(inferColumnType(['1', '2.5', ''])).toBe('number')
    expect(inferColumnType(['2026-01-01', '2026-02-03'])).toBe('date')
    expect(inferColumnType(['A', '1'])).toBe('text')
    expect(inferColumnType([])).toBe('text')
  })

  it('数值与日期判定', () => {
    expect(isNumericText(' -1.2e3 ')).toBe(true)
    expect(isNumericText('1.2.3')).toBe(false)
    expect(isDateText('2026-11-21')).toBe(true)
    expect(isDateText('2026-13-40')).toBe(false)
  })

  it('补齐不规则矩阵', () => {
    expect(normalizeMatrix([['a'], ['b', 'c', 'd']])).toEqual([
      ['a', '', ''],
      ['b', 'c', 'd']
    ])
  })
})
