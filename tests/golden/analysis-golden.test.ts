// @vitest-environment node
import { readFileSync } from 'node:fs'
import { zipSync } from 'fflate'
import { beforeAll, describe, expect, it, vi } from 'vitest'
import { analyzeExport } from '../../src/worker/analyzeExport'
import expected from '../fixtures/parity-expected.json'

beforeAll(() => {
  const wasm = readFileSync(new URL('../../node_modules/tiktoken/lite/tiktoken_bg.wasm', import.meta.url))
  vi.stubGlobal('fetch', vi.fn(async () => new Response(wasm)))
})

describe('analysis golden fixture', () => {
  it('matches the committed browser analysis snapshot', async () => {
    const names = ['conversations-000.json', 'conversations-001.json']
    const archive = zipSync(Object.fromEntries(names.map((name) => [name, new Uint8Array(readFileSync(new URL(`../fixtures/parity-export/${name}`, import.meta.url)))])))
    await expect(analyzeExport(new File([archive], 'parity.zip'), { analyzedAt: '2025-01-01T00:00:00.000Z' })).resolves.toEqual(expected)
  })
})
