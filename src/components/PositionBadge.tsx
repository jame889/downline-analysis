import { POSITION_LABEL } from '@/lib/types'
import clsx from 'clsx'

const colors: Record<string, string> = {
  FA: 'bg-slate-700 text-slate-300',
  BR: 'bg-orange-900/60 text-orange-300',
  ST: 'bg-yellow-900/60 text-yellow-300',
  SV: 'bg-purple-900/60 text-purple-300',
}

export default function PositionBadge({ pos }: { pos: string }) {
  return (
    <span className={clsx('text-xs px-2 py-0.5 rounded-full font-medium', colors[pos] ?? 'bg-slate-800 text-slate-400')}>
      {POSITION_LABEL[pos as keyof typeof POSITION_LABEL] ?? pos}
    </span>
  )
}
