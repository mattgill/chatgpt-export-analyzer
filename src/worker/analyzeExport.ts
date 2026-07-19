import { TokenParser, Tokenizer } from '@streamparser/json'
import { Unzip, UnzipInflate } from 'fflate'
import { init, Tiktoken } from 'tiktoken/lite/init'
import wasmUrl from 'tiktoken/lite/tiktoken_bg.wasm?url'
import o200kBase from 'tiktoken/encoders/o200k_base.json'
import { AnalyticsAccumulator } from '../analysis/analytics'
import { parseConversation } from '../analysis/parser'
import type { AnalysisSnapshot, TokenizedConversation } from '../analysis/types'
import type { ErrorCode, ProgressEvent } from './protocol'

const MAX_COMPRESSED = 100 * 1024 * 1024
const MAX_EXPANDED = 1024 * 1024 * 1024
const MAX_ENTRIES = 1000
const MAX_STRING = 16 * 1024 * 1024
const conversationName = /^conversations(?:-\d+)?\.json$/

export class ExportAnalysisError extends Error { constructor(readonly code: ErrorCode, message: string) { super(message) } }
export interface AnalyzeOptions { onProgress?: (event: ProgressEvent) => void; analyzedAt?: string }

let initialized: Promise<void> | undefined
async function getEncoding(): Promise<Tiktoken> {
  initialized ??= init(async (imports) => WebAssembly.instantiate(await (await fetch(wasmUrl)).arrayBuffer(), imports))
  await initialized
  return new Tiktoken(o200kBase.bpe_ranks, o200kBase.special_tokens, o200kBase.pat_str)
}

function safeName(name: string): string { return name.replaceAll('\\', '/').split('/').at(-1) ?? '' }
function messageFor(code: ErrorCode): string {
  return ({ invalid_type: 'Choose a ChatGPT export ZIP file.', too_large: 'This ZIP is larger than the 100 MiB limit.', invalid_zip: 'This file is not a supported ZIP archive.', no_conversation_files: 'No conversations file was found in this ZIP.', decompressed_limit: 'Conversation data exceeded the safety limit.', individual_string_limit: 'A text value exceeded the safety limit.', malformed_json: 'A conversations file contains malformed JSON.', no_valid_conversations: 'No valid conversations were found.', internal_failure: 'Analysis could not be completed.' })[code]
}

export async function analyzeExport(file: Blob & { name?: string }, options: AnalyzeOptions = {}): Promise<AnalysisSnapshot> {
  const name = file.name ?? 'export.zip'
  if (!name.toLowerCase().endsWith('.zip')) throw new ExportAnalysisError('invalid_type', messageFor('invalid_type'))
  if (file.size > MAX_COMPRESSED) throw new ExportAnalysisError('too_large', messageFor('too_large'))
  const encoding = await getEncoding()
  const accumulator = new AnalyticsAccumulator()
  // Do this before tokenization. A repeated conversation in another export part
  // must not turn a cheap deduplication into repeated WASM work.
  const seenConversationIds = new Set<string>()
  let expanded = 0; let parts = 0; let validConversations = 0; let completed = 0
  const pending = new Set<Promise<void>>(); let failure: ExportAnalysisError | undefined
  const fail = (code: ErrorCode, cause?: unknown) => { if (!failure) failure = cause instanceof ExportAnalysisError ? cause : new ExportAnalysisError(code, messageFor(code)) }
  const tokenize = (raw: unknown) => {
    const parsed = parseConversation(raw, validConversations)
    if (!parsed) return
    if (seenConversationIds.has(parsed.id)) return
    seenConversationIds.add(parsed.id)
    const messages = parsed.messages.map((message) => ({ role: message.role, tokens: encoding.encode(message.text, [], []).length, characters: message.text.length, timestamp: message.timestamp, model: message.model }))
    const recapTokens = parsed.recapTexts.reduce((total, text) => total + encoding.encode(text, [], []).length, 0)
    const tokenized: TokenizedConversation = { id: parsed.id, title: parsed.title, createdAt: parsed.createdAt, updatedAt: parsed.updatedAt, messages, recapTokens, recapNodes: parsed.recapNodes, internalArtifactNodes: parsed.internalArtifactNodes }
    if (accumulator.add(tokenized)) validConversations += 1
  }
  const unzip = new Unzip((entry) => {
    if (!conversationName.test(safeName(entry.name))) return
    if (++parts > MAX_ENTRIES) { fail('decompressed_limit'); return }
    const done = new Promise<void>((resolve) => {
      const tokenParser = new TokenParser({ paths: ['$.*'], keepStack: false, emitPartialValues: true })
      const tokenizer = new Tokenizer({ emitPartialTokens: true, stringBufferSize: 64 * 1024 })
      let partialStringBytes = 0
      let ended = false
      tokenizer.onToken = (token) => {
        if (typeof token.value === 'string') {
          partialStringBytes = new TextEncoder().encode(token.value).byteLength
          if (partialStringBytes > MAX_STRING) { fail('individual_string_limit'); return }
        } else partialStringBytes = 0
        // Partial tokens are snapshots of the current value; forwarding them
        // would duplicate structural tokens in TokenParser's state machine.
        if (!token.partial) tokenParser.write(token)
      }
      tokenParser.onValue = (info) => { if (!failure) { try { tokenize(info.value) } catch { fail('malformed_json') } } }
      tokenizer.onError = () => fail('malformed_json')
      tokenParser.onError = () => fail('malformed_json')
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
    const stream = typeof file.stream === 'function'
      ? file.stream()
      : new ReadableStream<Uint8Array>({ start(controller) { void file.arrayBuffer().then((buffer) => { controller.enqueue(new Uint8Array(buffer)); controller.close() }, (error) => controller.error(error)) } })
    const reader = stream.getReader()
    let checkedHeader = false
    while (true) {
      const { done, value } = await reader.read()
      if (value) {
        if (!checkedHeader) { checkedHeader = true; if (value[0] !== 0x50 || value[1] !== 0x4b) throw new ExportAnalysisError('invalid_zip', messageFor('invalid_zip')) }
        unzip.push(value, Boolean(done)); completed += value.byteLength; options.onProgress?.({ type: 'progress', phase: 'reading', completed, total: file.size })
      }
      else if (done) unzip.push(new Uint8Array(), true)
      if (done) break
      if (failure) break
    }
    await Promise.all([...pending])
    if (failure) throw failure
    if (!parts) throw new ExportAnalysisError('no_conversation_files', messageFor('no_conversation_files'))
    if (!validConversations) throw new ExportAnalysisError('no_valid_conversations', messageFor('no_valid_conversations'))
    options.onProgress?.({ type: 'progress', phase: 'finalizing', completed: validConversations })
    return accumulator.finalize({ name, compressedBytes: file.size, conversationParts: parts }, options.analyzedAt)
  } catch (error) {
    if (error instanceof ExportAnalysisError) throw error
    throw new ExportAnalysisError('invalid_zip', messageFor('invalid_zip'))
  } finally { encoding.free() }
}
