import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { beforeEach, describe, expect, it, vi } from 'vitest'
vi.mock('react-plotly.js', () => ({ default: () => null }))
import { ReportPage } from './ReportPage'
import { ExportSessionProvider } from '../export/ExportSession'
import { reportRepository } from '../storage/reportRepository'
import type { AnalysisSnapshot } from '../analysis/types'

const snapshot: AnalysisSnapshot = {
  schemaVersion: 1, analyzedAt: '2025-01-01T00:00:00.000Z', source: { name: 'export.zip', compressedBytes: 1, conversationParts: 1 }, totals: { conversations: 1, prompts: 1, assistantReplies: 1, inputTokens: 1, outputTokens: 1, totalTokens: 2 }, inventory: { apiInputTokens: 1, apiOutputTokens: 1, apiTotalTokens: 2, recapNodes: 0, recapTokens: 0, internalArtifactNodes: 0 }, summaryByModel: [], monthly: [], daily: [], conversationHistogram: [], metrics: { averageConversationTokens: 2, medianConversationTokens: 2, longestConversationTitle: 'Example', longestPromptCharacters: 1, longestReplyCharacters: 1, topDays: [] }, topConversations: [],
}

describe('ReportPage', () => {
  beforeEach(async () => { await reportRepository.clear() })
  it('shows a useful empty state when no report is stored', async () => {
    render(<HashRouter><ReportPage /></HashRouter>)
    expect(await screen.findByText(/no local report yet/i)).toBeInTheDocument()
  })

  it('requires re-upload for a restored report when its source ZIP is not in session', async () => {
    await reportRepository.replaceLatest(snapshot)
    render(<ExportSessionProvider><HashRouter><ReportPage /></HashRouter></ExportSessionProvider>)
    expect(await screen.findByText(/re-upload the export to download markdown/i)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /download markdown zip/i })).not.toBeInTheDocument()
  })

  it('enables Markdown download while the successful source ZIP remains in session', async () => {
    await reportRepository.replaceLatest(snapshot)
    render(<ExportSessionProvider initialSourceFile={new File(['zip'], 'export.zip', { type: 'application/zip' })}><HashRouter><ReportPage /></HashRouter></ExportSessionProvider>)
    expect(await screen.findByRole('button', { name: /download markdown zip/i })).toBeEnabled()
  })
})
