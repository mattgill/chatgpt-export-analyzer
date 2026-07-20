import Plot from 'react-plotly.js'
import type { Data, Layout } from 'plotly.js'
import { useTheme } from '../../hooks/useTheme'

export function Chart({ title, data, layout = {} }: { title: string; data: Data[]; layout?: Partial<Layout> }) {
  const { theme } = useTheme()
  const hasValues = data.some((series) => {
    const values = series as { x?: unknown[]; y?: unknown[] }
    return Boolean(values.x?.length || values.y?.length)
  })
  if (!hasValues) return <section className="chart empty-chart"><h2>{title}</h2><p>No dated data is available for this chart.</p></section>
  const colors = theme === 'dark' ? { font: '#dbe7f5', axis: '#91a4bb', grid: '#34475f' } : { font: '#26364a', axis: '#526174', grid: '#e2e8f2' }
  return <section className="chart"><h2>{title}</h2><Plot data={data} layout={{ autosize: true, margin: { l: 56, r: 24, t: 16, b: 48 }, paper_bgcolor: 'transparent', plot_bgcolor: 'transparent', font: { color: colors.font }, xaxis: { color: colors.axis, gridcolor: colors.grid, zerolinecolor: colors.grid }, yaxis: { color: colors.axis, gridcolor: colors.grid, zerolinecolor: colors.grid }, ...layout }} config={{ displayModeBar: false, responsive: true }} useResizeHandler style={{ width: '100%', height: '320px' }} /></section>
}
