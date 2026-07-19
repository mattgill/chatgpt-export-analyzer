import { init, Tiktoken } from 'tiktoken/lite/init'
import wasmUrl from 'tiktoken/lite/tiktoken_bg.wasm?url'
import o200kBase from 'tiktoken/encoders/o200k_base.json'
import { AnalyticsAccumulator } from '../analysis/analytics'
import type { AnalysisSnapshot, TokenizedConversation } from '../analysis/types'
import type { ErrorCode, ProgressEvent } from './protocol'
import { ConversationExportError, errorMessage, readConversations } from './readConversations'

export class ExportAnalysisError extends Error { constructor(readonly code: ErrorCode, message: string) { super(message) } }
export interface AnalyzeOptions { onProgress?: (event: ProgressEvent) => void; analyzedAt?: string }

let initialized: Promise<void> | undefined
async function getEncoding(): Promise<Tiktoken> {
  initialized ??= init(async (imports) => WebAssembly.instantiate(await (await fetch(wasmUrl)).arrayBuffer(), imports))
  await initialized
  return new Tiktoken(o200kBase.bpe_ranks, o200kBase.special_tokens, o200kBase.pat_str)
}

export async function analyzeExport(file: Blob & { name?: string }, options: AnalyzeOptions = {}): Promise<AnalysisSnapshot> {
  const encoding = await getEncoding(); const accumulator = new AnalyticsAccumulator()
  try {
    const source = await readConversations(file, {
      onProgress: options.onProgress,
      onConversation: (parsed) => {
        const messages = parsed.messages.map((message) => ({ role: message.role, tokens: encoding.encode(message.text, [], []).length, characters: message.text.length, timestamp: message.timestamp, model: message.model }))
        const recapTokens = parsed.recapTexts.reduce((total, text) => total + encoding.encode(text, [], []).length, 0)
        const tokenized: TokenizedConversation = { id: parsed.id, title: parsed.title, createdAt: parsed.createdAt, updatedAt: parsed.updatedAt, messages, recapTokens, recapNodes: parsed.recapNodes, internalArtifactNodes: parsed.internalArtifactNodes }
        accumulator.add(tokenized)
      },
    })
    options.onProgress?.({ type: 'progress', phase: 'finalizing', completed: source.conversations })
    return accumulator.finalize({ name: source.name, compressedBytes: file.size, conversationParts: source.parts }, options.analyzedAt)
  } catch (error) {
    if (error instanceof ConversationExportError) throw new ExportAnalysisError(error.code, error.message)
    throw new ExportAnalysisError('internal_failure', errorMessage('internal_failure'))
  } finally { encoding.free() }
}
