import { describe, expect, it } from 'vitest'
import { markdownConversation } from './markdown'
import type { ParsedConversation } from './parser'

const conversation = (overrides: Partial<ParsedConversation> = {}): ParsedConversation => ({
  id: 'conversation-1', title: 'Project Notes!', createdAt: '2024-01-02T03:04:05.000Z', updatedAt: '2024-01-03T03:04:05.000Z', recapTexts: [], recapNodes: 0, internalArtifactNodes: 0,
  messages: [{ role: 'user', text: 'hello\nworld', timestamp: '2024-01-02T03:05:00.000Z', model: null }, { role: 'assistant', text: 'hi', timestamp: null, model: 'gpt-test' }],
  ...overrides,
})

describe('markdownConversation', () => {
  it('formats visible parsed messages with metadata and a dated title slug', () => {
    const result = markdownConversation(conversation())
    expect(result.filename).toBe('2024-01-02-project-notes.md')
    expect(result.contents).toBe(`---\ntitle: "Project Notes!"\nconversation_id: "conversation-1"\ncreated_at: 2024-01-02T03:04:05.000Z\nupdated_at: 2024-01-03T03:04:05.000Z\n---\n\n# Project Notes!\n\n## User — 2024-01-02T03:05:00.000Z\n\nhello\nworld\n\n## Assistant\n\nhi\n`)
  })

  it('uses update date or undated fallback and normalizes empty/non-ASCII titles', () => {
    expect(markdownConversation(conversation({ title: 'Crème brûlée', createdAt: null, updatedAt: '2024-02-03T00:00:00.000Z' })).filename).toBe('2024-02-03-creme-brulee.md')
    expect(markdownConversation(conversation({ title: '💬', createdAt: null, updatedAt: null })).filename).toBe('undated-untitled-conversation.md')
  })
})
