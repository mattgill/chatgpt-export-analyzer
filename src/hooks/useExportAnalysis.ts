import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { reportRepository } from '../storage/reportRepository'
import type { WorkerEvent } from '../worker/protocol'

const MAX_BYTES = 100 * 1024 * 1024
export type AnalysisState = { phase: string | null; completed: number; total?: number; error: string | null; active: boolean }
export interface ExportAnalysisSession { clearSource(): void; setSourceFile(file: File): void }

export function useExportAnalysis(session: ExportAnalysisSession) {
  const navigate = useNavigate(); const worker = useRef<Worker | null>(null); const run = useRef(0)
  const [state, setState] = useState<AnalysisState>({ phase: null, completed: 0, error: null, active: false })
  const cancel = useCallback(() => { run.current += 1; worker.current?.terminate(); worker.current = null; setState((current) => ({ ...current, active: false, phase: null })) }, [])
  useEffect(() => cancel, [cancel])
  const analyze = useCallback((file: File) => {
    session.clearSource()
    cancel()
    if (!file.name.toLowerCase().endsWith('.zip')) { setState({ phase: null, completed: 0, error: 'Choose a ChatGPT export ZIP file.', active: false }); return }
    if (file.size > MAX_BYTES) { setState({ phase: null, completed: 0, error: 'This ZIP is larger than the 100 MiB limit.', active: false }); return }
    const currentRun = ++run.current; const next = new Worker(new URL('../worker/analyze.worker.ts', import.meta.url), { type: 'module' }); worker.current = next
    setState({ phase: 'Preparing local analysis', completed: 0, total: file.size, error: null, active: true })
    next.onmessage = (event: MessageEvent<WorkerEvent>) => {
      if (currentRun !== run.current) return
      const message = event.data
      if (message.type === 'progress') setState({ phase: message.phase, completed: message.completed, total: message.total, error: null, active: true })
      if (message.type === 'error') { next.terminate(); worker.current = null; setState({ phase: null, completed: 0, error: message.message, active: false }) }
      if (message.type === 'complete') void reportRepository.replaceLatest(message.snapshot).then(() => { session.setSourceFile(file); next.terminate(); worker.current = null; setState({ phase: null, completed: 0, error: null, active: false }); navigate('/report') }, () => { next.terminate(); worker.current = null; setState({ phase: null, completed: 0, error: 'The report could not be saved in this browser.', active: false }) })
    }
    next.onerror = () => { if (currentRun === run.current) { next.terminate(); worker.current = null; setState({ phase: null, completed: 0, error: 'Analysis could not be completed.', active: false }) } }
    next.postMessage({ type: 'analyze', file })
  }, [cancel, navigate, session])
  return { analyze, cancel, state }
}
