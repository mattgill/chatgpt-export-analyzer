import { analyzeExport, ExportAnalysisError } from './analyzeExport'
import { exportMarkdown, MarkdownExportError } from './exportMarkdown'
import type { ErrorEvent, WorkerEvent, WorkerRequest } from './protocol'

self.onmessage = (event: MessageEvent<WorkerRequest>) => {
  if (event.data.type === 'analyze') void analyzeExport(event.data.file, { onProgress: (progress) => self.postMessage(progress satisfies WorkerEvent) })
    .then((snapshot) => self.postMessage({ type: 'complete', snapshot } satisfies WorkerEvent))
    .catch((error: unknown) => {
      const result: ErrorEvent = error instanceof ExportAnalysisError ? { type: 'error', code: error.code, message: error.message } : { type: 'error', code: 'internal_failure', message: 'Analysis could not be completed.' }
      self.postMessage(result)
    })
  if (event.data.type === 'exportMarkdown') void exportMarkdown(event.data.file, { onProgress: (progress) => self.postMessage(progress satisfies WorkerEvent) })
    .then((archive) => self.postMessage({ type: 'markdownComplete', archive } satisfies WorkerEvent))
    .catch((error: unknown) => {
      const result: ErrorEvent = error instanceof MarkdownExportError ? { type: 'error', code: error.code, message: error.message } : { type: 'error', code: 'markdown_export_failed', message: 'Markdown download could not be completed.' }
      self.postMessage(result)
    })
}
