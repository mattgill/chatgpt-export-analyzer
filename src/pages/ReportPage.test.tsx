import 'fake-indexeddb/auto'
import { render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { describe, expect, it, vi } from 'vitest'
vi.mock('react-plotly.js', () => ({ default: () => null }))
import { ReportPage } from './ReportPage'

describe('ReportPage', () => {
  it('shows a useful empty state when no report is stored', async () => {
    render(<HashRouter><ReportPage /></HashRouter>)
    expect(await screen.findByText(/no local report yet/i)).toBeInTheDocument()
  })
})
