import { useState } from 'react'
import { buttonStyles, Modal } from '../components/ui/Modal'
import { MAX_SERIES } from './palette'
import type { ChartData, ChartKind } from './nodes/ChartNode'

const MAX_ROWS = 40
const KINDS: { value: ChartKind; label: string; hint: string }[] = [
  { value: 'bar', label: 'Bar', hint: 'compare amounts' },
  { value: 'line', label: 'Line', hint: 'change over time' },
  { value: 'pie', label: 'Pie', hint: 'parts of one whole' },
]

const cell = 'w-full rounded px-2 py-1.5 text-sm outline-none focus:ring-2'
const cellStyle = { background: 'var(--bg)', border: '1px solid var(--border)' }

/** Edits a chart's type, title and numbers as a small table. */
export default function ChartDialog({
  open,
  value,
  onSave,
  onClose,
}: {
  open: boolean
  value: ChartData
  onSave: (value: ChartData) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<ChartData>(() => structuredClone(value))
  const pie = draft.chartType === 'pie'
  // A pie shows one set of numbers, so only its first series is edited.
  const series = pie ? draft.series.slice(0, 1) : draft.series

  const patch = (next: Partial<ChartData>) => setDraft((d) => ({ ...d, ...next }))

  const setValue = (row: number, col: number, raw: string) => {
    const next = structuredClone(draft.series)
    next[col].values[row] = raw.trim() === '' ? 0 : Number(raw) || 0
    patch({ series: next })
  }

  const addRow = () => {
    if (draft.labels.length >= MAX_ROWS) return
    patch({
      labels: [...draft.labels, `Item ${draft.labels.length + 1}`],
      series: draft.series.map((s) => ({ ...s, values: [...s.values, 0] })),
    })
  }

  const removeRow = (row: number) => {
    if (draft.labels.length <= 1) return
    patch({
      labels: draft.labels.filter((_, i) => i !== row),
      series: draft.series.map((s) => ({ ...s, values: s.values.filter((_, i) => i !== row) })),
    })
  }

  const addSeries = () => {
    if (draft.series.length >= MAX_SERIES) return
    patch({ series: [...draft.series, { name: `Series ${draft.series.length + 1}`, values: draft.labels.map(() => 0) }] })
  }

  const removeSeries = (col: number) => {
    if (draft.series.length <= 1) return
    patch({ series: draft.series.filter((_, i) => i !== col) })
  }

  return (
    <Modal open={open} onClose={onClose} title="Chart" width="max-w-2xl">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-sm">
            <span style={{ color: 'var(--muted)' }}>Title</span>
            <input
              value={draft.title}
              onChange={(e) => patch({ title: e.target.value })}
              maxLength={120}
              aria-label="Chart title"
              className={`${cell} w-56`}
              style={cellStyle}
            />
          </label>
          <div className="flex gap-2" role="group" aria-label="Chart type">
            {KINDS.map((kind) => (
              <button
                key={kind.value}
                type="button"
                onClick={() => patch({ chartType: kind.value })}
                aria-pressed={draft.chartType === kind.value}
                title={kind.hint}
                className={buttonStyles.base}
                style={draft.chartType === kind.value ? buttonStyles.primary : buttonStyles.plain}
              >
                {kind.label}
              </button>
            ))}
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr>
                <th className="pr-2 pb-2 text-left text-xs font-medium" style={{ color: 'var(--muted)' }}>
                  {pie ? 'Slice' : 'Label'}
                </th>
                {series.map((s, col) => (
                  <th key={col} className="pr-2 pb-2">
                    <span className="flex items-center gap-1">
                      <input
                        value={s.name}
                        onChange={(e) => {
                          const next = structuredClone(draft.series)
                          next[col].name = e.target.value
                          patch({ series: next })
                        }}
                        maxLength={60}
                        aria-label={`Series ${col + 1} name`}
                        className={cell}
                        style={cellStyle}
                      />
                      {!pie && draft.series.length > 1 && (
                        <button type="button" onClick={() => removeSeries(col)} aria-label={`Remove series ${s.name}`} className="px-1 text-xs" style={{ color: 'var(--danger)' }}>
                          ✕
                        </button>
                      )}
                    </span>
                  </th>
                ))}
                <th className="pb-2" />
              </tr>
            </thead>
            <tbody>
              {draft.labels.map((label, row) => (
                <tr key={row}>
                  <td className="pr-2 pb-2">
                    <input
                      value={label}
                      onChange={(e) => patch({ labels: draft.labels.map((l, i) => (i === row ? e.target.value : l)) })}
                      maxLength={60}
                      aria-label={`Label ${row + 1}`}
                      className={cell}
                      style={cellStyle}
                    />
                  </td>
                  {series.map((s, col) => (
                    <td key={col} className="pr-2 pb-2">
                      <input
                        value={String(s.values[row] ?? 0)}
                        onChange={(e) => setValue(row, col, e.target.value)}
                        inputMode="decimal"
                        aria-label={`${s.name}, ${label || `row ${row + 1}`}`}
                        className={cell}
                        style={cellStyle}
                      />
                    </td>
                  ))}
                  <td className="pb-2">
                    {draft.labels.length > 1 && (
                      <button type="button" onClick={() => removeRow(row)} aria-label={`Remove row ${label || row + 1}`} className="px-1 text-xs" style={{ color: 'var(--danger)' }}>
                        ✕
                      </button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        <div className="flex flex-wrap gap-2">
          <button type="button" onClick={addRow} disabled={draft.labels.length >= MAX_ROWS} className={buttonStyles.base} style={buttonStyles.plain}>
            + Row
          </button>
          {!pie && (
            <button type="button" onClick={addSeries} disabled={draft.series.length >= MAX_SERIES} className={buttonStyles.base} style={buttonStyles.plain}>
              + Series
            </button>
          )}
        </div>

        <div className="flex justify-end gap-3">
          <button type="button" onClick={onClose} className={buttonStyles.base} style={buttonStyles.plain}>
            Cancel
          </button>
          <button type="button" onClick={() => onSave(draft)} className={buttonStyles.base} style={buttonStyles.primary}>
            Save chart
          </button>
        </div>
      </div>
    </Modal>
  )
}
