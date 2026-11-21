export const CHART_TYPES = [
  { value: 'line', label: '折线图' },
  { value: 'bar', label: '柱状图' },
  { value: 'scatter', label: '散点图' }
]

export function chartTypeLabel(type) {
  return CHART_TYPES.find((item) => item.value === type)?.label || '图表'
}
