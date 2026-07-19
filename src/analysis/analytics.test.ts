import { describe, expect, it } from 'vitest'
import { AnalyticsAccumulator, conversationHistogram } from './analytics'

describe('conversationHistogram', () => {
  it('handles empty, equal, and maximum-boundary values deterministically', () => {
    expect(conversationHistogram([])).toEqual([])
    expect(conversationHistogram([4, 4])).toEqual([{ lowerBound: 4, upperBound: 4, conversations: 2 }])
    const bins = conversationHistogram([0, 30]); expect(bins).toHaveLength(30); expect(bins[0].conversations).toBe(1); expect(bins[29].conversations).toBe(1)
  })
})

describe('AnalyticsAccumulator', () => {
  it('aggregates tokenized conversations once and finalizes chronological rows', () => {
    const accumulator = new AnalyticsAccumulator()
    accumulator.add({ id: 'one', title: 'A', createdAt: null, updatedAt: null, recapTokens: 2, recapNodes: 1, internalArtifactNodes: 1, messages: [{ role: 'user', tokens: 3, characters: 4, timestamp: '2025-01-02T00:00:00.000Z', model: null }, { role: 'assistant', tokens: 5, characters: 9, timestamp: '2025-01-02T01:00:00.000Z', model: null }] })
    expect(accumulator.add({ id: 'one', title: 'duplicate', createdAt: null, updatedAt: null, recapTokens: 0, recapNodes: 0, internalArtifactNodes: 0, messages: [] })).toBe(false)
    const snapshot = accumulator.finalize({ name: 'export.zip', compressedBytes: 10, conversationParts: 1 }, '2025-01-03T00:00:00.000Z')
    expect(snapshot.totals).toMatchObject({ conversations: 1, inputTokens: 3, outputTokens: 5, totalTokens: 8 })
    expect(snapshot.inventory).toMatchObject({ recapTokens: 2, recapNodes: 1, internalArtifactNodes: 1 })
    expect(snapshot.daily[0]).toMatchObject({ day: '2025-01-02', cumulativeTokens: 8 })
  })
})
