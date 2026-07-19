import type { Role } from './types'

export interface ParsedMessage { role: Role; text: string; timestamp: string | null; model: string | null }
export interface ParsedConversation { id: string; title: string; createdAt: string | null; updatedAt: string | null; messages: ParsedMessage[]; recapTexts: string[]; recapNodes: number; internalArtifactNodes: number }

const object = (value: unknown): Record<string, unknown> | null => value !== null && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : null

export function parseTimestamp(value: unknown): string | null {
  try {
    if (typeof value === 'number' && Number.isFinite(value)) return new Date(value * 1000).toISOString()
    if (typeof value === 'string' && value.trim()) {
      const date = new Date(value)
      return Number.isNaN(date.getTime()) ? null : date.toISOString()
    }
  } catch { /* Invalid export timestamps are ignored. */ }
  return null
}

function visibleText(content: Record<string, unknown>): string {
  const type = content.content_type
  if (type !== undefined && type !== 'text' && type !== 'multimodal_text') return ''
  const parts = content.parts
  if (Array.isArray(parts)) return parts.filter((part): part is string => typeof part === 'string').join('\n').trim()
  return typeof content.text === 'string' ? content.text.trim() : ''
}

export function parseConversation(raw: unknown, index = 0): ParsedConversation | null {
  const conversation = object(raw)
  if (!conversation) return null
  const idValue = conversation.id ?? conversation.conversation_id ?? index
  const id = String(idValue)
  const createdAt = parseTimestamp(conversation.create_time)
  const updatedAt = parseTimestamp(conversation.update_time)
  const mapping = object(conversation.mapping) ?? {}
  const messages: ParsedMessage[] = []; const recapTexts: string[] = []
  let recapNodes = 0; let internalArtifactNodes = 0
  for (const node of Object.values(mapping)) {
    const nodeRecord = object(node); const message = nodeRecord && object(nodeRecord.message)
    if (!message) continue
    const author = object(message.author); const role = author?.role
    const content = object(message.content)
    if (!content || (role !== 'user' && role !== 'assistant')) continue
    const timestamp = parseTimestamp(message.create_time) ?? createdAt
    const contentType = content.content_type
    if (role === 'assistant' && contentType === 'reasoning_recap') {
      recapNodes += 1
      if (typeof content.content === 'string' && content.content.trim()) recapTexts.push(content.content.trim())
      continue
    }
    if (contentType === 'thoughts') { internalArtifactNodes += 1; continue }
    const text = visibleText(content)
    if (!text) continue
    const metadata = object(message.metadata)
    const model = metadata?.model_slug ?? message.model_slug
    messages.push({ role, text, timestamp, model: typeof model === 'string' ? model : null })
  }
  messages.sort((a, b) => (a.timestamp ?? '\uffff').localeCompare(b.timestamp ?? '\uffff'))
  return { id, title: typeof conversation.title === 'string' && conversation.title.trim() ? conversation.title : 'Untitled conversation', createdAt, updatedAt, messages, recapTexts, recapNodes, internalArtifactNodes }
}
