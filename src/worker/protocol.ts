import type { AnalysisSnapshot } from '../analysis/types'

export type AnalyzeRequest = { type: 'analyze'; file: File }
export type ExportMarkdownRequest = { type: 'exportMarkdown'; file: File }
export type WorkerRequest = AnalyzeRequest | ExportMarkdownRequest
export type ProgressEvent = { type: 'progress'; phase: 'reading' | 'parsing' | 'tokenizing' | 'finalizing'; completed: number; total?: number; detail?: string }
export type CompleteEvent = { type: 'complete'; snapshot: AnalysisSnapshot }
export type MarkdownCompleteEvent = { type: 'markdownComplete'; archive: Blob }
export type ErrorCode = 'invalid_type' | 'too_large' | 'invalid_zip' | 'no_conversation_files' | 'decompressed_limit' | 'individual_string_limit' | 'malformed_json' | 'no_valid_conversations' | 'markdown_archive_limit' | 'markdown_export_failed' | 'internal_failure'
export type ErrorEvent = { type: 'error'; code: ErrorCode; message: string }
export type WorkerEvent = ProgressEvent | CompleteEvent | MarkdownCompleteEvent | ErrorEvent
