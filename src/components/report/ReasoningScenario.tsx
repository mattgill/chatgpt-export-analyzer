import { useState } from 'react'
import { reasoningScenario } from '../../analysis/reasoningScenario'

export function ReasoningScenario({ inputTokens, outputTokens }: { inputTokens: number; outputTokens: number }) {
  const [value, setValue] = useState(''); const [error, setError] = useState<string | null>(null)
  const multiplier = value === '' ? null : Number(value)
  const scenario = multiplier === null || !Number.isFinite(multiplier) || multiplier < 0 ? null : reasoningScenario(inputTokens, outputTokens, multiplier)
  const change = (next: string) => { setValue(next); setError(next !== '' && (!Number.isFinite(Number(next)) || Number(next) < 0) ? 'Enter a finite multiplier of zero or more.' : null) }
  return <section className="insights"><h2>What-if reasoning overhead</h2><p>Scenario only: this estimates additional hidden output tokens per visible assistant-output token. It is not measured from your export.</p><label>Multiplier <input aria-label="Reasoning multiplier" type="number" min="0" step="any" value={value} onChange={(event) => change(event.target.value)} /></label>{error && <p role="alert" className="error">{error}</p>}{scenario && <><p>Estimated additional tokens: {scenario.estimatedReasoningTokens.toLocaleString()}</p><ul>{scenario.rows.map((row) => <li key={row.model}>{row.model}: ${row.visibleCost.toFixed(4)} visible, ${row.additionalCost.toFixed(4)} additional</li>)}</ul></>}</section>
}
