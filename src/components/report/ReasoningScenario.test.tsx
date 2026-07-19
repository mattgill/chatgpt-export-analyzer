import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it } from 'vitest'
import { ReasoningScenario } from './ReasoningScenario'

describe('ReasoningScenario', () => {
  afterEach(cleanup)
  it('shows a scenario without changing observed totals', () => {
    render(<ReasoningScenario inputTokens={2} outputTokens={5} />)
    fireEvent.change(screen.getByLabelText('Reasoning multiplier'), { target: { value: '0.5' } })
    expect(screen.getByText(/Estimated additional tokens: 2/)).toBeInTheDocument()
  })
  it('rejects invalid input', () => {
    render(<ReasoningScenario inputTokens={2} outputTokens={5} />)
    fireEvent.change(screen.getByLabelText('Reasoning multiplier'), { target: { value: '-1' } })
    expect(screen.getByRole('alert')).toBeInTheDocument()
  })
})
