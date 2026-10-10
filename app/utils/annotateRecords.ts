import type { IssueSeverity, SourceIssue, SourceRecord } from '#shared/types/sources'

const SEVERITY_ORDER: Record<IssueSeverity, number> = { critical: 0, warning: 1, info: 2 }
const worst = (a: IssueSeverity, b: IssueSeverity) => (SEVERITY_ORDER[a] <= SEVERITY_ORDER[b] ? a : b)

interface Mark {
  severity: IssueSeverity
  /** Номера замечаний (1-based, как в списке под ответом) */
  refs: number[]
}

export interface Segment {
  text: string
  mark?: Mark
}

export interface AnnotatedLine {
  index: number
  segments: Segment[]
  /** Худшая проблема строки — для полосы слева */
  severity?: IssueSeverity
  /** Замечания без конкретного фрагмента — показываются в конце строки */
  lineRefs: number[]
}

interface Range extends Mark {
  start: number
  end: number
}

/** Добавляет ссылку в набор без повторов: одно замечание может встретиться в строке дважды */
const addRef = (refs: number[], ref: number) => (refs.includes(ref) ? refs : [...refs, ref])

function splitIntoSegments(json: string, ranges: Range[]): Segment[] {
  const segments: Segment[] = []
  let cursor = 0
  for (const { start, end, severity, refs } of ranges.sort((a, b) => a.start - b.start)) {
    if (start < cursor) continue // перекрытие — оставляем первую разметку
    if (start > cursor) segments.push({ text: json.slice(cursor, start) })
    segments.push({ text: json.slice(start, end), mark: { severity, refs } })
    cursor = end
  }
  if (cursor < json.length) segments.push({ text: json.slice(cursor) })
  return segments
}

/**
 * Размечает записи ответа: какие фрагменты подсветить и на какие замечания сослаться.
 * Номер замечания = его позиция в списке issues + 1.
 */
export function annotateRecords(records: SourceRecord[], issues: SourceIssue[]): AnnotatedLine[] {
  return records.map(({ index, json }) => {
    const ranges: Range[] = []
    let lineRefs: number[] = []
    let severity: IssueSeverity | undefined

    issues.forEach((issue, position) => {
      const ref = position + 1
      for (const occurrence of issue.occurrences) {
        if (occurrence.index !== index) continue
        severity = severity ? worst(severity, issue.severity) : issue.severity

        const start = occurrence.fragment ? json.indexOf(occurrence.fragment) : -1
        if (start === -1) {
          lineRefs = addRef(lineRefs, ref)
          continue
        }
        const end = start + occurrence.fragment!.length
        const same = ranges.find(range => range.start === start && range.end === end)
        if (same) {
          same.refs = addRef(same.refs, ref)
          same.severity = worst(same.severity, issue.severity)
        }
        else {
          ranges.push({ start, end, severity: issue.severity, refs: [ref] })
        }
      }
    })

    return { index, segments: splitIntoSegments(json, ranges), severity, lineRefs }
  })
}
