/**
 * 公式引擎：词法分析 → Pratt 解析 → 受控求值 → 依赖拓扑排序。
 * 不依赖 eval / new Function，表达式无法访问宿主环境。
 * 语法示例：round(2*[下落高度(m)]/[下落时间(s)]^2, 2)、avg([质量]) + 0.5
 */

export class FormulaError extends Error {
  constructor(code, message) {
    super(message || code)
    this.name = 'FormulaError'
    this.code = code
  }
}

const FUNCTIONS = {
  abs: { min: 1, max: 1 },
  sqrt: { min: 1, max: 1 },
  round: { min: 1, max: 2 },
  avg: { min: 1, max: Infinity },
  sum: { min: 1, max: Infinity },
  min: { min: 1, max: Infinity },
  max: { min: 1, max: Infinity }
}

const AGGREGATES = new Set(['avg', 'sum', 'min', 'max'])

const BINDING_POWER = {
  '+': { left: 10, right: 11 },
  '-': { left: 10, right: 11 },
  '*': { left: 20, right: 21 },
  '/': { left: 20, right: 21 },
  '^': { left: 40, right: 40 }
}

const UNARY_BP = 30

function tokenize(source) {
  const tokens = []
  let i = 0
  while (i < source.length) {
    const ch = source[i]
    if (/\s/.test(ch)) {
      i += 1
      continue
    }
    if (/[0-9.]/.test(ch)) {
      let j = i
      while (j < source.length && /[0-9.]/.test(source[j])) j += 1
      const text = source.slice(i, j)
      const value = Number(text)
      if (text === '.' || !Number.isFinite(value)) {
        throw new FormulaError('SYNTAX', `无法识别的数字「${text}」`)
      }
      tokens.push({ type: 'number', value })
      i = j
      continue
    }
    if (ch === '[') {
      const end = source.indexOf(']', i + 1)
      if (end === -1) throw new FormulaError('SYNTAX', '缺少右方括号 ]')
      const name = source.slice(i + 1, end).trim()
      if (!name) throw new FormulaError('SYNTAX', '列名不能为空')
      tokens.push({ type: 'ref', name })
      i = end + 1
      continue
    }
    if (/[A-Za-z_]/.test(ch)) {
      let j = i
      while (j < source.length && /[A-Za-z0-9_]/.test(source[j])) j += 1
      tokens.push({ type: 'ident', value: source.slice(i, j) })
      i = j
      continue
    }
    if ('+-*/^(),'.includes(ch)) {
      tokens.push({ type: 'op', value: ch })
      i += 1
      continue
    }
    throw new FormulaError('SYNTAX', `无法识别的字符「${ch}」`)
  }
  tokens.push({ type: 'eof' })
  return tokens
}

class Parser {
  constructor(tokens) {
    this.tokens = tokens
    this.pos = 0
  }

  peek(offset = 0) {
    return this.tokens[Math.min(this.pos + offset, this.tokens.length - 1)]
  }

  next() {
    return this.tokens[this.pos++]
  }

  expectOp(value) {
    const token = this.peek()
    if (token.type !== 'op' || token.value !== value) {
      throw new FormulaError('SYNTAX', `缺少「${value}」`)
    }
    return this.next()
  }

  parse() {
    if (this.peek().type === 'eof') throw new FormulaError('SYNTAX', '公式不能为空')
    const node = this.parseExpression(0)
    const token = this.peek()
    if (token.type !== 'eof') {
      throw new FormulaError('SYNTAX', `多余的内容「${token.value ?? token.name ?? ''}」`)
    }
    return node
  }

  parseExpression(minBp) {
    let left = this.parsePrefix()
    for (;;) {
      const token = this.peek()
      if (token.type !== 'op') break
      const bp = BINDING_POWER[token.value]
      if (!bp || bp.left < minBp) break
      this.next()
      const right = this.parseExpression(bp.right)
      left = { type: 'binary', op: token.value, left, right }
    }
    return left
  }

