export type Diagnostic = { line: number; message: string }
export type Output = { text: string; kind: "info" | "warning" }

type Value = string | number | boolean | null
const OPEN = "([{"
const CLOSE: Record<string, string> = { ")": "(", "]": "[", "}": "{" }

/** Verifica balanceamento de blocos, parênteses e strings. */
export function analyze(code: string): Diagnostic[] {
  const out: Diagnostic[] = []
  const blocks: { kind: string; line: number; waitingDo?: boolean }[] = []
  const pairs: { ch: string; line: number }[] = []
  let line = 1
  let i = 0
  const n = code.length
  const longClose = (start: number, level: number) => {
    const end = code.indexOf("]" + "=".repeat(level) + "]", start)
    return end === -1 ? n : end + level + 2
  }
  while (i < n) {
    const c = code[i]
    if (c === "\n") { line++; i++; continue }
    if (code.startsWith("--", i)) {
      const m = /^--\[(=*)\[/.exec(code.slice(i, i + 40))
      if (m) {
        const end = longClose(i + m[0].length, m[1].length)
        line += (code.slice(i, end).match(/\n/g) || []).length
        i = end
      } else {
        while (i < n && code[i] !== "\n") i++
      }
      continue
    }
    if (c === '"' || c === "'") {
      let j = i + 1
      while (j < n && code[j] !== c && code[j] !== "\n") j += code[j] === "\\" ? 2 : 1
      if (code[j] !== c) out.push({ line, message: "String não terminada." })
      i = j + 1
      continue
    }
    if (c === "[") {
      const m = /^\[(=*)\[/.exec(code.slice(i, i + 40))
      if (m) {
        const end = longClose(i + m[0].length, m[1].length)
        line += (code.slice(i, end).match(/\n/g) || []).length
        i = end
        continue
      }
    }
    if (OPEN.includes(c)) pairs.push({ ch: c, line })
    else if (CLOSE[c]) {
      const top = pairs.pop()
      if (!top) out.push({ line, message: `'${c}' sem abertura correspondente.` })
      else if (top.ch !== CLOSE[c]) out.push({ line, message: `'${c}' não combina com '${top.ch}' da linha ${top.line}.` })
    }
    if (/[A-Za-z_]/.test(c)) {
      let j = i
      while (j < n && /[\w]/.test(code[j])) j++
      const w = code.slice(i, j)
      const prev = code[i - 1]
      if (prev !== "." && prev !== ":") {
        if (w === "function" || w === "if" || w === "repeat") blocks.push({ kind: w, line })
        else if (w === "for" || w === "while") blocks.push({ kind: w, line, waitingDo: true })
        else if (w === "do") {
          const top = blocks[blocks.length - 1]
          if (top?.waitingDo) top.waitingDo = false
          else blocks.push({ kind: "do", line })
        } else if (w === "end") {
          const top = blocks[blocks.length - 1]
          if (!top || top.kind === "repeat") out.push({ line, message: "'end' sem bloco aberto." })
          else blocks.pop()
        } else if (w === "until") {
          const top = blocks[blocks.length - 1]
          if (top?.kind === "repeat") blocks.pop()
          else out.push({ line, message: "'until' sem 'repeat' correspondente." })
        }
      }
      i = j
      continue
    }
    i++
  }
  blocks.forEach((b) => out.push({ line: b.line, message: `Bloco '${b.kind}' não foi fechado.` }))
  pairs.forEach((p) => out.push({ line: p.line, message: `'${p.ch}' não foi fechado.` }))
  return out.sort((a, b) => a.line - b.line)
}

function stripLine(line: string) {
  let q = ""
  for (let i = 0; i < line.length; i++) {
    const c = line[i]
    if (q) { if (c === "\\") i++; else if (c === q) q = "" }
    else if (c === '"' || c === "'") q = c
    else if (c === "-" && line[i + 1] === "-") return line.slice(0, i).trim()
  }
  return line.trim()
}
function blank(line: string) { return line.replace(/(["'])(?:\\.|(?!\1).)*\1/g, '""') }
function delta(line: string) {
  const words = blank(line).match(/\b[A-Za-z_]\w*\b/g) || []
  let d = 0
  for (const w of words) {
    if (w === "function" || w === "if" || w === "do" || w === "repeat") d++
    else if (w === "end" || w === "until") d--
  }
  return d
}
function splitTop(expr: string, sep: string) {
  const parts: string[] = []
  let depth = 0, q = "", start = 0
  for (let i = 0; i < expr.length; i++) {
    const c = expr[i]
    if (q) { if (c === "\\") i++; else if (c === q) q = "" }
    else if (c === '"' || c === "'") q = c
    else if ("([{".includes(c)) depth++
    else if (")]}".includes(c)) depth--
    else if (!depth && expr.startsWith(sep, i)) { parts.push(expr.slice(start, i)); i += sep.length - 1; start = i + 1 }
  }
  parts.push(expr.slice(start))
  return parts
}
const UNKNOWN = Symbol("unknown")
type Env = Record<string, Value>

function evalExpr(raw: string, env: Env): Value | typeof UNKNOWN {
  const expr = raw.trim()
  const concat = splitTop(expr, "..")
  if (concat.length > 1) {
    let s = ""
    for (const p of concat) {
      const v = evalExpr(p, env)
      if (v === UNKNOWN || v === null || typeof v === "boolean") return UNKNOWN
      s += String(v)
    }
    return s
  }
  const str = /^"((?:[^"\\]|\\.)*)"$|^'((?:[^'\\]|\\.)*)'$/.exec(expr)
  if (str) return (str[1] ?? str[2]).replace(/\\(.)/g, (_, c) => (c === "n" ? "\n" : c === "t" ? "\t" : c))
  if (/^-?\d+(\.\d+)?$/.test(expr)) return Number(expr)
  if (expr === "true") return true
  if (expr === "false") return false
  if (expr === "nil") return null
  const wrapped = /^\((.*)\)$/.exec(expr)
  if (wrapped) return evalExpr(wrapped[1], env)
  const ts = /^tostring\((.*)\)$/.exec(expr)
  if (ts) { const v = evalExpr(ts[1], env); return v === UNKNOWN ? UNKNOWN : String(v) }
  if (/^[A-Za-z_][\w.]*$/.test(expr)) return expr in env ? env[expr] : null
  for (const op of ["+", "-", "*", "/", "%"]) {
    const p = splitTop(expr, op)
    if (p.length === 2 && p[0].trim() && p[1].trim()) {
      const a = evalExpr(p[0], env), b = evalExpr(p[1], env)
      if (typeof a !== "number" || typeof b !== "number") return UNKNOWN
      return op === "+" ? a + b : op === "-" ? a - b : op === "*" ? a * b : op === "/" ? a / b : a % b
    }
  }
  return UNKNOWN
}

/**
 * Simulação local limitada: print/warn, variáveis, concatenação, aritmética
 * simples e funções declaradas. Não executa nada no Roblox.
 */
export function simulate(code: string): { output: Output[]; skipped: number } {
  const lines = code.split("\n").map(stripLine)
  const output: Output[] = []
  const fns: Record<string, { params: string[]; body: string[] }> = {}
  let skipped = 0
  let steps = 0
  const take = (from: number) => {
    let d = delta(lines[from]), j = from + 1
    while (d > 0 && j < lines.length) { d += delta(lines[j]); j++ }
    return j
  }
  const run = (body: string[], env: Env, depth: number): boolean => {
    for (let i = 0; i < body.length; i++) {
      if (++steps > 3000) { output.push({ text: "Limite de passos da simulação atingido.", kind: "warning" }); return true }
      const line = body[i]
      if (!line) continue
      const fn = /^(?:local\s+)?function\s+([\w.:]+)\s*\(([^)]*)\)/.exec(line)
      if (fn) {
        const end = take(i)
        const inner = body.slice(i + 1, end - 1)
        fns[fn[1].replace(":", ".")] = { params: fn[2].split(",").map((p) => p.trim()).filter(Boolean), body: inner }
        i = end - 1
        continue
      }
      if (/^(if|for|while|repeat|do)\b/.test(line)) { skipped++; i = take(i) - 1; continue }
      if (/^return\b/.test(line)) return true
      const pr = /^(print|warn)\((.*)\)$/.exec(line)
      if (pr) {
        const args = pr[2].trim() ? splitTop(pr[2], ",").map((a) => evalExpr(a, env)) : []
        if (args.includes(UNKNOWN as never)) { skipped++; continue }
        output.push({ text: args.map((v) => (v === null ? "nil" : String(v))).join("    "), kind: pr[1] === "warn" ? "warning" : "info" })
        continue
      }
      const asg = /^(?:local\s+)?([A-Za-z_][\w.]*)\s*=\s*(.+)$/.exec(line)
      if (asg) {
        if (/^\{/.test(asg[2].trim())) { env[asg[1]] = "[table]"; if (delta(asg[2]) > 0) i = take(i) - 1; continue }
        const v = evalExpr(asg[2], env)
        if (v === UNKNOWN) skipped++
        else env[asg[1]] = v
        continue
      }
      const call = /^([\w.:]+)\((.*)\)$/.exec(line)
      if (call) {
        const f = fns[call[1].replace(":", ".")]
        if (f && depth < 40) {
          const scope: Env = { ...env }
          const args = call[2].trim() ? splitTop(call[2], ",").map((a) => evalExpr(a, env)) : []
          f.params.forEach((p, k) => { const v = args[k]; scope[p] = v === undefined || v === UNKNOWN ? null : (v as Value) })
          run(f.body, scope, depth + 1)
          continue
        }
      }
      skipped++
    }
    return false
  }
  run(lines, {}, 0)
  return { output, skipped }
}
