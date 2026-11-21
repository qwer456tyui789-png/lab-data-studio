export function stripBOM(text) {
  return text.charCodeAt(0) === 0xfeff ? text.slice(1) : text
}

/**
 * RFC4180 子集解析：支持引号包裹的逗号 / 换行、双引号转义、CRLF 与 LF。
 */
export function parseDelimited(text, delimiter = ',') {
  const source = stripBOM(String(text ?? ''))
  const rows = []
  let row = []
  let field = ''
  let inQuotes = false
  let i = 0

  while (i < source.length) {
    const ch = source[i]
    if (inQuotes) {
      if (ch === '"') {
        if (source[i + 1] === '"') {
          field += '"'
          i += 2
          continue
        }
        inQuotes = false
        i += 1
        continue
      }
      field += ch
      i += 1
      continue
    }
    if (ch === '"') {
      inQuotes = true
      i += 1
      continue
    }
    if (ch === delimiter) {
      row.push(field)
      field = ''
      i += 1
      continue
    }
    if (ch === '\r') {
      if (source[i + 1] === '\n') i += 1
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }
    if (ch === '\n') {
      row.push(field)
      rows.push(row)
      row = []
      field = ''
      i += 1
      continue
    }
    field += ch
    i += 1
  }

  if (field !== '' || row.length > 0) {
    row.push(field)
    rows.push(row)
  }

  while (rows.length > 0 && rows[rows.length - 1].every((cell) => cell.trim() === '')) {
    rows.pop()
  }
  return rows
}

export function parseCSV(text) {
  return parseDelimited(text, ',')
}

export function parseTSV(text) {
  return parseDelimited(text, '\t')
}

function escapeField(value) {
  const text = String(value ?? '')
  if (/[",\r\n]/.test(text)) return `"${text.replace(/"/g, '""')}"`
  return text
}

export function serializeCSV(matrix, { bom = true } = {}) {
  const body = (matrix || []).map((row) => row.map(escapeField).join(',')).join('\r\n')
  return (bom ? '﻿' : '') + body
}

export function isNumericText(value) {
  const text = String(value ?? '').trim()
  return text !== '' && Number.isFinite(Number(text))
}

export function isDateText(value) {
  const text = String(value ?? '').trim()
  if (!/^\d{4}-\d{2}-\d{2}$/.test(text)) return false
  const date = new Date(`${text}T00:00:00`)
  return !Number.isNaN(date.getTime())
}

export function inferColumnType(values) {
  const filled = (values || []).map((value) => String(value ?? '').trim()).filter((value) => value !== '')
  if (filled.length === 0) return 'text'
  if (filled.every(isNumericText)) return 'number'
  if (filled.every(isDateText)) return 'date'
  return 'text'
}

export function normalizeMatrix(matrix) {
  const width = Math.max(0, ...matrix.map((row) => row.length))
  return matrix.map((row) => {
    const copy = row.slice()
    while (copy.length < width) copy.push('')
    return copy
  })
}