  parsePrefix() {
    const token = this.next()
    if (token.type === 'number') return { type: 'number', value: token.value }
    if (token.type === 'ref') return { type: 'ref', name: token.name }
    if (token.type === 'op' && token.value === '-') {
      return { type: 'unary', op: '-', arg: this.parseExpression(UNARY_BP) }
    }
    if (token.type === 'op' && token.value === '+') {
      return this.parseExpression(UNARY_BP)
    }
    if (token.type === 'op' && token.value === '(') {
      const node = this.parseExpression(0)
      this.expectOp(')')
      return node
    }
    if (token.type === 'ident') {
      const name = token.value.toLowerCase()
      const spec = FUNCTIONS[name]
      if (!spec) throw new FormulaError('SYNTAX', `未知函数「${token.value}」`)
      this.expectOp('(')
      const args = []
      if (!(this.peek().type === 'op' && this.peek().value === ')')) {
        for (;;) {
          args.push(this.parseExpression(0))
          const t = this.peek()
          if (t.type === 'op' && t.value === ',') {
            this.next()
            continue
          }
          break
        }
      }
      this.expectOp(')')
      if (args.length < spec.min || args.length > spec.max) {
        throw new FormulaError('SYNTAX', `函数 ${name} 的参数个数不正确`)
      }
      return { type: 'call', name, args }
    }
    if (token.type === 'eof') throw new FormulaError('SYNTAX', '公式不完整')
    throw new FormulaError('SYNTAX', `无法识别的符号「${token.value ?? token.name ?? ''}」`)
  }
}

export function parseFormula(source) {
  if (typeof source !== 'string' || !source.trim()) {
    throw new FormulaError('SYNTAX', '公式不能为空')
  }
  return new Parser(tokenize(source)).parse()
}

export function collectRefs(node, out = new Set()) {
  if (!node) return out
  if (node.type === 'ref') out.add(node.name)
  if (node.type === 'unary') collectRefs(node.arg, out)
  if (node.type === 'binary') {
    collectRefs(node.left, out)
    collectRefs(node.right, out)
  }
  if (node.type === 'call') node.args.forEach((arg) => collectRefs(arg, out))
  return out
}

function ensureFinite(value) {
  if (!Number.isFinite(value)) throw new FormulaError('VALUE', '计算结果不是有效数字')
  return value
}

function toNumber(raw) {
  if (raw == null) return null
  const text = String(raw).trim()
  if (text === '') return null
  const value = Number(text)
  return Number.isFinite(value) ? value : null
}

function evaluateNode(node, ctx, rowIndex) {
  switch (node.type) {
    case 'number':
      return node.value
    case 'ref':
      return ctx.getRef(node.name, rowIndex)
    case 'unary':
      return -ensureFinite(evaluateNode(node.arg, ctx, rowIndex))
    case 'binary': {
      const left = evaluateNode(node.left, ctx, rowIndex)
      const right = evaluateNode(node.right, ctx, rowIndex)
      switch (node.op) {
        case '+':
          return ensureFinite(left + right)
        case '-':
          return ensureFinite(left - right)
        case '*':
          return ensureFinite(left * right)
        case '/':
          if (right === 0) throw new FormulaError('DIV0', '除数为 0')
          return ensureFinite(left / right)
        case '^':
          return ensureFinite(Math.pow(left, right))
        default:
          throw new FormulaError('SYNTAX', `未知运算符「${node.op}」`)
      }
    }
    case 'call':
      return evaluateCall(node, ctx, rowIndex)
    default:
      throw new FormulaError('SYNTAX', '公式结构无效')
  }
}

