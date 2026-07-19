import { describe, expect, it } from 'vitest'
import { parseConversation, parseTimestamp } from './parser'

describe('parseConversation', () => {
  it('extracts supported messages and classifies non-billable artifacts', () => {
    const parsed = parseConversation({ id: 'c1', title: 'Example', create_time: 1_700_000_000, mapping: { a: { message: { author: { role: 'user' }, create_time: '2024-01-02T00:00:00Z', content: { content_type: 'text', parts: ['hello', 2] } } }, b: { message: { author: { role: 'assistant' }, content: { content_type: 'multimodal_text', text: 'hi' }, metadata: { model_slug: 'gpt' } } }, c: { message: { author: { role: 'assistant' }, content: { content_type: 'reasoning_recap', content: ' recap ' } } }, d: { message: { author: { role: 'assistant' }, content: { content_type: 'thoughts', content: { private: 'do not retain' } } } } } })
    expect(parsed).toMatchObject({ id: 'c1', recapTexts: ['recap'], recapNodes: 1, internalArtifactNodes: 1 })
    expect(parsed?.messages).toEqual(expect.arrayContaining([expect.objectContaining({ role: 'user', text: 'hello' }), expect.objectContaining({ role: 'assistant', text: 'hi', model: 'gpt' })]))
  })

  it('skips malformed records without throwing', () => {
    expect(parseConversation(null)).toBeNull()
    expect(parseConversation({ mapping: { bad: {}, other: { message: { author: { role: 'tool' }, content: { parts: ['no'] } } } } })?.messages).toEqual([])
    expect(parseTimestamp('not a date')).toBeNull()
  })
})
