import { TokenParser, Tokenizer } from '@streamparser/json'
import { Unzip, UnzipInflate } from 'fflate'
import { parseConversation, type ParsedConversation } from '../analysis/parser'
import type { ErrorCode, ProgressEvent } from './protocol'

const MAX_COMPRESSED = 100 * 1024 * 1024
const MAX_EXPANDED = 1024 * 1024 * 1024
const MAX_ENTRIES = 1000
const MAX_STRING = 16 * 1024 * 1024
const conversationName = /^conversations(?:-\d+)?\.json$/

export class ConversationExportError extends Error { constructor(readonly code: ErrorCode, message: string) { super(message) } }
export const errorMessage = (code: ErrorCode): string => ({
  invalid_type: 'Choose a ChatGPT export ZIP file.', too_large: 'This ZIP is larger than the 100 MiB limit.', invalid_zip: 'This file is not a supported ZIP archive.', no_conversation_files: 'No conversations file was found in this ZIP.', decompressed_limit: 'Conversation data exceeded the safety limit.', individual_string_limit: 'A text value exceeded the safety limit.', malformed_json: 'A conversations file contains malformed JSON.', no_valid_conversations: 'No valid conversations were found.', markdown_archive_limit: 'Markdown download exceeded the 1 GiB safety limit.', markdown_export_failed: 'Markdown download could not be completed.', internal_failure: 'Analysis could not be completed.',
})[code]

const safeName = (name: string): string => name.replaceAll('\\', '/').split('/').at(-1) ?? ''
export interface ReadOptions { onConversation(conversation: ParsedConversation): void; onProgress?: (event: ProgressEvent) => void }

export async function readConversations(file: Blob & { name?: string }, options: ReadOptions): Promise<{ name: string; parts: number; conversations: number }> {
  const name = file.name ?? 'export.zip'
  if (!name.toLowerCase().endsWith('.zip')) throw new ConversationExportError('invalid_type', errorMessage('invalid_type'))
  if (file.size > MAX_COMPRESSED) throw new ConversationExportError('too_large', errorMessage('too_large'))
  const seen = new Set<string>(); const pending = new Set<Promise<void>>()
  let expanded = 0; let parts = 0; let conversations = 0; let completed = 0; let failure: ConversationExportError | undefined
  const fail = (code: ErrorCode) => { if (!failure) failure = new ConversationExportError(code, errorMessage(code)) }
  const consume = (raw: unknown) => {
    const parsed = parseConversation(raw, conversations)
    if (!parsed || seen.has(parsed.id)) return
    seen.add(parsed.id); options.onConversation(parsed); conversations += 1
  }
  const unzip = new Unzip((entry) => {
    if (!conversationName.test(safeName(entry.name))) return
    if (++parts > MAX_ENTRIES) { fail('decompressed_limit'); return }
    const done = new Promise<void>((resolve) => {
      const tokenParser = new TokenParser({ paths: ['$.*'], keepStack: false, emitPartialValues: true })
      const tokenizer = new Tokenizer({ emitPartialTokens: true, stringBufferSize: 64 * 1024 })
      let partialStringBytes = 0; let ended = false
      tokenizer.onToken = (token) => {
        if (typeof token.value === 'string') {
          partialStringBytes = new TextEncoder().encode(token.value).byteLength
          if (partialStringBytes > MAX_STRING) { fail('individual_string_limit'); return }
        } else partialStringBytes = 0
        if (!token.partial) tokenParser.write(token)
      }
      tokenParser.onValue = (info) => { if (!failure) { try { consume(info.value) } catch { fail('malformed_json') } } }
      tokenizer.onError = () => fail('malformed_json'); tokenParser.onError = () => fail('malformed_json')
      entry.ondata = (error, chunk, final) => {
        if (error) fail('invalid_zip')
        if (chunk) {
          expanded += chunk.byteLength
          if (expanded > MAX_EXPANDED) fail('decompressed_limit')
          if (!failure) { try { tokenizer.write(chunk) } catch { fail('malformed_json') } }
        }
        if (final && !ended) { ended = true; if (!failure) { try { tokenizer.end(); if (!tokenParser.isEnded) tokenParser.end() } catch { fail('malformed_json') } }; resolve() }
      }
      entry.start()
    })
    pending.add(done); void done.finally(() => pending.delete(done))
  })
  unzip.register(UnzipInflate)
  try {
    const stream = typeof file.stream === 'function' ? file.stream() : new ReadableStream<Uint8Array>({ start(controller) { void file.arrayBuffer().then((buffer) => { controller.enqueue(new Uint8Array(buffer)); controller.close() }, (error) => controller.error(error)) } })
    const reader = stream.getReader(); let checkedHeader = false
    while (true) {
      const { done, value } = await reader.read()
      if (value) {
        if (!checkedHeader) { checkedHeader = true; if (value[0] !== 0x50 || value[1] !== 0x4b) throw new ConversationExportError('invalid_zip', errorMessage('invalid_zip')) }
        unzip.push(value, Boolean(done)); completed += value.byteLength; options.onProgress?.({ type: 'progress', phase: 'reading', completed, total: file.size })
      } else if (done) unzip.push(new Uint8Array(), true)
      if (done || failure) break
    }
    await Promise.all([...pending])
    if (failure) throw failure
    if (!parts) throw new ConversationExportError('no_conversation_files', errorMessage('no_conversation_files'))
    if (!conversations) throw new ConversationExportError('no_valid_conversations', errorMessage('no_valid_conversations'))
    return { name, parts, conversations }
  } catch (error) {
    if (error instanceof ConversationExportError) throw error
    throw new ConversationExportError('invalid_zip', errorMessage('invalid_zip'))
  }
}
