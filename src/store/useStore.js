import { reactive, watch } from 'vue'
import { loadState, saveState } from '../storage/db'
import { createSeedState } from '../data/seed'
import { uid } from '../lib/id'
import { DEFAULT_STYLE } from '../lib/chartOptions'
import { inferColumnType } from '../lib/csv'

const defaultDashboard = () => ({
  chartIds: [],
  linkageColumnName: null,
  filterValue: null
})

const defaultUi = () => ({
  activeTab: 'data',
  activeDatasetId: null,
  activeChartId: null
})

export const store = reactive({
  loaded: false,
  saveStatus: 'saved',
  datasets: [],
  charts: [],
  dashboard: defaultDashboard(),
  ui: defaultUi()
})

let started = false
let saveTimer = null
let saveSequence = 0

function scheduleSave() {
  if (!store.loaded) return
  store.saveStatus = 'saving'
  clearTimeout(saveTimer)
  saveTimer = setTimeout(async () => {
    const sequence = ++saveSequence
    const snapshot = JSON.parse(
      JSON.stringify({
        version: 1,
        datasets: store.datasets,
        charts: store.charts,
        dashboard: store.dashboard,
        ui: store.ui
      })
    )
    try {
      await saveState(snapshot)
      if (sequence === saveSequence) store.saveStatus = 'saved'
    } catch (error) {
      console.error('[store] 保存失败', error)
      if (sequence === saveSequence) store.saveStatus = 'error'
    }
  }, 320)
}

export async function initStore() {
  if (started) return
  started = true
  let saved = null
  try {
    saved = await loadState()
  } catch {
    saved = null
  }
  const next =
    saved && saved.version === 1 && Array.isArray(saved.datasets) ? saved : createSeedState()

  store.datasets = next.datasets || []
  store.charts = next.charts || []
  store.dashboard = { ...defaultDashboard(), ...(next.dashboard || {}) }
  store.ui = { ...defaultUi(), ...(next.ui || {}) }
  migrateDashboard()
  normalizeSelection()
  store.loaded = true

  watch(
    [() => store.datasets, () => store.charts, () => store.dashboard, () => store.ui],
    () => scheduleSave(),
    { deep: true }
  )

  if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) {
        clearTimeout(saveTimer)
        saveTimer = null
        scheduleSave()
      }
    })
  }
}

function normalizeSelection() {
  let dataset = store.datasets.find((item) => item.id === store.ui.activeDatasetId)
  if (!dataset && store.datasets.length > 0) {
    dataset = store.datasets[0]
    store.ui.activeDatasetId = dataset.id
  }
  if (!dataset) {
    store.ui.activeDatasetId = null
    store.ui.activeChartId = null
  } else {
    const chart = store.charts.find(
      (item) => item.id === store.ui.activeChartId && item.datasetId === dataset.id
    )
    if (!chart) {
      const first = store.charts.find((item) => item.datasetId === dataset.id)
      store.ui.activeChartId = first?.id ?? null
    }
  }

  normalizeDashboard()
}

function migrateDashboard() {
  const dash = store.dashboard
  if (dash.linkageColumnName === undefined) dash.linkageColumnName = null
  if (dash.datasetId !== undefined || dash.linkageColumnId !== undefined) {
    const legacyDataset = store.datasets.find((item) => item.id === dash.datasetId)
    if (!dash.linkageColumnName) {
      const legacyColumn = legacyDataset?.columns.find((item) => item.id === dash.linkageColumnId)
      dash.linkageColumnName = legacyColumn?.name ?? null
    }
    delete dash.datasetId
    delete dash.linkageColumnId
  }
}

function normalizeDashboard() {
  const chartIds = new Set(store.charts.map((chart) => chart.id))
  store.dashboard.chartIds = (store.dashboard.chartIds || [])
    .filter((id) => chartIds.has(id))
    .slice(0, 4)
  normalizeDashboardLinkage()
}

function normalizeDashboardLinkage() {
  const names = getDashboardLinkageNames()
  if (!names.some((item) => item.name === store.dashboard.linkageColumnName)) {
    store.dashboard.linkageColumnName = names[0]?.name ?? null
    store.dashboard.filterValue = null
  }
}

function findDataset(id) {
  return store.datasets.find((item) => item.id === id) || null
}

function touch(dataset) {
  dataset.updatedAt = Date.now()
}

function uniqueDatasetName(base) {
  const used = new Set(store.datasets.map((item) => item.name))
  const name = String(base || '新数据集').trim() || '新数据集'
  if (!used.has(name)) return name
  let index = 2
  while (used.has(`${name} (${index})`)) index += 1
  return `${name} (${index})`
}

