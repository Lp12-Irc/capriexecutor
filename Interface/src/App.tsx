import { useEffect, useMemo, useRef, useState } from "react"
import type { CSSProperties } from "react"
import { analyze } from "./lua"

type Page = "editor" | "library" | "settings"
type LogEntry = { time: string; text: string; kind: string }
const STORE = "capri.workspace.v1"
const accents = [
  { name: "Rosa", value: "#ee3a66", on: "#fff" },
  { name: "Verde", value: "#65f47e", on: "#0b2512" },
  { name: "Azul", value: "#4a7dff", on: "#fff" },
]
function cursorUrl(fill: string, stroke: string) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="26" height="26" viewBox="0 0 26 26"><path d="M4 3v17l4.6-4.2 3.1 7 3-1.3-3-6.8 6.3-.2z" fill="${fill}" stroke="${stroke}" stroke-width="1.6" stroke-linejoin="round"/></svg>`
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}") 4 3`
}
function Dots() {
  return (
    <div className="dots" aria-hidden="true">
      {Array.from({ length: 32 }, (_, i) => (
        <span
          key={i}
          className={i % 6 === 0 ? "dot white" : "dot"}
          style={
            {
              left: `${(i * 31 + 5) % 100}%`,
              width: `${2 + (i % 3)}px`,
              height: `${2 + (i % 3)}px`,
              "--o": 0.3 + (i % 4) * 0.07,
              animationDuration: `${12 + (i % 6) * 3}s`,
              animationDelay: `${-((i * 5) % 26)}s`,
            } as CSSProperties
          }
        />
      ))}
    </div>
  )
}
function loadStore(): any {
  try {
    return JSON.parse(localStorage.getItem(STORE) || "null") || {}
  } catch {
    return {}
  }
}
type Script = {
  id: number
  name: string
  code: string
}
const starter = `-- Capri Executor

local Capri = {}
Capri.version = "1.0.0"

function Capri.welcome()
    local message = "Hello, Capri!"
    print(message)
end

Capri.welcome()
`
const examples = [
  {
    name: "Hello, Capri",
    tag: "BÁSICO",
    description: "Tabela, função e print.",
    code: starter,
  },
  {
    name: "Funções com parâmetros",
    tag: "FUNÇÕES",
    description: "Chamadas com argumentos e concatenação.",
    code: '-- Funções com parâmetros\nlocal function saudacao(nome, vezes)\n    print("Olá, " .. nome .. "! x" .. vezes)\nend\n\nsaudacao("Capri", 1)\nsaudacao("Roblox", 2)\n',
  },
  {
    name: "Variáveis e cálculos",
    tag: "BÁSICO",
    description: "Aritmética simples e tostring.",
    code: '-- Variáveis e cálculos\nlocal preco = 25\nlocal qtd = 4\nlocal total = preco * qtd\n\nprint("Total: " .. total)\nwarn("Estoque baixo: " .. tostring(qtd))\n',
  },
  {
    name: "Verificador de sintaxe",
    tag: "DIAGNÓSTICO",
    description: "Script com 'end' faltando para testar os erros.",
    code: '-- Falta fechar o bloco abaixo\nfunction teste()\n    if true then\n        print("ok")\n    -- end\nend\n',
  },
]
const paths: Record<string, string> = {
  code: "m8 8-4 4 4 4m8-8 4 4-4 4m-3-11-2 14",
  library: "M4 4h6v16H4zm10 0h6v16h-6M7 8h0m10 0h0",
  settings: "M4 7h16M4 17h16M9 4v6m6 4v6",
  play: "m8 5 11 7-11 7Z",
  plus: "M12 5v14M5 12h14",
  close: "m7 7 10 10M7 17 17 7",
  folder: "M3 7h7l2 2h9v11H3ZM3 7V4h7l2 3",
  save: "M5 3h12l4 4v14H3V3h2Zm2 0v7h10V3M7 21v-7h10v7",
  trash: "M3 6h18M9 6V3h6v3M6 6l1 15h10l1-15M10 10v7m4-7v7",
  terminal: "m4 6 6 6-6 6m9 0h7",
  arrow: "M5 12h14m-5-5 5 5-5 5",
  search: "M10 17a7 7 0 1 0 0-14 7 7 0 0 0 0 14Zm5-2 6 6",
  check: "m5 12 4 4L19 6",
}
function Icon({ name, size = 18 }: { name: string; size?: number }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth="1.6"
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
    >
      <path d={paths[name] || paths.code} />
    </svg>
  )
}
function highlight(line: string) {
  return line
    .split(
      /(--.*$|"(?:[^"\\]|\\.)*"|\b(?:local|function|end|return|for|in|do)\b|\b\d+(?:\.\d+)*\b)/g,
    )
    .map((part, i) => (
      <span
        key={i}
        className={
          part.startsWith("--")
            ? "syntax-comment"
            : part.startsWith('"')
              ? "syntax-string"
              : /^(local|function|end|return|for|in|do)$/.test(part)
                ? "syntax-keyword"
                : /^\d/.test(part)
                  ? "syntax-number"
                  : ""
        }
      >
        {part}
      </span>
    ))
}

