import 'fake-indexeddb/auto'
import { beforeEach, describe, expect, it } from 'vitest'
import { SNAPSHOT_SCHEMA_VERSION, type AnalysisSnapshot } from '../analysis/types'
import { reportRepository } from './reportRepository'

const snapshot: AnalysisSnapshot = { schemaVersion: SNAPSHOT_SCHEMA_VERSION, analyzedAt: '2025-01-01T00:00:00.000Z', source: { name: 'export.zip', compressedBytes: 1, conversationParts: 1 }, totals: { conversations: 0, prompts: 0, assistantReplies: 0, inputTokens: 0, outputTokens: 0, totalTokens: 0 }, inventory: { apiInputTokens: 0, apiOutputTokens: 0, apiTotalTokens: 0, recapNodes: 0, recapTokens: 0, internalArtifactNodes: 0 }, summaryByModel: [], monthly: [], daily: [], conversationHistogram: [], metrics: { averageConversationTokens: 0, medianConversationTokens: 0, longestConversationTitle: '—', longestPromptCharacters: 0, longestReplyCharacters: 0, topDays: [] }, topConversations: [] }

describe('reportRepository', () => {
  beforeEach(async () => { await reportRepository.clear() })
  it('replaces and clears exactly one latest snapshot', async () => {
    await reportRepository.replaceLatest(snapshot)
    await expect(reportRepository.loadLatest()).resolves.toMatchObject({ snapshot, recovered: false })
    await reportRepository.clear()
    await expect(reportRepository.loadLatest()).resolves.toEqual({ snapshot: null, recovered: false })
  })
  it('rejects values outside the bounded snapshot contract', async () => {
    await expect(reportRepository.replaceLatest({ ...snapshot, topConversations: Array.from({ length: 101 }, () => ({})) } as AnalysisSnapshot)).rejects.toThrow('valid AnalysisSnapshot')
  })
})
