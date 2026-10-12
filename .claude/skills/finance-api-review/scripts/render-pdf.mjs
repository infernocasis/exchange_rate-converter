#!/usr/bin/env node
/**
 * report.md -> report.html -> report.pdf через установленный Chrome/Edge (headless).
 * Без зависимостей: конвертер понимает только то, что генерирует audit.mjs
 * (заголовки, абзацы, списки, таблицы, блоки кода, `code`, **bold**, ссылки).
 *
 *   node .claude/skills/finance-api-audit/scripts/render-pdf.mjs <dir>/report.md
 *
 * Браузер можно указать явно через переменную CHROME_PATH.
 */
import { execFileSync } from 'node:child_process'
import fs from 'node:fs'
import os from 'node:os'
import path from 'node:path'
import { pathToFileURL } from 'node:url'

const BROWSER_CANDIDATES = [
  process.env.CHROME_PATH,
  'C:/Program Files/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
  'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
  'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
  '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
  '/usr/bin/google-chrome',
  '/usr/bin/chromium',
  '/usr/bin/chromium-browser',
].filter(Boolean)

const escapeHtml = text => text
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')

/** Инлайн-разметка. Код вырезаем заранее, чтобы ** и [] внутри него не трогать */
function inline(text) {
  const codes = []
  let html = escapeHtml(text).replace(/`([^`]+)`/g, (_, code) => {
    codes.push(code)
    return `\u0000${codes.length - 1}\u0000`
  })
  html = html
    .replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
    .replace(/\[([^\]]+)\]\(([^)\s]+)\)/g, '<a href="$2">$1</a>')
  return html.replace(/\u0000(\d+)\u0000/g, (_, i) => `<code>${codes[Number(i)]}</code>`)
}

/** Ячейки строки таблицы с учётом экранированного \| */
const splitRow = line => line
  .trim()
  .replace(/^\||\|$/g, '')
  .split(/(?<!\\)\|/)
  .map(cell => cell.trim().replace(/\\\|/g, '|'))

function markdownToHtml(source) {
  const lines = source.replace(/<!--[\s\S]*?-->/g, '').split(/\r?\n/)
  const out = []
  let paragraph = []
  let list = null

  const flushParagraph = () => {
    if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '))}</p>`)
    paragraph = []
  }
  const flushList = () => {
    if (list) out.push(`<${list.tag}>${list.items.map(item => `<li>${inline(item)}</li>`).join('')}</${list.tag}>`)
    list = null
  }
  const flush = () => {
    flushParagraph()
    flushList()
  }

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]

    if (line.startsWith('```')) {
      flush()
      const code = []
      while (++i < lines.length && !lines[i].startsWith('```')) code.push(lines[i])
      out.push(`<pre><code>${escapeHtml(code.join('\n'))}</code></pre>`)
      continue
    }

    const heading = line.match(/^(#{1,6})\s+(.*)$/)
    if (heading) {
      flush()
      const level = heading[1].length
      out.push(`<h${level}>${inline(heading[2])}</h${level}>`)
      continue
    }

    if (line.trim().startsWith('|') && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[i + 1] ?? '')) {
      flush()
      const head = splitRow(line)
      const rows = []
      i += 1
      while (i + 1 < lines.length && lines[i + 1].trim().startsWith('|')) rows.push(splitRow(lines[++i]))
      const headless = head.every(cell => !cell)
      out.push([
        '<table>',
        headless ? '' : `<thead><tr>${head.map(cell => `<th>${inline(cell)}</th>`).join('')}</tr></thead>`,
        `<tbody>${rows.map(row => `<tr>${row.map(cell => `<td>${inline(cell)}</td>`).join('')}</tr>`).join('')}</tbody>`,
        '</table>',
      ].join(''))
      continue
    }

    const item = line.match(/^\s*(?:([-*])|(\d+)\.)\s+(.*)$/)
    if (item) {
      flushParagraph()
      const tag = item[1] ? 'ul' : 'ol'
      if (list && list.tag !== tag) flushList()
      list ??= { tag, items: [] }
      list.items.push(item[3])
      continue
    }

    if (/^\s*---+\s*$/.test(line)) {
      flush()
      out.push('<hr>')
      continue
    }

    if (!line.trim()) {
      flush()
      continue
    }

    flushList()
    paragraph.push(line.trim())
  }
  flush()
  return out.join('\n')
}