export default function App() {
  const clientPid = (window as Window & { __capriPid?: number }).__capriPid
  const [page, setPage] = useState<Page>("editor")
  const saved = useMemo(loadStore, [])
  const [scripts, setScripts] = useState<Script[]>(
    saved.scripts?.length ? saved.scripts : [{ id: 1, name: "welcome.lua", code: starter }],
  )
  const [active, setActive] = useState<number>(
    saved.scripts?.some((x: Script) => x.id === saved.active) ? saved.active : saved.scripts?.[0]?.id ?? 1,
  )
  const [logs, setLogs] = useState<LogEntry[]>([
    {
      time: new Date().toLocaleTimeString("pt-BR"),
      text: saved.scripts?.length ? "Workspace restaurado." : "Sessão iniciada.",
      kind: "success",
    },
  ])
  const [consoleOpen, setConsoleOpen] = useState(true)
  const [fontSize, setFontSize] = useState<number>(saved.fontSize ?? 13)
  const [wrap, setWrap] = useState<boolean>(saved.wrap ?? false)
  const [motion, setMotion] = useState<boolean>(saved.motion ?? true)
  const [accent, setAccent] = useState<number>(saved.accent ?? 0)
  const [search, setSearch] = useState("")
  const [running, setRunning] = useState(false)
  const [cursor, setCursor] = useState({ ln: 1, col: 1 })
  const [renaming, setRenaming] = useState<number | null>(null)
  const [palette, setPalette] = useState(false)
  const [query, setQuery] = useState("")
  const [sel, setSel] = useState(0)
  const [runs, setRuns] = useState(0)
  const fileInput = useRef<HTMLInputElement>(null)
  const nextId = useRef(Math.max(1, ...scripts.map((x) => x.id)) + 1)
  const mirror = useRef<HTMLPreElement>(null)
  const current = scripts.find((s) => s.id === active) ?? scripts[0]
  const diags = useMemo(() => analyze(current.code), [current.code])
  const errLines = useMemo(() => new Set(diags.map((d) => d.line)), [diags])
  const theme = accents[accent] ?? accents[0]
  const log = (text: string, kind = "info") =>
    setLogs((items) => [
      ...items,
      { time: new Date().toLocaleTimeString("pt-BR"), text, kind },
    ])
  function addScript(name?: string, code = "") {
    const id = nextId.current++
    setScripts((items) => [
      ...items,
      { id, name: name || `untitled-${id}.lua`, code },
    ])
    setActive(id)
    setPage("editor")
  }
  function updateCode(code: string) {
    setScripts((items) =>
      items.map((s) => (s.id === active ? { ...s, code } : s)),
    )
  }
  function closeScript(id: number) {
    if (scripts.length === 1) {
      updateCode("")
      return
    }
    setScripts((items) => items.filter((s) => s.id !== id))
    if (active === id) setActive(scripts.find((s) => s.id !== id)!.id)
  }
  function save() {
    const url = URL.createObjectURL(
      new Blob([current.code], { type: "text/plain;charset=utf-8" }),
    )
    const a = document.createElement("a")
    a.href = url
    a.download = current.name
    a.click()
    URL.revokeObjectURL(url)
    log(`${current.name} exportado.`)
  }
  function run() {
    if (running) return
    setPage("editor")
    setConsoleOpen(true)
    if (!current.code.trim()) {
      log("O script está vazio.", "warning")
      return
    }
    if (diags.length) {
      log(`${current.name}: ${diags.length} erro(s) de sintaxe. Execução cancelada.`, "error")
      diags.slice(0, 4).forEach((d) => log(`  linha ${d.line}: ${d.message}`, "error"))
      return
    }
    log("O engine Roblox do Capri ainda não está conectado.", "warning")
  }
  function trackCursor(el: HTMLTextAreaElement) {
    const before = el.value.slice(0, el.selectionStart).split("\n")
    setCursor({ ln: before.length, col: before[before.length - 1].length + 1 })
  }
  function renameScript(id: number, name: string) {
    const clean = name.trim().replace(/[\\/:*?"<>|]/g, "")
    if (clean)
      setScripts((items) =>
        items.map((x) => (x.id === id ? { ...x, name: /\.(lua|luau|txt)$/i.test(clean) ? clean : clean + ".lua" } : x)),
      )
    setRenaming(null)
  }
  const commands = [
    { label: "Executar script", hint: "Ctrl+Enter", run },
    { label: "Salvar arquivo", hint: "Ctrl+S", run: save },
    { label: "Novo script", hint: "Ctrl+N", run: () => addScript() },
    { label: "Abrir arquivo...", hint: "", run: () => fileInput.current?.click() },
    { label: "Limpar editor", hint: "", run: () => updateCode("") },
    { label: "Limpar console", hint: "", run: () => setLogs([]) },
    { label: "Ir para Executor", hint: "", run: () => setPage("editor") },
    { label: "Ir para Biblioteca", hint: "", run: () => setPage("library") },
    { label: "Ir para Configurações", hint: "", run: () => setPage("settings") },
    ...examples.map((ex) => ({
      label: `Abrir exemplo: ${ex.name}`,
      hint: ex.tag,
      run: () => addScript(ex.name.toLowerCase().replace(/ /g, "-") + ".lua", ex.code),
    })),
  ].filter((c) => c.label.toLowerCase().includes(query.toLowerCase()))
  const keys = useRef({ run, save, addScript, setPalette })
  keys.current = { run, save, addScript, setPalette }
  useEffect(() => {
    localStorage.setItem(STORE, JSON.stringify({ scripts, active, fontSize, wrap, motion, accent }))
  }, [scripts, active, fontSize, wrap, motion, accent])
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (!(e.ctrlKey || e.metaKey)) return
      const k = e.key.toLowerCase()
      if (k === "enter") { e.preventDefault(); keys.current.run() }
      else if (k === "s") { e.preventDefault(); keys.current.save() }
      else if (k === "n") { e.preventDefault(); keys.current.addScript() }
      else if (k === "k") { e.preventDefault(); keys.current.setPalette((v) => !v) }
    }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [])
  useEffect(() => { setSel(0) }, [query])
  useEffect(() => {
    if (!palette) setQuery("")
  }, [palette])
  return (
    <main
      className={`stage ${motion ? "" : "no-motion"}`}
      style={
        {
          "--pink": theme.value,
          "--on-accent": theme.on,
          "--cursor": cursorUrl(theme.value, "#0b0b0f"),
          "--cursor-hover": cursorUrl("#ffffff", theme.value),
        } as CSSProperties
      }
    >
      <section className="window" aria-label="Capri Roblox Workspace">
        <Dots />
        <aside className="sidebar">
          <div className="brand">
            <img src="/logo.png" alt="Capri" />
            <div>
              <strong>
                CAPRI<span>®</span>
              </strong>
              <small>ROBLOX EXECUTOR</small>
            </div>
          </div>
          <div className="nav-label">WORKSPACE</div>
          <nav aria-label="Navegação principal">
            {([
              { id: "editor", label: "Executor", icon: "code" },
              { id: "library", label: "Biblioteca", icon: "library" },
              { id: "settings", label: "Configurações", icon: "settings" },
            ] as const).map((item) => (
              <button
                key={item.id}
                onClick={() => setPage(item.id)}
                className={page === item.id ? "active" : ""}
              >
                <Icon name={item.icon} />
                {item.label}
                {page === item.id && <span className="nav-dot" />}
              </button>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <div className="version">
              <span>
                <i /> {clientPid ? `Roblox detectado · PID ${clientPid}` : "Sessão local"}
              </span>
              <small>
                CAPRI <span>v1.0.0</span>
              </small>
            </div>
          </div>
        </aside>
        <div className="main-panel">
          <header className="topbar">
            <div>
              <span className="breadcrumb">Workspace</span>
              <span className="slash">/</span>
              <span>
                {page === "editor"
                  ? "Executor"
                  : page === "library"
                    ? "Biblioteca"
                    : "Configurações"}
              </span>
            </div>
            <span className="preview-badge">
              <i /> PRÉVIA LOCAL
            </span>
          </header>
          <div className="page-heading">
            <h1>
              {page === "editor"
                ? "Executor"
                : page === "library"
                  ? "Biblioteca"
                  : "Configurações"}
            </h1>
            <p>
              {page === "editor"
                ? "Edite e verifique scripts Lua."
                : page === "library"
                  ? "Exemplos em Lua para abrir no editor."
                  : "Preferências do editor."}
            </p>
          </div>
          {page === "editor" && (
            <>
              <div className="editor-shell">
                <div className="editor-tabs">
                  <div
                    className="tabs-scroll"
                    role="tablist"
                    aria-label="Scripts abertos"
                  >
                    {scripts.map((s) => (
                      <div
                        className={`file-tab ${
                          s.id === active ? "selected" : ""
                        }`}
                        key={s.id}
                      >
                        <button
                          role="tab"
                          aria-selected={s.id === active}
                          onClick={() => setActive(s.id)}
                          onDoubleClick={() => setRenaming(s.id)}
                          title="Clique duas vezes para renomear"
                        >
                          <span className="lua-symbol">L</span>
                          {renaming === s.id ? (
                            <input
                              className="rename-input"
                              autoFocus
                              defaultValue={s.name}
                              onFocus={(e) => e.currentTarget.select()}
                              onBlur={(e) => renameScript(s.id, e.currentTarget.value)}
                              onKeyDown={(e) => {
                                if (e.key === "Enter") e.currentTarget.blur()
                                if (e.key === "Escape") setRenaming(null)
                              }}
                            />
                          ) : (
                            s.name
                          )}
                        </button>
                        <button
                          onClick={() => closeScript(s.id)}
                          aria-label={`Fechar ${s.name}`}
                        >
                          <Icon name="close" size={13} />
                        </button>
                      </div>
                    ))}
                  </div>
                  <button
                    className="icon-button"
                    aria-label="Novo script"
                    onClick={() => addScript()}
                  >
                    <Icon name="plus" size={17} />
                  </button>
                  <span className="editor-language">LUA</span>
                </div>
                <div
                  className="code-area"
                  style={{ "--editor-font": `${fontSize}px` } as CSSProperties}
                >
                  <div className="line-numbers" aria-hidden="true">
                    {Array.from(
                      { length: current.code.split("\n").length },
                      (_, i) => (
                        <div key={i} className={errLines.has(i + 1) ? "err" : ""}>
                          {i + 1}
                        </div>
                      ),
                    )}
                  </div>
                  <div className="code-input">
                    <pre
                      ref={mirror}
                      className={wrap ? "wrap" : ""}
                      aria-hidden="true"
                    >
                      {current.code.split("\n").map((line, i) => (
                        <div key={i} className={errLines.has(i + 1) ? "err-line" : ""}>
                          {highlight(line) || " "}
                          {!line && "\u200b"}
                        </div>
                      ))}
                    </pre>
                    <textarea
                      aria-label={`Código de ${current.name}`}
                      spellCheck={false}
                      wrap={wrap ? "soft" : "off"}
                      value={current.code}
                      onChange={(e) => {
                        updateCode(e.target.value)
                        trackCursor(e.target)
                      }}
                      onKeyUp={(e) => trackCursor(e.currentTarget)}
                      onClick={(e) => trackCursor(e.currentTarget)}
                      onScroll={(e) => {
                        if (mirror.current) {
                          mirror.current.scrollTop = e.currentTarget.scrollTop
                          mirror.current.scrollLeft = e.currentTarget.scrollLeft
                        }
                      }}
                      onKeyDown={(e) => {
                        if (e.key === "Tab") {
                          e.preventDefault()
                          const el = e.currentTarget
                          const start = el.selectionStart
                          updateCode(
                            current.code.slice(0, start) +
                              "    " +
                              current.code.slice(el.selectionEnd),
                          )
                          requestAnimationFrame(() => {
                            el.selectionStart = el.selectionEnd = start + 4
                          })
                        }
                      }}
                    />
                  </div>
                  <span className="editor-watermark">capri.</span>
                </div>
                <div className="editor-status">
                  <span className={diags.length ? "bad" : "good"}>
                    <i />
                    {diags.length
                      ? `${diags.length} erro(s): linha ${diags[0].line}, ${diags[0].message}`
                      : "Sintaxe OK"}
                  </span>
                  <span>
                    Ln {cursor.ln}, Col {cursor.col}
                    <b>{current.code.split("\n").length} linhas</b>
                    <span>{current.code.length} caracteres</span>
                  </span>
                </div>
              </div>
              <div className="toolbar">
                <button
                  className={`primary-button ${running ? "running" : ""}`}
                  disabled={running}
                  onClick={run}
                  title="Ctrl+Enter"
                >
                  {running ? (
                    <span className="spinner" />
                  ) : (
                    <Icon name="play" size={15} />
                  )}
                  {running ? "Executando" : "Executar"}
                  <span>Ctrl+↵</span>
                </button>
                <div className="file-actions">
                  <button onClick={() => fileInput.current?.click()}>
                    <Icon name="folder" size={16} />
                    Abrir
                  </button>
                  <button onClick={save}>
                    <Icon name="save" size={16} />
                    Salvar
                  </button>
                  <span className="toolbar-divider" />
                  <button onClick={() => updateCode("")}>
                    <Icon name="trash" size={16} />
                    Limpar
                  </button>
                </div>
                <span className="local-note">
                  <i /> {runs} execução(ões) nesta sessão
                </span>
              </div>
              <section className="console">
                <div className="console-heading">
                  <button
                    onClick={() => setConsoleOpen(!consoleOpen)}
                    aria-expanded={consoleOpen}
                  >
                    <Icon name="terminal" size={16} />
                    Console<span className="log-count">{logs.length}</span>
                  </button>
                  <div>
                    <button
                      onClick={() => setLogs([])}
                      aria-label="Limpar console"
                    >
                      <Icon name="trash" size={14} />
                    </button>
                    <button
                      onClick={() => setConsoleOpen(!consoleOpen)}
                      aria-label={
                        consoleOpen ? "Recolher console" : "Expandir console"
                      }
                    >
                      {consoleOpen ? "−" : "+"}
                    </button>
                  </div>
                </div>
                {consoleOpen && (
                  <div className="console-output" role="log">
                    {logs.length ? (
                      logs.map((entry, i) => (
                        <div key={i}>
                          <time>{entry.time}</time>
                          <span className={entry.kind}>
                            {entry.kind === "success" ? "✓" : entry.kind === "error" ? "✕" : entry.kind === "output" ? "»" : "›"}
                          </span>
                          <span className={entry.kind}>{entry.text}</span>
                        </div>
                      ))
                    ) : (
                      <span className="empty-log">Console vazio.</span>
                    )}
                  </div>
                )}
              </section>
            </>
          )}
          {page === "library" && (
            <section className="library">
              <label className="search-box">
                <Icon name="search" />
                <input
                  placeholder="Buscar na biblioteca..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
              </label>
              <div className="script-grid">
                {examples
                  .filter((s) =>
                    `${s.name} ${s.description}`
                      .toLowerCase()
                      .includes(search.toLowerCase()),
                  )
                  .map((s) => (
                    <article className="script-card" key={s.name}>
                      <div className="script-card-icon">
                        <Icon name="code" size={24} />
                      </div>
                      <small>{s.tag}</small>
                      <h2>{s.name}</h2>
                      <p>{s.description}</p>
                      <button
                        onClick={() => {
                          addScript(
                            s.name.toLowerCase().replace(/ /g, "-") + ".lua",
                            s.code,
                          )
                          log(`Exemplo "${s.name}" aberto no editor.`)
                        }}
                      >
                        Abrir no editor
                        <Icon name="arrow" size={16} />
                      </button>
                    </article>
                  ))}
              </div>
              {!examples.some((s) =>
                `${s.name} ${s.description}`
                  .toLowerCase()
                  .includes(search.toLowerCase()),
              ) && (
                <p className="empty-state">
                  Nenhum exemplo encontrado. Tente outra busca.
                </p>
              )}
            </section>
          )}
          {page === "settings" && (
            <section className="settings-card">
              <h2>Preferências do workspace</h2>
              <div className="setting-row">
                <div>
                  <strong>Tamanho da fonte</strong>
                  <p>Tamanho do texto no editor.</p>
                </div>
                <select
                  aria-label="Tamanho da fonte"
                  value={fontSize}
                  onChange={(e) => setFontSize(Number(e.target.value))}
                >
                  {[12, 13, 14, 16, 18].map((n) => (
                    <option key={n} value={n}>
                      {n} px
                    </option>
                  ))}
                </select>
              </div>
              <div className="setting-row">
                <div>
                  <strong>Cor de destaque</strong>
                  <p>Usa as cores da identidade Capri.</p>
                </div>
                <div className="accent-picker">
                  {accents.map((a, k) => (
                    <button
                      key={a.name}
                      aria-label={a.name}
                      aria-pressed={accent === k}
                      className={accent === k ? "sel" : ""}
                      style={{ background: a.value }}
                      onClick={() => setAccent(k)}
                    />
                  ))}
                </div>
              </div>
              {[
                {
                  label: "Quebra de linha",
                  description: "Ajustar linhas longas à largura do editor.",
                  value: wrap,
                  set: setWrap,
                },
                {
                  label: "Animações",
                  description: "Animações da interface.",
                  value: motion,
                  set: setMotion,
                },
              ].map((s) => (
                <div className="setting-row" key={s.label}>
                  <div>
                    <strong>{s.label}</strong>
                    <p>{s.description}</p>
                  </div>
                  <button
                    role="switch"
                    aria-label={s.label}
                    aria-checked={s.value}
                    className={`switch ${s.value ? "on" : ""}`}
                    onClick={() => s.set(!s.value)}
                  >
                    <span />
                  </button>
                </div>
              ))}
              <h2 className="shortcut-title">Atalhos</h2>
              <ul className="shortcuts">
                {[
                  ["Executar script", "Ctrl + Enter"],
                  ["Salvar arquivo", "Ctrl + S"],
                  ["Novo script", "Ctrl + N"],
                  ["Paleta de comandos", "Ctrl + K"],
                ].map(([a, b]) => (
                  <li key={a}>
                    {a}
                    <kbd>{b}</kbd>
                  </li>
                ))}
              </ul>
              <div className="settings-note">
                Scripts e preferências ficam salvos neste navegador. A execução
                é uma simulação local e não conecta ao cliente Roblox.
                <button
                  className="danger-link"
                  onClick={() => {
                    localStorage.removeItem(STORE)
                    location.reload()
                  }}
                >
                  Apagar dados locais
                </button>
              </div>
            </section>
          )}
          <footer className="panel-footer">
            <span>Capri Roblox Executor</span>
            <button className="footer-key" onClick={() => setPalette(true)}>
              Comandos <kbd>Ctrl K</kbd>
            </button>
          </footer>
        </div>
      </section>
      {palette && (
        <div className="palette-backdrop" onMouseDown={() => setPalette(false)}>
          <div className="palette" role="dialog" aria-label="Paleta de comandos" onMouseDown={(e) => e.stopPropagation()}>
            <input
              autoFocus
              placeholder="Digite um comando..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Escape") setPalette(false)
                else if (e.key === "ArrowDown") { e.preventDefault(); setSel((v) => Math.min(v + 1, commands.length - 1)) }
                else if (e.key === "ArrowUp") { e.preventDefault(); setSel((v) => Math.max(v - 1, 0)) }
                else if (e.key === "Enter" && commands[sel]) { setPalette(false); commands[sel].run() }
              }}
            />
            <ul>
              {commands.map((c, k) => (
                <li key={c.label}>
                  <button
                    className={k === sel ? "on" : ""}
                    onMouseEnter={() => setSel(k)}
                    onClick={() => { setPalette(false); c.run() }}
                  >
                    {c.label}
                    <kbd>{c.hint}</kbd>
                  </button>
                </li>
              ))}
              {!commands.length && <li className="palette-empty">Nenhum comando encontrado.</li>}
            </ul>
          </div>
        </div>
      )}
      <input
        ref={fileInput}
        type="file"
        accept=".lua,.luau,.txt"
        hidden
        onChange={async (e) => {
          const file = e.target.files?.[0]
          if (file) {
            addScript(file.name, await file.text())
            log(`${file.name} importado.`)
          }
          e.target.value = ""
        }}
      />
    </main>
  )
}
