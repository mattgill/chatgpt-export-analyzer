import { analyzeExport, ExportAnalysisError } from './analyzeExport'
import type { AnalyzeRequest, ErrorEvent, WorkerEvent } from './protocol'

self.onmessage = (event: MessageEvent<AnalyzeRequest>) => {
  if (event.data.type !== 'analyze') return
  void analyzeExport(event.data.file, { onProgress: (progress) => self.postMessage(progress satisfies WorkerEvent) })
    .then((snapshot) => self.postMessage({ type: 'complete', snapshot } satisfies WorkerEvent))
    .catch((error: unknown) => {
      const result: ErrorEvent = error instanceof ExportAnalysisError ? { type: 'error', code: error.code, message: error.message } : { type: 'error', code: 'internal_failure', message: 'Analysis could not be completed.' }
      self.postMessage(result)
    })
}