function nextChartName(datasetId) {
  const used = new Set(
    store.charts.filter((chart) => chart.datasetId === datasetId).map((chart) => chart.name)
  )
  let index = 1
  while (used.has(`图表 ${index}`)) index += 1
  return `图表 ${index}`
}

function makeEmptyRow(columns) {
  const cells = {}
  for (const column of columns) cells[column.id] = ''
  return { id: uid('row'), cells }
}

export function createDataset(name = '新数据集', options = {}) {
  const columns = options.columns?.length
    ? options.columns
    : [
        { id: uid('col'), name: '名称', type: 'text', formula: null },
        { id: uid('col'), name: '数值', type: 'number', formula: null }
      ]
  const rows = options.rows?.length
    ? options.rows
    : Array.from({ length: 5 }, () => makeEmptyRow(columns))
  const dataset = {
    id: uid('ds'),
    name: uniqueDatasetName(name),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    columns,
    rows
  }
  store.datasets.push(dataset)
  store.ui.activeDatasetId = dataset.id
  store.ui.activeChartId = null
  store.ui.activeTab = 'data'
  return dataset
}

export function duplicateDataset(datasetId) {
  const source = findDataset(datasetId)
  if (!source) return null
  const columnMap = new Map()
  const columns = source.columns.map((column) => {
    const next = { ...column, id: uid('col') }
    columnMap.set(column.id, next.id)
    return next
  })
  const rows = source.rows.map((row) => {
    const cells = {}
    for (const column of source.columns) {
      cells[columnMap.get(column.id)] = row.cells?.[column.id] ?? ''
    }
    return { id: uid('row'), cells }
  })
  const copy = {
    id: uid('ds'),
    name: uniqueDatasetName(`${source.name} 副本`),
    createdAt: Date.now(),
    updatedAt: Date.now(),
    columns,
    rows
  }
  const index = store.datasets.findIndex((item) => item.id === datasetId)
  store.datasets.splice(index + 1, 0, copy)
  store.ui.activeDatasetId = copy.id
  store.ui.activeChartId = null
  return copy
}

export function renameDataset(datasetId, name) {
  const dataset = findDataset(datasetId)
  if (!dataset) return
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('数据集名称不能为空')
  const duplicate = store.datasets.some(
    (item) => item.id !== datasetId && item.name.trim() === trimmed
  )
  if (duplicate) throw new Error('已存在同名数据集')
  dataset.name = trimmed
  touch(dataset)
}

export function deleteDataset(datasetId) {
  const index = store.datasets.findIndex((item) => item.id === datasetId)
  if (index === -1) return
  store.datasets.splice(index, 1)
  store.charts = store.charts.filter((chart) => chart.datasetId !== datasetId)
  store.dashboard.filterValue = null
  normalizeSelection()
}

export function addColumn(datasetId, { name, type = 'text', formula = null }) {
  const dataset = findDataset(datasetId)
  if (!dataset) throw new Error('数据集不存在')
  const trimmed = String(name || '').trim()
  if (!trimmed) throw new Error('列名不能为空')
  if (dataset.columns.some((column) => column.name.trim() === trimmed)) {
    throw new Error(`列名「${trimmed}」已存在`)
  }
  if (formula && type !== 'number') throw new Error('公式列必须是数值类型')
  const column = {
    id: uid('col'),
    name: trimmed,
    type,
    formula: formula || null
  }
  dataset.columns.push(column)
  for (const row of dataset.rows) row.cells[column.id] = ''
  touch(dataset)
  return column
}

export function updateColumn(datasetId, columnId, patch) {
  const dataset = findDataset(datasetId)
  if (!dataset) throw new Error('数据集不存在')
  const column = dataset.columns.find((item) => item.id === columnId)
  if (!column) throw new Error('列不存在')

  if (patch.name !== undefined) {
    const trimmed = String(patch.name).trim()
    if (!trimmed) throw new Error('列名不能为空')
    if (
      dataset.columns.some((item) => item.id !== columnId && item.name.trim() === trimmed)
    ) {
      throw new Error(`列名「${trimmed}」已存在`)
    }
    const previous = column.name
    column.name = trimmed
    if (previous !== trimmed) {
      const escaped = previous.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
      const pattern = new RegExp(`\\[\\s*${escaped}\\s*\\]`, 'g')
      for (const item of dataset.columns) {
        if (item.formula) item.formula = item.formula.replace(pattern, `[${trimmed}]`)
      }
      if (store.dashboard.linkageColumnName === previous) {
        store.dashboard.linkageColumnName = trimmed
      }
    }
  }
  if (patch.type !== undefined) column.type = patch.type
  if (patch.formula !== undefined) column.formula = patch.formula || null
  touch(dataset)
}

