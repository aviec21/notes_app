import { mergeAttributes, Node } from '@tiptap/core'
import { NodeViewWrapper, ReactNodeViewRenderer, type NodeViewProps } from '@tiptap/react'
import { useEffect, useRef, useState } from 'react'
import { useIsDark } from '../../theme'
import { chartTheme } from '../palette'
import ChartDialog from '../ChartDialog'

export type ChartKind = 'bar' | 'line' | 'pie'

export interface ChartSeries {
  name: string
  values: number[]
}

export interface ChartData {
  chartType: ChartKind
  title: string
  labels: string[]
  series: ChartSeries[]
}

export const EMPTY_CHART: ChartData = {
  chartType: 'bar',
  title: 'Chart',
  labels: ['One', 'Two', 'Three'],
  series: [{ name: 'Series 1', values: [3, 5, 2] }],
}

/** Draws the chart, with the numbers underneath as a table that anyone can read. */
function ChartView({ node, selected, updateAttributes, deleteNode, editor }: NodeViewProps) {
  const data = node.attrs as ChartData
  const canvas = useRef<HTMLCanvasElement>(null)
  const dark = useIsDark()
  const [editing, setEditing] = useState(false)
  const [failed, setFailed] = useState(false)

  useEffect(() => {
    const element = canvas.current
    if (!element?.getContext('2d')) return // no canvas support: the table below still shows
    let chart: { destroy: () => void } | undefined
    let cancelled = false

    void (async () => {
      try {
        const { Chart, registerables } = await import('chart.js')
        if (cancelled || !canvas.current) return
        Chart.register(...registerables)
        const theme = chartTheme(dark)
        const colour = (i: number) => theme.series[i % theme.series.length]
        const pie = data.chartType === 'pie'
        chart = new Chart(canvas.current, {
          type: data.chartType,
          data: {
            labels: data.labels,
            datasets: pie
              ? [
                  {
                    label: data.series[0]?.name ?? '',
                    data: data.series[0]?.values ?? [],
                    backgroundColor: data.labels.map((_, i) => colour(i)),
                    // A 2px gap in the surface colour keeps neighbouring slices apart.
                    borderColor: theme.surface,
                    borderWidth: 2,
                  },
                ]
              : data.series.map((s, i) => ({
                  label: s.name,
                  data: s.values,
                  backgroundColor: colour(i),
                  borderColor: colour(i),
                  borderWidth: 2,
                  borderRadius: 4,
                  pointRadius: 4,
                  pointHoverRadius: 6,
                  tension: 0.25,
                  fill: false,
                })),
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false,
            interaction: { mode: 'index', intersect: false },
            plugins: {
              // One series names itself in the note's title; two or more need a legend.
              legend: { display: pie || data.series.length > 1, labels: { color: theme.ink, boxWidth: 12, usePointStyle: true } },
              tooltip: { backgroundColor: theme.surface, titleColor: theme.ink, bodyColor: theme.ink, borderColor: theme.grid, borderWidth: 1 },
            },
            scales: pie
              ? undefined
              : {
                  x: { ticks: { color: theme.muted }, grid: { display: false }, border: { color: theme.grid } },
                  y: { ticks: { color: theme.muted }, grid: { color: theme.grid }, border: { display: false }, beginAtZero: true },
                },
          },
        })
      } catch {
        if (!cancelled) setFailed(true)
      }
    })()

    return () => {
      cancelled = true
      chart?.destroy()
    }
  }, [data, dark])

  const editable = editor.isEditable
  return (
    <NodeViewWrapper
      as="figure"
      className="my-3 rounded-xl p-3"
      style={{ background: 'var(--surface)', border: `1px solid ${selected ? 'var(--accent)' : 'var(--border)'}` }}
      data-drag-handle
    >
      <div className="mb-2 flex items-center justify-between gap-3" contentEditable={false}>
        <figcaption className="truncate text-sm font-medium">{data.title || 'Chart'}</figcaption>
        {editable && (
          <span className="flex shrink-0 gap-1">
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={() => setEditing(true)} className="rounded px-2 py-1 text-xs" style={{ border: '1px solid var(--border)' }}>
              Edit chart
            </button>
            <button type="button" onMouseDown={(e) => e.preventDefault()} onClick={deleteNode} className="rounded px-2 py-1 text-xs" style={{ border: '1px solid var(--border)', color: 'var(--danger)' }}>
              Remove
            </button>
          </span>
        )}
      </div>

      <div className="relative h-64" contentEditable={false}>
        <canvas ref={canvas} role="img" aria-label={`${data.chartType} chart: ${data.title}`} />
      </div>
      {failed && (
        <p className="mt-2 text-xs" style={{ color: 'var(--muted)' }}>
          The chart could not be drawn here, but the numbers are below.
        </p>
      )}

      <details className="mt-2 text-sm" contentEditable={false}>
        <summary className="cursor-pointer text-xs" style={{ color: 'var(--muted)' }}>
          Data table
        </summary>
        <div className="mt-2 overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead>
              <tr>
                <th className="pr-3 pb-1"> </th>
                {data.series.map((s) => (
                  <th key={s.name} className="pr-3 pb-1">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {data.labels.map((label, row) => (
                <tr key={label + row}>
                  <th className="pr-3 font-normal" style={{ color: 'var(--muted)' }}>
                    {label}
                  </th>
                  {data.series.map((s) => (
                    <td key={s.name} className="pr-3">
                      {s.values[row] ?? ''}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </details>

      {editing && (
        <ChartDialog
          open
          value={data}
          onSave={(next) => {
            updateAttributes(next)
            setEditing(false)
          }}
          onClose={() => setEditing(false)}
        />
      )}
    </NodeViewWrapper>
  )
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    chart: {
      /** Inserts a starter chart, ready to be edited. */
      insertChart: () => ReturnType
    }
  }
}

/** A chart whose numbers stay editable (it is data in the note, not a picture of a chart). */
export const ChartBlock = Node.create({
  name: 'chart',
  group: 'block',
  atom: true,
  draggable: true,

  addAttributes() {
    return {
      chartType: { default: EMPTY_CHART.chartType },
      title: { default: EMPTY_CHART.title },
      labels: { default: EMPTY_CHART.labels },
      series: { default: EMPTY_CHART.series },
    }
  },

  parseHTML() {
    return [
      {
        tag: 'div[data-chart]',
        getAttrs: (el) => {
          try {
            return JSON.parse((el as HTMLElement).getAttribute('data-chart') ?? '') as ChartData
          } catch {
            return false
          }
        },
      },
    ]
  },

  renderHTML({ HTMLAttributes }) {
    const data = HTMLAttributes as unknown as ChartData
    return ['div', mergeAttributes({ 'data-chart': JSON.stringify(data) }), data.title ?? 'Chart']
  },

  addCommands() {
    return {
      insertChart:
        () =>
        ({ commands }) =>
          commands.insertContent({ type: this.name, attrs: structuredClone(EMPTY_CHART) }),
    }
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartView)
  },
})