function evaluateCall(node, ctx, rowIndex) {
  const name = node.name
  if (AGGREGATES.has(name)) {
    const values = []
    for (const arg of node.args) {
      if (arg.type === 'ref') {
        values.push(...ctx.getColumnNumbers(arg.name))
      } else {
        values.push(evaluateNode(arg, ctx, rowIndex))
      }
    }
    if (values.length === 0) {
      if (name === 'sum') return 0
      throw new FormulaError('VALUE', '聚合函数没有可用数值')
    }
    if (name === 'avg') return ensureFinite(values.reduce((a, b) => a + b, 0) / values.length)
    if (name === 'sum') return ensureFinite(values.reduce((a, b) => a + b, 0))
    if (name === 'min') return Math.min(...values)
    return Math.max(...values)
  }

  const args = node.args.map((arg) => evaluateNode(arg, ctx, rowIndex))
  if (name === 'abs') return ensureFinite(Math.abs(args[0]))
  if (name === 'sqrt') {
    if (args[0] < 0) throw new FormulaError('VALUE', 'sqrt 的参数不能为负数')
    return ensureFinite(Math.sqrt(args[0]))
  }
  if (name === 'round') {
    const digits = args.length > 1 ? Math.trunc(args[1]) : 0
    const clamped = Math.max(0, Math.min(10, digits))
    return ensureFinite(Number(args[0].toFixed(clamped)))
  }
  throw new FormulaError('SYNTAX', `未知函数「${name}」`)
}

/**
 * 只做语法与引用存在性校验，供创建/编辑公式列时使用。
 */
export function validateFormula(source, columns, selfName = null) {
  const ast = parseFormula(source)
  const names = new Set(columns.map((column) => column.name.trim()))
  for (const ref of collectRefs(ast)) {
    if (!names.has(ref)) throw new FormulaError('REF', `列「${ref}」不存在`)
    if (selfName && ref === selfName) throw new FormulaError('CYCLE', '公式不能引用自身')
  }
  return ast
}

function buildColumnIndex(columns) {
  const index = new Map()
  for (const column of columns) {
    const name = column.name.trim()
    if (!index.has(name)) index.set(name, column)
  }
  return index
}

function analyzeFormulas(columns) {
  const index = buildColumnIndex(columns)
  const asts = new Map()
  const deps = new Map()
  const errors = new Map()

  for (const column of columns) {
    if (!column.formula) continue
    try {
      const ast = parseFormula(column.formula)
      asts.set(column.id, ast)
      const refs = [...collectRefs(ast)]
      let hasMissing = false
      for (const ref of refs) {
        if (!index.has(ref)) {
          errors.set(column.id, 'REF')
          hasMissing = true
          break
        }
      }
      if (hasMissing) continue
      deps.set(
        column.id,
        refs.map((ref) => index.get(ref)).filter((c) => c && c.formula).map((c) => c.id)
      )
    } catch (error) {
      errors.set(column.id, error instanceof FormulaError ? error.code : 'SYNTAX')
    }
  }

  const state = new Map()
  const order = []
  const cycles = new Set()

  function visit(id, stack) {
    const current = state.get(id) || 0
    if (current === 2) return
    if (current === 1) {
      const from = stack.indexOf(id)
      if (from !== -1) for (let i = from; i < stack.length; i += 1) cycles.add(stack[i])
      return
    }
    state.set(id, 1)
    stack.push(id)
    for (const dep of deps.get(id) || []) visit(dep, stack)
    stack.pop()
    state.set(id, 2)
    order.push(id)
  }

  for (const id of asts.keys()) visit(id, [])
  for (const id of cycles) errors.set(id, 'CYCLE')
  return { asts, errors, order, index }
}

export function formatNumber(value) {
  if (value == null || !Number.isFinite(value)) return ''
  if (Number.isInteger(value)) return String(value)
  const abs = Math.abs(value)
  if (abs !== 0 && (abs < 1e-4 || abs >= 1e7)) {
    return value.toExponential(4).replace(/\.?0+e/, 'e')
  }
  return String(Number(value.toFixed(6)))
}

/**
 * 计算数据集：原始列直接读取；公式列按依赖顺序逐行求值。
 * 返回的行同时包含 values（数值/文本）、display（展示文本）、errors（错误码）。
 */