export function deleteColumn(datasetId, columnId) {
  const dataset = findDataset(datasetId)
  if (!dataset) return
  const index = dataset.columns.findIndex((column) => column.id === columnId)
  if (index === -1) return
  dataset.columns.splice(index, 1)
  for (const row of dataset.rows) delete row.cells[columnId]

  for (const chart of store.charts) {
    if (chart.datasetId !== datasetId) continue
    if (chart.xColumnId === columnId) {
      chart.xColumnId = dataset.columns[0]?.id ?? null
    }
    chart.yColumnIds = (chart.yColumnIds || []).filter((id) => id !== columnId)
    if (chart.yColumnIds.length === 0) {
      const numeric = dataset.columns.find((column) => column.type === 'number')
      if (numeric) chart.yColumnIds = [numeric.id]
    }
  }

  if (store.dashboard.linkageColumnName === column.name) {
    store.dashboard.filterValue = null
    normalizeDashboardLinkage()
  }
  touch(dataset)
}

export function addRows(datasetId, count = 1) {
  const dataset = findDataset(datasetId)
  if (!dataset) return
  for (let i = 0; i < count; i += 1) dataset.rows.push(makeEmptyRow(dataset.columns))
  touch(dataset)
}

export function deleteRow(datasetId, rowId) {
  const dataset = findDataset(datasetId)
  if (!dataset) return
  const index = dataset.rows.findIndex((row) => row.id === rowId)
  if (index === -1) return
  dataset.rows.splice(index, 1)
  touch(dataset)
}

export function setCell(datasetId, rowId, columnId, value) {
  const dataset = findDataset(datasetId)
  if (!dataset) return
  const row = dataset.rows.find((item) => item.id === rowId)
  if (!row) return
  row.cells[columnId] = value
  touch(dataset)
}

/**
 * 从 startRow/startColumn 开始粘贴一个二维块（Excel 剪贴板）。
 * 自动补足行、按需新增列，并在粘贴内容首行与表头一致时跳过该行。
 */
export function pasteBlock(datasetId, startRowIndex, startColumnIndex, matrix) {
  const dataset = findDataset(datasetId)
  if (!dataset || !matrix?.length) return { rowsAdded: 0, columnsAdded: 0 }

  const width = Math.max(...matrix.map((row) => row.length))
  let block = matrix.map((row) => {
    const copy = row.slice()
    while (copy.length < width) copy.push('')
    return copy
  })

  const headerLike =
    width >= 2 &&
    block[0].every((cell, index) => {
      const target = dataset.columns[startColumnIndex + index]
      return target && String(cell).trim() === target.name
    })
  if (headerLike) block = block.slice(1)
  if (block.length === 0) return { rowsAdded: 0, columnsAdded: 0 }

  const defaultColumns = [
    { id: uid('col'), name: '名称', type: 'text', formula: null },
    { id: uid('col'), name: '数值', type: 'number', formula: null }
  ]
  if (dataset.columns.length === 0) dataset.columns.push(...defaultColumns)

  let columnsAdded = 0
  const neededColumns = startColumnIndex + width
  while (dataset.columns.length < neededColumns) {
    const columnIndex = dataset.columns.length
    const samples = block.map((row) => row[columnIndex - startColumnIndex] ?? '')
    let name = `列${columnIndex + 1}`
    let suffix = 2
    while (dataset.columns.some((column) => column.name.trim() === name)) {
      name = `列${columnIndex + 1}_${suffix}`
      suffix += 1
    }
    dataset.columns.push({
      id: uid('col'),
      name,
      type: inferColumnType(samples),
      formula: null
    })
    columnsAdded += 1
  }

  let rowsAdded = 0
  while (dataset.rows.length < startRowIndex + block.length) {
    dataset.rows.push(makeEmptyRow(dataset.columns))
    rowsAdded += 1
  }

  block.forEach((rowValues, rowOffset) => {
    const row = dataset.rows[startRowIndex + rowOffset]
    rowValues.forEach((value, columnOffset) => {
      const column = dataset.columns[startColumnIndex + columnOffset]
      if (!column || column.formula) return
      row.cells[column.id] = value
    })
  })

  touch(dataset)
  return { rowsAdded, columnsAdded }
}

