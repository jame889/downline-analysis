interface LRSub {
  left: number
  right: number
  leftLabel?: string
  rightLabel?: string
  unit?: string
}

interface Props {
  label: string
  value: string | number
  sub?: string
  color?: string
  lr?: LRSub
}

export default function StatsCard({ label, value, sub, color = 'text-brand-400', lr }: Props) {
  return (
    <div className="bg-slate-900 border border-slate-800 rounded-xl p-5">
      <p className="text-xs text-slate-400 uppercase tracking-wider mb-1">{label}</p>
      <p className={`text-3xl font-bold ${color}`}>{value}</p>
      {sub && <p className="text-xs text-slate-500 mt-1">{sub}</p>}
      {lr && (
        <div className="mt-3 space-y-1.5">
          {/* L/R bar */}
          {(lr.left + lr.right) > 0 && (
            <div className="flex rounded-full overflow-hidden h-1.5 bg-slate-800">
              <div
                className="bg-sky-500"
                style={{ width: `${(lr.left / (lr.left + lr.right)) * 100}%` }}
              />
              <div className="flex-1 bg-purple-500" />
            </div>
          )}
          <div className="flex justify-between text-xs">
            <span className="text-sky-400">
              {lr.leftLabel ?? 'ซ้าย'} {lr.left.toLocaleString()}{lr.unit ?? ''}
            </span>
            <span className="text-purple-400">
              {lr.rightLabel ?? 'ขวา'} {lr.right.toLocaleString()}{lr.unit ?? ''}
            </span>
          </div>
        </div>
      )}
    </div>
  )
}
