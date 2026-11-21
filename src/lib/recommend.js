import { isMonotonic, numericValues, pearsonCorrelation } from './stats'

const TIME_NAME_PATTERN = /(时间|时刻|日期|年份|月份|周次|天|day|date|time)/i
const ID_NAME_PATTERN = /(编号|学号|序号|代码|id|code)/i
const FREE_TEXT_PATTERN = /(备注|说明|描述|note|remark|comment|memo)/i
const ADDITIVE_PATTERN =
  /(数量|人数|次数|个数|件数|销量|产量|金额|收入|支出|总数|总量|总计|得分|成绩|分数|count|amount|total|sales)/i
const NON_ADDITIVE_PATTERN =
  /(温度|湿度|时间|高度|速度|加速度|浓度|吸光度|透光率|压强|气压|光照|质量|摆长|伸长|电压|电流|电阻)/i

function columnLabel(column) {
  return `「${column.name}」`
}

function fmt(value) {
  if (!Number.isFinite(value)) return '—'
  return String(Number(value.toFixed(3)))
}

function summarizeColumn(rows, column) {
  if (column.type === 'number') {
    const values = []
    let missing = 0
    for (const row of rows) {
      const raw = row.values?.[column.id]
      if (Number.isFinite(raw)) values.push(raw)
      else if (raw == null || String(raw).trim() === '') missing += 1
    }
    let sum = 0
    let min = Infinity
    let max = -Infinity
    for (const value of values) {
      sum += value
      if (value < min) min = value
      if (value > max) max = value
    }
    const mean = values.length ? sum / values.length : 0
    let variance = 0
    for (const value of values) variance += (value - mean) ** 2
    variance = values.length ? variance / values.length : 0
    return {
      values,
      count: values.length,
      missing,
      mean,
      min: values.length ? min : 0,
      max: values.length ? max : 0,
      std: Math.sqrt(variance)
    }
  }

  const values = []
  let missing = 0
  for (const row of rows) {
    const raw = row.values?.[column.id]
    const text = raw == null ? '' : String(raw).trim()
    if (text === '') {
      missing += 1
      continue
    }
    values.push(text)
  }
  const counts = new Map()
  for (const value of values) counts.set(value, (counts.get(value) || 0) + 1)
  const distinct = [...counts.entries()].map(([value, count]) => ({ value, count }))
  let totalLength = 0
  for (const value of values) totalLength += value.length
  return {
    values,
    count: values.length,
    missing,
    distinct,
    avgLength: values.length ? totalLength / values.length : 0,
    minGroup: distinct.length ? Math.min(...distinct.map((item) => item.count)) : 0,
    maxGroup: distinct.length ? Math.max(...distinct.map((item) => item.count)) : 0
  }
}

function magnitude(stats) {
  return Math.max(Math.abs(stats.mean), stats.std, 1e-9)
}

/**
 * 在多个候选指标中挑选最多两个：优先选择量纲接近的一对，
 * 量纲差异超过 20 倍时只保留单个指标，避免 Y 轴被压扁。
 */
function pickMetrics(items, limit = 2) {
  if (items.length === 0) return []
  if (items.length <= limit) return items

  let best = [items[0], items[1]]
  let bestSpread = Infinity
  for (let i = 0; i < items.length; i += 1) {
    for (let j = i + 1; j < items.length; j += 1) {
      const spread = Math.abs(Math.log10(magnitude(items[i].stats) / magnitude(items[j].stats)))
      if (spread < bestSpread) {
        bestSpread = spread
        best = [items[i], items[j]]
      }
    }
  }
  if (bestSpread <= Math.log10(20)) return best.slice(0, limit)
  return [items[0]]
}

function pickDiverse(candidates, limit = 3) {
  const seen = new Set()
  const unique = []
  for (const candidate of candidates) {
    const signature = `${candidate.type}-${candidate.xColumnId}-${candidate.yColumnIds.join(',')}`
    if (seen.has(signature)) continue
    seen.add(signature)
    unique.push(candidate)
  }
  unique.sort((a, b) => b.confidence - a.confidence)

  const diverse = []
  const rest = []
  for (const candidate of unique) {
    if (diverse.some((item) => item.type === candidate.type)) rest.push(candidate)
    else diverse.push(candidate)
  }
  for (const candidate of rest) {
    if (diverse.length >= limit) break
    diverse.push(candidate)
  }
  return diverse.sort((a, b) => b.confidence - a.confidence).slice(0, limit)
}