export function createChart(datasetId, overrides = {}) {
  const dataset = findDataset(datasetId)
  if (!dataset) return null
  const numeric = dataset.columns.filter((column) => column.type === 'number')
  const xColumn =
    dataset.columns.find((column) => column.id === overrides.xColumnId) ||
    dataset.columns.find((column) => column.type === 'text') ||
    dataset.columns.find((column) => column.type === 'date') ||
    dataset.columns[0] ||
    null
  const yColumnIds =
    overrides.yColumnIds?.filter((id) => dataset.columns.some((column) => column.id === id)) ||
    []
  const fallbackY = yColumnIds.length ? yColumnIds : numeric.slice(0, 1).map((column) => column.id)

  const chart = {
    id: uid('chart'),
    name: overrides.name || nextChartName(datasetId),
    datasetId,
    type: overrides.type || 'line',
    xColumnId: xColumn?.id ?? null,
    yColumnIds: fallbackY,
    style: {
      ...DEFAULT_STYLE,
      palette: [...DEFAULT_STYLE.palette],
      seriesColors: {},
      ...(overrides.style || {})
    },
    trendline: { enabled: Boolean(overrides.trendline) }
  }
  store.charts.push(chart)
  store.ui.activeDatasetId = datasetId
  store.ui.activeChartId = chart.id
  return chart
}

export function updateChart(chartId, patch) {
  const chart = store.charts.find((item) => item.id === chartId)
  if (!chart) return
  Object.assign(chart, patch)
}

export function deleteChart(chartId) {
  const index = store.charts.findIndex((item) => item.id === chartId)
  if (index === -1) return
  store.charts.splice(index, 1)
  store.dashboard.chartIds = (store.dashboard.chartIds || []).filter((id) => id !== chartId)
  store.dashboard.filterValue = null
  normalizeDashboardLinkage()
  if (store.ui.activeChartId === chartId) {
    const next = store.charts.find((chart) => chart.datasetId === store.ui.activeDatasetId)
    store.ui.activeChartId = next?.id ?? null
  }
}

export function setActiveTab(tab) {
  store.ui.activeTab = tab
}

export function selectDataset(datasetId) {
  const dataset = findDataset(datasetId)
  if (!dataset) return
  store.ui.activeDatasetId = datasetId
  const chart = store.charts.find((item) => item.datasetId === datasetId)
  store.ui.activeChartId = chart?.id ?? null
}

export function selectChart(chartId) {
  const chart = store.charts.find((item) => item.id === chartId)
  if (!chart) return
  store.ui.activeChartId = chart.id
  store.ui.activeDatasetId = chart.datasetId
}

export function setLinkageColumnName(name) {
  store.dashboard.linkageColumnName = name || null
  store.dashboard.filterValue = null
}

export function addDashboardChart(chartId) {
  const chart = store.charts.find((item) => item.id === chartId)
  if (!chart) return { ok: false, message: '图表不存在' }
  if (store.dashboard.chartIds.includes(chartId)) {
    return { ok: false, message: '该图表已在看板中' }
  }
  if (store.dashboard.chartIds.length >= 4) {
    return { ok: false, message: '看板最多放置 4 个图表' }
  }
  store.dashboard.chartIds.push(chartId)
  if (!store.dashboard.linkageColumnName) {
    store.dashboard.linkageColumnName = getDashboardLinkageNames()[0]?.name ?? null
  }
  return { ok: true }
}

export function removeDashboardChart(chartId) {
  store.dashboard.chartIds = store.dashboard.chartIds.filter((id) => id !== chartId)
  store.dashboard.filterValue = null
  normalizeDashboardLinkage()
}

export function setDashboardFilter(value) {
  store.dashboard.filterValue = value == null ? null : String(value)
}

export function getDataset(datasetId) {
  return findDataset(datasetId)
}

export function chartsOf(datasetId) {
  return store.charts.filter((chart) => chart.datasetId === datasetId)
}

export function getActiveDataset() {
  return findDataset(store.ui.activeDatasetId)
}

export function getActiveChart() {
  return store.charts.find((chart) => chart.id === store.ui.activeChartId) || null
}

export function getDashboardCharts() {
  return (store.dashboard.chartIds || [])
    .map((id) => store.charts.find((chart) => chart.id === id))
    .filter(Boolean)
}

/**
 * 看板内各图表所属数据集里出现过的分类列名（按覆盖数据集数量降序）。
 * 联动以列名为准，这样不同数据集中的同名列可以互相对齐筛选。
 */
export function getDashboardLinkageNames() {
  const entries = new Map()
  for (const chart of getDashboardCharts()) {
    const dataset = findDataset(chart.datasetId)
    if (!dataset) continue
    for (const column of dataset.columns) {
      if (column.type === 'number') continue
      const entry = entries.get(column.name) || { name: column.name, datasetIds: new Set() }
      entry.datasetIds.add(dataset.id)
      entries.set(column.name, entry)
    }
  }
  return [...entries.values()]
    .sort((a, b) => b.datasetIds.size - a.datasetIds.size)
    .map((entry) => ({ name: entry.name, datasetCount: entry.datasetIds.size }))
}

export function linkageColumnOf(dataset, name) {
  if (!dataset || !name) return null
  return (
    dataset.columns.find((column) => column.name === name && column.type !== 'number') || null
  )
}
