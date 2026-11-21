export function linearRegression(points) {
  const valid = (points || []).filter(
    (point) => point && Number.isFinite(point.x) && Number.isFinite(point.y)
  )
  const n = valid.length
  if (n < 2) return null

  let sumX = 0
  let sumY = 0
  for (const point of valid) {
    sumX += point.x
    sumY += point.y
  }
  const meanX = sumX / n
  const meanY = sumY / n

  let sxx = 0
  let sxy = 0
  let syy = 0
  for (const point of valid) {
    const dx = point.x - meanX
    const dy = point.y - meanY
    sxx += dx * dx
    sxy += dx * dy
    syy += dy * dy
  }

  if (sxx === 0) return null

  const slope = sxy / sxx
  const intercept = meanY - slope * meanX

  let ssRes = 0
  for (const point of valid) {
    const predicted = intercept + slope * point.x
    ssRes += (point.y - predicted) ** 2
  }
  const r2 = syy === 0 ? 1 : Math.max(0, Math.min(1, 1 - ssRes / syy))

  return { intercept, slope, r2, n }
}

function formatCoefficient(value) {
  if (!Number.isFinite(value)) return '0'
  if (value !== 0 && (Math.abs(value) < 1e-4 || Math.abs(value) >= 1e6)) {
    return value.toExponential(3)
  }
  const rounded = Number(value.toFixed(4))
  return String(rounded)
}

export function formatEquation(regression) {
  if (!regression) return ''
  const { intercept, slope } = regression
  const sign = intercept < 0 ? '-' : '+'
  return `y = ${formatCoefficient(slope)}x ${sign} ${formatCoefficient(Math.abs(intercept))}`
}

export function formatR2(r2) {
  return Number(r2).toFixed(4)
}

export function describeTrend(regression) {
  if (!regression) return ''
  return `${formatEquation(regression)}，R² = ${formatR2(regression.r2)}（n=${regression.n}）`
}

export function distinctValues(rows, column) {
  const seen = new Set()
  const values = []
  for (const row of rows || []) {
    const raw = row.values?.[column.id]
    const text = raw == null ? '' : String(raw).trim()
    if (text === '' || seen.has(text)) continue
    seen.add(text)
    values.push(text)
  }
  return values
}

export function numericValues(rows, column) {
  const out = []
  for (const row of rows || []) {
    const value = row.values?.[column.id]
    if (Number.isFinite(value)) out.push(value)
  }
  return out
}

export function isMonotonic(values) {
  if (values.length < 3) return false
  let increasing = true
  let decreasing = true
  for (let i = 1; i < values.length; i += 1) {
    if (values[i] <= values[i - 1]) increasing = false
    if (values[i] >= values[i - 1]) decreasing = false
    if (!increasing && !decreasing) return false
  }
  return increasing || decreasing
}