/**
 * 规则式图表推荐：根据日期列、分类基数、数值相关性、指标量纲与常量列，
 * 在不同数据集上给出不同图表类型与坐标轴组合。全部在本地完成。
 */
export function recommendCharts(dataset, computedRows) {
  const columns = dataset?.columns || []
  const rows = computedRows || []
  const numericTyped = columns.filter((column) => column.type === 'number')

  if (numericTyped.length === 0) {
    return {
      suggestions: [],
      hint: '当前数据集没有数值列，请先添加数值列（或公式列）再生成图表。'
    }
  }
  if (rows.length === 0) {
    return { suggestions: [], hint: '当前数据集还没有数据行，录入数据后再试试。' }
  }

  const summaries = new Map(columns.map((column) => [column.id, summarizeColumn(rows, column)]))

  // 常量列、编号列不参与指标推荐
  const metricColumns = numericTyped
    .filter((column) => !ID_NAME_PATTERN.test(column.name))
    .map((column) => ({ column, stats: summaries.get(column.id) }))
    .filter((item) => item.stats.count >= 2 && item.stats.std > 0)

  const dateColumns = columns.filter(
    (column) => column.type === 'date' && summaries.get(column.id).distinct.length >= 2
  )
  const numericTime = numericTyped.find((column) => {
    if (!TIME_NAME_PATTERN.test(column.name)) return false
    const values = numericValues(rows, column)
    return values.length >= 3 && isMonotonic(values)
  })
  const timeColumn = dateColumns[0] || numericTime || null

  const categoryItems = columns
    .filter((column) => column.type === 'text' && column.id !== timeColumn?.id)
    .map((column) => ({ column, stats: summaries.get(column.id) }))
    .filter((item) => {
      if (ID_NAME_PATTERN.test(item.column.name) || FREE_TEXT_PATTERN.test(item.column.name)) {
        return false
      }
      if (item.stats.avgLength > 10) return false
      const distinctCount = item.stats.distinct.length
      if (distinctCount < 2 || distinctCount > 12) return false
      // 近似唯一取值的文本列（如姓名、编号）不适合做分类
      return !(distinctCount >= 6 && distinctCount >= rows.length * 0.9)
    })
    .sort((a, b) => a.stats.distinct.length - b.stats.distinct.length)

  const candidates = []

  if (timeColumn) {
    const timeStats = summaries.get(timeColumn.id)
    const points = timeStats.distinct.length
    const timeLabel = columnLabel(timeColumn)
    const yItems = pickMetrics(
      metricColumns.filter((item) => item.column.id !== timeColumn.id),
      2
    )

    if (yItems.length > 0) {
      const confidence = 0.9 + Math.min(0.05, points * 0.005)
      const reasons = [
        `${timeLabel}${timeColumn.type === 'date' ? '是日期列' : '随时间递增'}，共有 ${points} 个时间点，折线图适合展示变化趋势。`
      ]
      if (yItems.length === 2) {
        reasons.push(
          `${columnLabel(yItems[0].column)}与${columnLabel(yItems[1].column)}量纲接近，可共用 Y 轴对比走势。`
        )
      } else {
        reasons.push(`已选择${columnLabel(yItems[0].column)}作为 Y 轴指标。`)
      }
      candidates.push({
        key: `line-time-${timeColumn.id}`,
        type: 'line',
        xColumnId: timeColumn.id,
        yColumnIds: yItems.map((item) => item.column.id),
        confidence,
        title: '折线图 · 时间趋势',
        reasons,
        trendline: false
      })

      if (yItems.length === 1 && yItems[0].stats.min >= 0) {
        candidates.push({
          key: `area-time-${timeColumn.id}-${yItems[0].column.id}`,
          type: 'area',
          xColumnId: timeColumn.id,
          yColumnIds: [yItems[0].column.id],
          confidence: confidence - 0.05,
          title: '面积图 · 时间序列体量',
          reasons: [
            `${columnLabel(yItems[0].column)}均为非负值，面积图能在折线基础上强调数值体量。`,
            `X 轴使用${timeLabel}，共 ${points} 个时间点。`
          ],
          trendline: false
        })
      }
    }
  }

  const category = categoryItems[0] || null
  const categoryMetrics = pickMetrics(metricColumns, 2)
  if (category && categoryMetrics.length > 0) {
    const distinctCount = category.stats.distinct.length
    const horizontal = category.stats.avgLength >= 4 || distinctCount >= 8
    const confidence = Math.max(0.74, 0.9 - Math.max(0, distinctCount - 2) * 0.012)
    candidates.push({
      key: `bar-category-${category.column.id}`,
      type: 'bar',
      xColumnId: category.column.id,
      yColumnIds: categoryMetrics.map((item) => item.column.id),
      confidence,
      title: horizontal ? '横向柱状图 · 分类对比' : '柱状图 · 分类对比',
      reasons: [
        `分类列${columnLabel(category.column)}有 ${distinctCount} 个取值，柱状图适合比较各组的均值水平。`,
        horizontal
          ? '分类名称较长或数量较多，已建议使用横向柱状图，标签更易阅读。'
          : '分类数量适中，适合直接对比各组的差异。'
      ],
      trendline: false,
      style: horizontal ? { barHorizontal: true } : undefined
    })
  }

  const pieCategory = categoryItems.find(
    (item) => item.stats.distinct.length >= 2 && item.stats.distinct.length <= 5
  )
  const pieMetric =
    metricColumns.find(
      (item) => item.stats.min >= 0 && ADDITIVE_PATTERN.test(item.column.name)
    ) ||
    metricColumns.find(
      (item) =>
        item.stats.min >= 0 &&
        !NON_ADDITIVE_PATTERN.test(item.column.name) &&
        !TIME_NAME_PATTERN.test(item.column.name)
    )
  if (pieCategory && pieMetric) {
    const additive = ADDITIVE_PATTERN.test(pieMetric.column.name)
    candidates.push({
      key: `pie-category-${pieCategory.column.id}-${pieMetric.column.id}`,
      type: 'pie',
      xColumnId: pieCategory.column.id,
      yColumnIds: [pieMetric.column.id],
      confidence: additive ? 0.76 : 0.66,
      title: '饼图 · 分类占比',
      reasons: [
        `分类列${columnLabel(pieCategory.column)}只有 ${pieCategory.stats.distinct.length} 个取值，饼图可展示各组的占比。`,
        additive
          ? `${columnLabel(pieMetric.column)}属于可累加指标，适合按分类求和后展示占比。`
          : `${columnLabel(pieMetric.column)}为非负指标；饼图按分类求和，适合数量、得分这类可累加的数据。`
      ],
      trendline: false
    })
  }

  const scatterItems = metricColumns.filter((item) => item.column.id !== timeColumn?.id)
  let bestPair = null
  for (let i = 0; i < scatterItems.length; i += 1) {
    for (let j = i + 1; j < scatterItems.length; j += 1) {
      const correlation = pearsonCorrelation(rows, scatterItems[i].column, scatterItems[j].column)
      if (!correlation) continue
      const score = Math.abs(correlation.r) + (correlation.n >= 5 ? 0.02 : 0)
      if (!bestPair || score > bestPair.score) {
        bestPair = { ...correlation, a: scatterItems[i], b: scatterItems[j], score }
      }
    }
  }
  if (bestPair) {
    const absR = Math.abs(bestPair.r)
    const strength = absR >= 0.75 ? '强相关' : absR >= 0.4 ? '中等相关' : '弱相关'
    const confidence = Math.min(0.95, 0.62 + absR * 0.33 + (bestPair.n >= 5 ? 0.02 : 0))
    candidates.push({
      key: `scatter-${bestPair.a.column.id}-${bestPair.b.column.id}`,
      type: 'scatter',
      xColumnId: bestPair.a.column.id,
      yColumnIds: [bestPair.b.column.id],
      confidence,
      title: `散点图 · ${strength}关系`,
      reasons: [
        `${columnLabel(bestPair.a.column)}与${columnLabel(bestPair.b.column)}的相关系数 r = ${fmt(bestPair.r)}（n = ${bestPair.n}），呈${bestPair.r < 0 ? '负' : '正'}相关。`,
        absR >= 0.4
          ? '应用后会叠加最小二乘趋势线并显示方程与 R²，便于验证关系。'
          : '相关性偏弱，散点图仍有助于观察数据分布与离群点。'
      ],
      trendline: true
    })
  }

  const suggestions = pickDiverse(candidates, 3)
  return {
    suggestions,
    hint:
      suggestions.length === 0
        ? '当前只有数值列，暂时没有可对比的分类或时间维度。添加「组别」这类分类列或日期列后再试。'
        : ''
  }
}