const STYLE = `
  @page { size: A4; margin: 16mm 14mm; }
  * { box-sizing: border-box; }
  body { font-family: "Segoe UI", Roboto, Arial, sans-serif; font-size: 10.5pt; line-height: 1.45; color: #1e293b; }
  h1 { font-size: 20pt; margin: 0 0 10px; color: #0f172a; }
  h2 { font-size: 14pt; margin: 22px 0 8px; padding-bottom: 4px; border-bottom: 2px solid #e2e8f0; color: #0f172a; }
  h3 { font-size: 11.5pt; margin: 18px 0 6px; break-after: avoid; }
  p, ul, ol { margin: 6px 0; }
  table { width: 100%; border-collapse: collapse; margin: 8px 0; font-size: 9.5pt; break-inside: auto; }
  tr { break-inside: avoid; }
  th, td { border: 1px solid #cbd5e1; padding: 4px 7px; text-align: left; vertical-align: top; word-break: break-word; }
  th { background: #f1f5f9; }
  code { font-family: Consolas, "Cascadia Mono", monospace; font-size: 9pt; background: #f1f5f9; padding: 0 3px; border-radius: 3px; }
  pre { background: #0f172a; color: #e2e8f0; padding: 8px 10px; border-radius: 6px; white-space: pre-wrap; }
  pre code { background: none; color: inherit; padding: 0; }
  a { color: #4f46e5; }
`

function findBrowser() {
  const browser = BROWSER_CANDIDATES.find(candidate => fs.existsSync(candidate))
  if (!browser) {
    console.error('Не найден Chrome/Edge. Укажите путь в переменной CHROME_PATH.')
    process.exit(2)
  }
  return browser
}

const input = process.argv[2]
if (!input || !fs.existsSync(input)) {
  console.error('Использование: node render-pdf.mjs <path/to/report.md>')
  process.exit(2)
}

const mdPath = path.resolve(input)
const htmlPath = mdPath.replace(/\.md$/i, '.html')
const pdfPath = mdPath.replace(/\.md$/i, '.pdf')
const title = fs.readFileSync(mdPath, 'utf8').match(/^#\s+(.*)$/m)?.[1] ?? 'Отчёт'

fs.writeFileSync(htmlPath, `<!doctype html>
<html lang="ru"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title><style>${STYLE}</style></head>
<body>${markdownToHtml(fs.readFileSync(mdPath, 'utf8'))}</body></html>`)

// Отдельный профиль: иначе headless может прицепиться к уже открытому браузеру
const profileDir = fs.mkdtempSync(path.join(os.tmpdir(), 'audit-pdf-'))
try {
  execFileSync(findBrowser(), [
    '--headless=new',
    '--disable-gpu',
    '--no-first-run',
    '--no-pdf-header-footer',
    `--user-data-dir=${profileDir}`,
    `--print-to-pdf=${pdfPath}`,
    pathToFileURL(htmlPath).href,
  ], { stdio: 'ignore', timeout: 60_000 })
}
finally {
  fs.rmSync(profileDir, { recursive: true, force: true })
}

if (!fs.existsSync(pdfPath)) {
  console.error('PDF не создан — проверьте браузер (CHROME_PATH).')
  process.exit(1)
}
console.log(JSON.stringify({ html: path.relative(process.cwd(), htmlPath), pdf: path.relative(process.cwd(), pdfPath) }))
