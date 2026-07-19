import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { UploadDropzone } from '../components/UploadDropzone'
import { useExportAnalysis } from '../hooks/useExportAnalysis'
import { useExportSession } from '../export/ExportSession'
import { reportRepository } from '../storage/reportRepository'

export function UploadPage() {
  const session = useExportSession(); const { analyze, cancel, state } = useExportAnalysis(session); const [hasReport, setHasReport] = useState(false)
  useEffect(() => { void reportRepository.loadLatest().then((result) => setHasReport(Boolean(result.snapshot))) }, [])
  const clear = async () => { await reportRepository.clear(); session.clearSource(); setHasReport(false) }
  const percentage = state.total ? Math.min(100, Math.round(state.completed / state.total * 100)) : 0
  return <main className="page upload-page"><p className="eyebrow">Private analytics</p><h1>Understand your ChatGPT export.</h1><p className="lead">Your export is processed only in this browser. It is never uploaded to an application server.</p>
    <UploadDropzone disabled={state.active} onFile={analyze} />
    {state.active && <section role="status" className="progress"><p>{state.phase}… {percentage}%</p><progress value={state.completed} max={state.total ?? 1} /><button type="button" onClick={cancel}>Cancel analysis</button></section>}
    {state.error && <p role="alert" className="error">{state.error}</p>}
    {hasReport && <p className="saved"><Link to="/report">Open your saved local report</Link> <button type="button" onClick={() => void clear()}>Clear local report</button></p>}
  </main>
}
