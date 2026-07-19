import rawPricing from '../../pricing.json'

export interface PricingModel { name: string; inputPerMillion: number; outputPerMillion: number }

export function loadPricing(input: unknown = rawPricing): PricingModel[] {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new Error('Pricing configuration must be an object')
  return Object.entries(input).map(([name, rates]) => {
    if (!rates || typeof rates !== 'object' || Array.isArray(rates)) throw new Error(`Pricing for ${name} must be an object`)
    const record = rates as Record<string, unknown>
    const inputRate = record.input
    const outputRate = record.output
    if (typeof inputRate !== 'number' || !Number.isFinite(inputRate) || typeof outputRate !== 'number' || !Number.isFinite(outputRate)) {
      throw new Error(`Pricing for ${name} needs numeric input and output rates`)
    }
    return { name, inputPerMillion: inputRate, outputPerMillion: outputRate }
  })
}

export const pricing = loadPricing()
export const estimateCost = (inputTokens: number, outputTokens: number, model: PricingModel | undefined): number =>
  model ? (inputTokens * model.inputPerMillion + outputTokens * model.outputPerMillion) / 1_000_000 : 0
