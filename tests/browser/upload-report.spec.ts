import { expect, test } from '@playwright/test'
import { readFileSync } from 'node:fs'
import { strFromU8, unzipSync, zipSync, strToU8 } from 'fflate'

const fixture = zipSync({ 'conversations.json': strToU8(JSON.stringify([
  { id: 'browser', title: 'Browser fixture', create_time: 1704067200, mapping: { user: { message: { author: { role: 'user' }, create_time: 1704067200, content: { parts: ['hello from browser'] } } }, assistant: { message: { author: { role: 'assistant' }, create_time: 1704067210, content: { parts: ['hello back'] } } }, thought: { message: { author: { role: 'assistant' }, content: { content_type: 'thoughts', content: { private: 'do not export' } } } } } },
  { id: 'browser-two', title: 'Browser fixture', create_time: 1704067200, mapping: { user: { message: { author: { role: 'user' }, content: { parts: ['second conversation'] } } } } },
])) })

test('analyzes locally under the Pages project path and restores after reload', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => { if (request.url().startsWith('http')) requests.push(request.url()) })
  await page.goto('./#/')
  await page.getByLabel('Select ChatGPT export ZIP').setInputFiles({ name: 'conversations.zip', mimeType: 'application/zip', buffer: Buffer.from(fixture) })
  await expect(page).toHaveURL(/#\/report$/)
  await expect(page.getByRole('cell', { name: 'Browser fixture' })).toBeVisible()
  const downloadPromise = page.waitForEvent('download')
  await page.getByRole('button', { name: 'Download Markdown ZIP' }).click()
  const download = await downloadPromise
  expect(download.suggestedFilename()).toBe('chatgpt-conversations-markdown.zip')
  const downloadPath = await download.path()
  expect(downloadPath).not.toBeNull()
  const output = unzipSync(new Uint8Array(readFileSync(downloadPath!)))
  expect(Object.keys(output).sort()).toEqual(['2024-01-01-browser-fixture-2.md', '2024-01-01-browser-fixture.md'])
  expect(strFromU8(output['2024-01-01-browser-fixture.md'])).toContain('hello from browser')
  expect(strFromU8(output['2024-01-01-browser-fixture.md'])).toContain('hello back')
  expect(strFromU8(output['2024-01-01-browser-fixture.md'])).not.toContain('do not export')
  await page.reload()
  await expect(page.getByRole('cell', { name: 'Browser fixture' })).toBeVisible()
  await expect(page.getByText(/re-upload the export to download markdown/i)).toBeVisible()
  for (const url of requests) expect(new URL(url).origin).toBe('http://127.0.0.1:4173')
  expect(requests.some((url) => url.includes('/assets/analyze.worker-'))).toBeTruthy()
  expect(requests.some((url) => url.includes('/assets/tiktoken_bg-'))).toBeTruthy()
})

test('rejects invalid files and clears persistence', async ({ page }) => {
  await page.goto('./#/')
  await page.getByLabel('Select ChatGPT export ZIP').setInputFiles({ name: 'not-a-zip.txt', mimeType: 'text/plain', buffer: Buffer.from('nope') })
  await expect(page.getByRole('alert')).toContainText('Choose a ChatGPT export ZIP')
})