export function computeDataset(dataset) {
  const columns = dataset.columns || []
  const rows = dataset.rows || []
  const { asts, errors, order, index } = analyzeFormulas(columns)

  const rawNumbers = new Map()
  const rawErrors = new Map()

  for (const column of columns) {
    if (column.formula) continue
    if (column.type === 'number') {
      rawNumbers.set(
        column.id,
        rows.map((row) => toNumber(row.cells?.[column.id]))
      )
      rawErrors.set(
        column.id,
        rows.map((row) => {
          const text = String(row.cells?.[column.id] ?? '').trim()
          return text !== '' && toNumber(text) === null ? 'VALUE' : null
        })
      )
    }
  }

  const formulaValues = new Map()
  for (const column of columns) {
    if (column.formula) formulaValues.set(column.id, new Array(rows.length).fill(null))
  }
  for (const column of columns) {
    if (column.formula && errors.has(column.id)) {
      const code = errors.get(column.id)
      formulaValues.set(
        column.id,
        new Array(rows.length).fill(null).map(() => ({ value: null, error: code }))
      )
    }
  }

  const ctx = {
    getRef(name, rowIndex) {
      const column = index.get(name)
      if (!column) throw new FormulaError('REF', `列「${name}」不存在`)
      if (column.formula) {
        const cell = formulaValues.get(column.id)?.[rowIndex]
        if (!cell) throw new FormulaError('VALUE', '引用的公式单元格为空')
        if (cell.error) throw new FormulaError(cell.error, '引用的公式列存在错误')
        if (cell.value == null) throw new FormulaError('VALUE', '引用的单元格为空')
        return cell.value
      }
      if (column.type !== 'number') {
        throw new FormulaError('VALUE', `列「${name}」不是数值列`)
      }
      const value = rawNumbers.get(column.id)?.[rowIndex]
      if (value == null) {
        const text = String(rows[rowIndex]?.cells?.[column.id] ?? '').trim()
        if (text === '') throw new FormulaError('VALUE', '引用的单元格为空')
        throw new FormulaError('VALUE', `「${text}」不是有效数字`)
      }
      return value
    },
    getColumnNumbers(name) {
      const column = index.get(name)
      if (!column) throw new FormulaError('REF', `列「${name}」不存在`)
      if (column.formula) {
        return (formulaValues.get(column.id) || [])
          .filter((cell) => cell && !cell.error && cell.value != null)
          .map((cell) => cell.value)
      }
      if (column.type !== 'number') return []
      return (rawNumbers.get(column.id) || []).filter((value) => value != null)
    }
  }

  for (const columnId of order) {
    if (errors.has(columnId)) continue
    const column = columns.find((c) => c.id === columnId)
    const ast = asts.get(columnId)
    if (!column || !ast) continue
    const cells = []
    for (let rowIndex = 0; rowIndex < rows.length; rowIndex += 1) {
      try {
        const value = evaluateNode(ast, ctx, rowIndex)
        cells.push({ value: Number.isFinite(value) ? value : null, error: Number.isFinite(value) ? null : 'VALUE' })
      } catch (error) {
        cells.push({ value: null, error: error instanceof FormulaError ? error.code : 'VALUE' })
      }
    }
    formulaValues.set(columnId, cells)
  }

  const computedRows = rows.map((row, rowIndex) => {
    const values = {}
    const display = {}
    const cellErrors = {}
    for (const column of columns) {
      if (column.formula) {
        const cell = formulaValues.get(column.id)?.[rowIndex]
        if (!cell || cell.error) {
          values[column.id] = null
          display[column.id] = `#${cell?.error || 'VALUE'}`
          cellErrors[column.id] = cell?.error || 'VALUE'
        } else {
          values[column.id] = cell.value
          display[column.id] = formatNumber(cell.value)
        }
        continue
      }
      if (column.type === 'number') {
        const value = rawNumbers.get(column.id)?.[rowIndex] ?? null
        values[column.id] = value
        display[column.id] = String(row.cells?.[column.id] ?? '')
        const error = rawErrors.get(column.id)?.[rowIndex]
        if (error) cellErrors[column.id] = error
        continue
      }
      const text = row.cells?.[column.id] ?? ''
      values[column.id] = text
      display[column.id] = text
    }
    return { id: row.id, values, display, errors: cellErrors }
  })

  return { columns, rows: computedRows }
}

export const ERROR_TEXT = {
  SYNTAX: '公式语法错误',
  REF: '引用了不存在的列',
  VALUE: '数值无效或为空',
  DIV0: '除数为 0',
  CYCLE: '存在循环引用'
}
