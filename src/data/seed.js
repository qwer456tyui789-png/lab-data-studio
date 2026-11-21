import { uid } from '../lib/id'

function column(name, type, formula = null) {
  return { id: uid('col'), name, type, formula }
}

function row(cells) {
  return { id: uid('row'), cells }
}

export function createSeedState() {
  const group = column('组别', 'text')
  const mass = column('砝码质量(g)', 'number')
  const extension = column('弹簧伸长量(cm)', 'number')
  const hooke = {
    id: uid('ds'),
    name: '胡克定律：质量-伸长量',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    columns: [group, mass, extension],
    rows: [
      row({ [group.id]: 'A组', [mass.id]: '50', [extension.id]: '1.2' }),
      row({ [group.id]: 'A组', [mass.id]: '100', [extension.id]: '2.4' }),
      row({ [group.id]: 'A组', [mass.id]: '150', [extension.id]: '3.6' }),
      row({ [group.id]: 'A组', [mass.id]: '200', [extension.id]: '4.9' }),
      row({ [group.id]: 'B组', [mass.id]: '50', [extension.id]: '1.1' }),
      row({ [group.id]: 'B组', [mass.id]: '100', [extension.id]: '2.3' }),
      row({ [group.id]: 'B组', [mass.id]: '150', [extension.id]: '3.7' }),
      row({ [group.id]: 'B组', [mass.id]: '200', [extension.id]: '4.8' })
    ]
  }

  const fallGroup = column('组别', 'text')
  const time = column('下落时间(s)', 'number')
  const height = column('下落高度(m)', 'number')
  const gravity = column('重力加速度g(m/s²)', 'number', 'round(2*[下落高度(m)]/[下落时间(s)]^2, 2)')
  const freeFall = {
    id: uid('ds'),
    name: '自由落体测重力加速度',
    createdAt: Date.now(),
    updatedAt: Date.now(),
    columns: [fallGroup, time, height, gravity],
    rows: [
      row({ [fallGroup.id]: 'A组', [time.id]: '0.45', [height.id]: '1.00', [gravity.id]: '' }),
      row({ [fallGroup.id]: 'A组', [time.id]: '0.64', [height.id]: '2.00', [gravity.id]: '' }),
      row({ [fallGroup.id]: 'B组', [time.id]: '0.55', [height.id]: '1.50', [gravity.id]: '' }),
      row({ [fallGroup.id]: 'B组', [time.id]: '0.71', [height.id]: '2.50', [gravity.id]: '' }),
      row({ [fallGroup.id]: 'C组', [time.id]: '0.78', [height.id]: '3.00', [gravity.id]: '' }),
      row({ [fallGroup.id]: 'C组', [time.id]: '0.90', [height.id]: '4.00', [gravity.id]: '' })
    ]
  }

  const hookeChart = {
    id: uid('chart'),
    name: '弹簧伸长量与砝码质量',
    datasetId: hooke.id,
    type: 'scatter',
    xColumnId: mass.id,
    yColumnIds: [extension.id],
    style: { title: '弹簧伸长量与砝码质量', showLegend: true },
    trendline: { enabled: true }
  }

  const gravityChart = {
    id: uid('chart'),
    name: '各组重力加速度对比',
    datasetId: freeFall.id,
    type: 'bar',
    xColumnId: fallGroup.id,
    yColumnIds: [gravity.id],
    style: { title: '各组重力加速度对比', showLegend: true },
    trendline: { enabled: false }
  }

  const fallChart = {
    id: uid('chart'),
    name: '下落时间与下落高度',
    datasetId: freeFall.id,
    type: 'scatter',
    xColumnId: time.id,
    yColumnIds: [height.id],
    style: { title: '下落时间与下落高度', showLegend: true },
    trendline: { enabled: true }
  }

  return {
    version: 1,
    datasets: [hooke, freeFall],
    charts: [hookeChart, gravityChart, fallChart],
    dashboard: {
      chartIds: [gravityChart.id, fallChart.id],
      linkageColumnName: fallGroup.name,
      filterValue: null
    },
    ui: {
      activeTab: 'data',
      activeDatasetId: hooke.id,
      activeChartId: hookeChart.id
    }
  }
}
