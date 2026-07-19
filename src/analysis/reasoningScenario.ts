import { estimateCost, pricing } from './pricing'

export function roundTiesToEven(value: number): number {
  const floor = Math.floor(value); const fraction = value - floor
  if (fraction < 0.5) return floor
  if (fraction > 0.5) return floor + 1
  return floor % 2 === 0 ? floor : floor + 1
}

export function reasoningScenario(inputTokens: number, outputTokens: number, multiplier: number) {
  if (!Number.isFinite(multiplier) || multiplier < 0) throw new Error('Enter a finite multiplier of zero or more.')
  const estimatedReasoningTokens = roundTiesToEven(outputTokens * multiplier)
  return { outputMultiplier: multiplier, estimatedReasoningTokens, rows: pricing.map((model) => {
    const visibleCost = estimateCost(inputTokens, outputTokens, model); const scenarioCost = estimateCost(inputTokens, outputTokens + estimatedReasoningTokens, model)
    return { model: model.name, visibleCost, scenarioCost, additionalCost: scenarioCost - visibleCost }
  }) }
}
