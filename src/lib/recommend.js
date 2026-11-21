import { distinctValues, isMonotonic, numericValues } from './stats'

const TIME_NAME_PATTERN = /(时间|时刻|日期|年份|月份|周次|day|date|time)/i

function columnLabel(column) {
  return `「${column.name}」`
}

function pickNumericY(columns, excludingId = null, limit = 2) {
  return columns
    .filter((column) => column.type === 'number' && column.id !== excludingId)
    .slice(0, limit)
    .map((column) => column.id)
}

/**
 * 规则式图表推荐：输入数据集与已计算行，输出按可信度排序的建议。
 * 全部在本地完成，不上传任何数据。
 */
export function recommendCharts(dataset, computedRows) {
  const columns = dataset?.columns || []
  const rows = computedRows || []
  const numericColumns = columns.filter((column) => column.type === 'number')
  const textColumns = columns.filter((column) => column.type === 'text')
  const dateColumns = columns.filter((column) => column.type === 'date')
  const candidates = []

  if (numericColumns.length === 0) {
    return {
      suggestions: [],
      hint: '当前数据集没有数值列，请先添加数值列（或公式列）再生成图表。'
    }
  }

  const rowCount = rows.length
  if (rowCount === 0) {
    return { suggestions: [], hint: '当前数据集还没有数据行，录入数据后再试试。' }
  }

  const timeColumn =
    dateColumns[0] ||
    numericColumns.find((column) => {
      if (!TIME_NAME_PATTERN.test(column.name)) return false
      return isMonotonic(numericValues(rows, column))
    })

  if (timeColumn) {
    const y = pickNumericY(columns, timeColumn.id, 2)
    if (y.length > 0) {
      candidates.push({
        key: `line-time-${timeColumn.id}`,
        type: 'line',
        xColumnId: timeColumn.id,
        yColumnIds: y,
        confidence: 0.95,
        title: '折线图 · 时间序列趋势',
        reasons: [
          `列${columnLabel(timeColumn)}具有时间含义，折线图最适合展示随时间变化的趋势。`,
          `已自动选择 ${y.length} 个数值指标作为 Y 轴。`
        ],
        trendline: false
      })
    }
  }

  const categoryCandidates = [...textColumns, ...dateColumns]
    .map((column) => ({ column, values: distinctValues(rows, column) }))
    .filter((item) => item.values.length >= 2 && item.values.length <= 12)
    .sort((a, b) => a.values.length - b.values.length)

  const category = categoryCandidates[0]
  if (category) {
    const y = pickNumericY(columns, category.column.id, 1)
    if (y.length > 0) {
      candidates.push({
        key: `bar-category-${category.column.id}`,
        type: 'bar',
        xColumnId: category.column.id,
        yColumnIds: y,
        confidence: 0.86,
        title: '柱状图 · 分类对比',
        reasons: [
          `列${columnLabel(category.column)}只有 ${category.values.length} 个分类取值，柱状图更利于横向比较。`,
          category.values.length > 8
            ? '分类较多，建议只保留最关键的 1-2 个指标。'
            : '分类数量适中，适合直接展示各组的数值差异。'
        ],
        trendline: false
      })
    }
  }

  if (numericColumns.length >= 2) {
    const x = numericColumns[0]
    const y = pickNumericY(columns, x.id, 1)
    if (y.length > 0) {
      const xValues = numericValues(rows, x)
      const monotonic = isMonotonic(xValues)
      candidates.push({
        key: `scatter-${x.id}-${y.join('_')}`,
        type: 'scatter',
        xColumnId: x.id,
        yColumnIds: y,
        confidence: monotonic ? 0.89 : category ? 0.87 : 0.8,
        title: '散点图 · 相关性观察',
        reasons: [
          `数据中有 ${numericColumns.length} 个数值列，两组数值之间的关系适合用散点图观察。`,
          monotonic
            ? `列${columnLabel(x)}近似单调递增，应用后会叠加线性趋势线解读变化方向。`
            : '应用后会默认叠加线性趋势线，可在图表设置中关闭或调整。'
        ],
        trendline: true
      })
    }
  }

  if (category && numericColumns.length === 1) {
    candidates.push({
      key: `bar-single-${category.column.id}`,
      type: 'bar',
      xColumnId: category.column.id,
      yColumnIds: [numericColumns[0].id],
      confidence: 0.74,
      title: '柱状图 · 单指标分组',
      reasons: [
        `只有一个数值列${columnLabel(numericColumns[0])}，按${columnLabel(category.column)}分组展示最直接。`,
        '若分类过多，可以改用折线图查看整体走势。'
      ],
      trendline: false
    })
  }

  const seen = new Set()
  const suggestions = candidates
    .filter((candidate) => {
      const signature = `${candidate.type}-${candidate.xColumnId}-${candidate.yColumnIds.join(',')}`
      if (seen.has(signature)) return false
      seen.add(signature)
      return true
    })
    .sort((a, b) => b.confidence - a.confidence)
    .slice(0, 3)

  return {
    suggestions,
    hint:
      suggestions.length === 0
        ? '暂时找不到合适的组合，尝试添加分类列（文本）或数值列后再试。'
        : ''
  }
}
