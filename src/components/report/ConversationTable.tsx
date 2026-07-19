import { useMemo, useState } from 'react'
import type { ConversationRow } from '../../analysis/types'

type SortKey = 'title' | 'totalTokens' | 'estimatedCost'
export function ConversationTable({ rows }: { rows: ConversationRow[] }) {
  const [sort, setSort] = useState<SortKey>('estimatedCost'); const [ascending, setAscending] = useState(false)
  const sorted = useMemo(() => [...rows].sort((a, b) => { const value = sort === 'title' ? a.title.localeCompare(b.title) : a[sort] - b[sort]; return ascending ? value : -value }), [rows, sort, ascending])
  const choose = (key: SortKey) => { if (sort === key) setAscending((value) => !value); else { setSort(key); setAscending(key === 'title') } }
  return <section className="table-wrap"><h2>Top conversations</h2><table><thead><tr><th><button onClick={() => choose('title')}>Title</button></th><th>Turns</th><th><button onClick={() => choose('totalTokens')}>Tokens</button></th><th><button onClick={() => choose('estimatedCost')}>Estimated cost</button></th></tr></thead><tbody>{sorted.map((row, index) => <tr key={`${row.title}-${index}`}><td>{row.title}</td><td>{row.userTurns + row.assistantTurns}</td><td>{row.totalTokens.toLocaleString()}</td><td>${row.estimatedCost.toFixed(4)}</td></tr>)}</tbody></table></section>
}
