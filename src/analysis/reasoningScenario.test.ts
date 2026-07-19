import { describe, expect, it } from 'vitest'
import { reasoningScenario, roundTiesToEven } from './reasoningScenario'

describe('reasoningScenario', () => {
  it('uses Python-compatible ties-to-even rounding', () => { expect(roundTiesToEven(2.5)).toBe(2); expect(roundTiesToEven(3.5)).toBe(4) })
  it('does not accept invalid multipliers', () => { expect(() => reasoningScenario(1, 5, -1)).toThrow(); expect(() => reasoningScenario(1, 5, Infinity)).toThrow() })
  it('keeps visible tokens distinct from the user scenario', () => { expect(reasoningScenario(2, 5, 0.5)).toMatchObject({ estimatedReasoningTokens: 2 }) })
})
