import { Zip, ZipDeflate } from 'fflate'
import { markdownConversation } from '../analysis/markdown'
import type { ErrorCode, ProgressEvent } from './protocol'
import { ConversationExportError, errorMessage, readConversations } from './readConversations'

const MAX_ARCHIVE = 1024 * 1024 * 1024
export class MarkdownExportError extends Error { constructor(readonly code: ErrorCode, message: string) { super(message) } }
export interface MarkdownExportOptions { onProgress?: (event: ProgressEvent) => void }

export async function exportMarkdown(file: Blob & { name?: string }, options: MarkdownExportOptions = {}): Promise<Blob> {
  const chunks: Uint8Array[] = []; let bytes = 0; let failure: MarkdownExportError | undefined
  const archive = new Zip((error, chunk) => {
    if (error) { failure ??= new MarkdownExportError('markdown_export_failed', errorMessage('markdown_export_failed')); return }
    bytes += chunk.byteLength
    if (bytes > MAX_ARCHIVE) { failure ??= new MarkdownExportError('markdown_archive_limit', errorMessage('markdown_archive_limit')); archive.terminate(); return }
    chunks.push(chunk)
  })
  const names = new Map<string, number>(); const encoder = new TextEncoder()
  try {
    await readConversations(file, {
      onProgress: options.onProgress,
      onConversation: (conversation) => {
        if (failure) return
        const markdown = markdownConversation(conversation); const base = markdown.filename.slice(0, -3)
        const count = (names.get(base) ?? 0) + 1; names.set(base, count)
        const entry = new ZipDeflate(`${base}${count === 1 ? '' : `-${count}`}.md`)
        archive.add(entry); entry.push(encoder.encode(markdown.contents), true)
      },
    })
    if (failure) throw failure
    const completed = new Promise<void>((resolve, reject) => {
      const previous = archive.ondata
      archive.ondata = (error, chunk, final) => {
        previous(error, chunk, final)
        if (error || failure) reject(failure ?? new MarkdownExportError('markdown_export_failed', errorMessage('markdown_export_failed')))
        else if (final) resolve()
      }
    })
    archive.end(); await completed
    return new Blob(chunks.map((chunk) => new Uint8Array(chunk)), { type: 'application/zip' })
  } catch (error) {
    archive.terminate()
    if (error instanceof ConversationExportError || error instanceof MarkdownExportError) throw error
    throw new MarkdownExportError('markdown_export_failed', errorMessage('markdown_export_failed'))
  }
}
