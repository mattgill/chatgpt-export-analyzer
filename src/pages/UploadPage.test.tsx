import 'fake-indexeddb/auto'
import { fireEvent, render, screen } from '@testing-library/react'
import { HashRouter } from 'react-router-dom'
import { describe, expect, it } from 'vitest'
import { UploadPage } from './UploadPage'

describe('UploadPage', () => {
  it('explains browser-only processing and rejects a non-ZIP before creating a worker', () => {
    render(<HashRouter><UploadPage /></HashRouter>)
    expect(screen.getByText(/processed only in this browser/i)).toBeInTheDocument()
    fireEvent.change(screen.getByLabelText(/select chatgpt export zip/i), { target: { files: [new File(['x'], 'notes.txt')] } })
    expect(screen.getByRole('alert')).toHaveTextContent(/choose a chatgpt export zip/i)
  })
})
