import { Component, lazy, Suspense, type ReactNode } from 'react'
import { HashRouter, Navigate, Route, Routes } from 'react-router-dom'
import { ExportSessionProvider } from './export/ExportSession'
import { UploadPage } from './pages/UploadPage'
const ReportPage = lazy(() => import('./pages/ReportPage').then((module) => ({ default: module.ReportPage })))

class ErrorBoundary extends Component<{ children: ReactNode }, { error: Error | null }> {
  state = { error: null as Error | null }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch() { /* Keep errors out of export-derived UI. */ }
  render() {
    if (this.state.error) return <main className="page"><h1>Something went wrong</h1><p>Please reload and try again.</p></main>
    return this.props.children
  }
}

export function App() {
  return <ErrorBoundary><ExportSessionProvider><HashRouter><Routes>
    <Route path="/" element={<UploadPage />} />
    <Route path="/report" element={<Suspense fallback={<main className="page"><p>Loading your local report…</p></main>}><ReportPage /></Suspense>} />
    <Route path="*" element={<Navigate to="/" replace />} />
  </Routes></HashRouter></ExportSessionProvider></ErrorBoundary>
}
