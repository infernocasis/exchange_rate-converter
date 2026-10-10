import type { SourceTone } from './describeDataSource'

interface ToneClasses {
  /** Цвет текста статуса */
  text: string
  /** Точка-индикатор */
  dot: string
  /** Полоса слева у строки ответа */
  bar: string
  /** Волнистое подчёркивание фрагмента */
  mark: string
  /** Кружок с номером замечания */
  badge: string
}

/** Полные имена классов — Tailwind должен видеть их в исходниках целиком */
export const TONE_CLASSES: Record<SourceTone, ToneClasses> = {
  down: {
    text: 'text-red-700',
    dot: 'bg-red-600',
    bar: 'border-red-500',
    mark: 'decoration-red-600 bg-red-50',
    badge: 'bg-red-600 text-white',
  },
  critical: {
    text: 'text-red-700',
    dot: 'bg-red-600',
    bar: 'border-red-500',
    mark: 'decoration-red-600 bg-red-50',
    badge: 'bg-red-600 text-white',
  },
  warning: {
    text: 'text-amber-700',
    dot: 'bg-amber-500',
    bar: 'border-amber-400',
    mark: 'decoration-amber-500 bg-amber-50',
    badge: 'bg-amber-400 text-amber-950',
  },
  info: {
    text: 'text-slate-600',
    dot: 'bg-slate-400',
    bar: 'border-slate-300',
    mark: 'decoration-slate-400',
    badge: 'bg-slate-200 text-slate-700',
  },
  ok: {
    text: 'text-emerald-700',
    dot: 'bg-emerald-500',
    bar: 'border-transparent',
    mark: '',
    badge: 'bg-emerald-100 text-emerald-800',
  },
}
