// @vitest-environment node
import { zipSync, strToU8 } from 'fflate'
import { readFileSync } from 'node:fs'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { analyzeExport, ExportAnalysisError } from './analyzeExport'

const zip = (entries: Record<string, string>) => new File([zipSync(Object.fromEntries(Object.entries(entries).map(([name, value]) => [name, strToU8(value)])))], 'export.zip', { type: 'application/zip' })

describe('analyzeExport', () => {
  beforeAll(() => {
    const wasm = readFileSync(new URL('../../node_modules/tiktoken/lite/tiktoken_bg.wasm', import.meta.url))
    vi.stubGlobal('fetch', vi.fn(async () => new Response(wasm)))
  })
  it('processes numbered parts, ignores unrelated assets, and deduplicates ids', async () => {
    const snapshot = await analyzeExport(zip({ 'conversations-000.json': JSON.stringify([{ id: 'one', mapping: { a: { message: { author: { role: 'user' }, content: { parts: ['hello'] } } } } }]), 'conversations-001.json': JSON.stringify([{ id: 'one', mapping: {} }, { id: 'two', mapping: { a: { message: { author: { role: 'assistant' }, content: { parts: ['world'] } } } } }]), 'image.png': 'ignored' }), { analyzedAt: '2025-01-01T00:00:00.000Z' })
    expect(snapshot.totals.conversations).toBe(2); expect(snapshot.source.conversationParts).toBe(2)
  })

  it('returns safe stable errors', async () => {
    await expect(analyzeExport(new File(['nope'], 'bad.zip'))).rejects.toMatchObject({ code: 'invalid_zip' } satisfies Partial<ExportAnalysisError>)
    await expect(analyzeExport(zip({ 'readme.txt': 'none' }))).rejects.toMatchObject({ code: 'no_conversation_files' } satisfies Partial<ExportAnalysisError>)
  })
})
