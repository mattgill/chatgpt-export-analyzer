import { expect, test } from '@playwright/test'
import { zipSync, strToU8 } from 'fflate'

const fixture = zipSync({ 'conversations.json': strToU8(JSON.stringify([{ id: 'browser', title: 'Browser fixture', mapping: { user: { message: { author: { role: 'user' }, create_time: 1704067200, content: { parts: ['hello from browser'] } } }, assistant: { message: { author: { role: 'assistant' }, create_time: 1704067210, content: { parts: ['hello back'] } } } } }])) })

test('analyzes locally under the Pages project path and restores after reload', async ({ page }) => {
  const requests: string[] = []
  page.on('request', (request) => { if (request.url().startsWith('http')) requests.push(request.url()) })
  await page.goto('./#/')
  await page.getByLabel('Select ChatGPT export ZIP').setInputFiles({ name: 'conversations.zip', mimeType: 'application/zip', buffer: Buffer.from(fixture) })
  await expect(page).toHaveURL(/#\/report$/)
  await expect(page.getByRole('cell', { name: 'Browser fixture' })).toBeVisible()
  await page.reload()
  await expect(page.getByRole('cell', { name: 'Browser fixture' })).toBeVisible()
  for (const url of requests) expect(new URL(url).origin).toBe('http://127.0.0.1:4173')
  expect(requests.some((url) => url.includes('/assets/analyze.worker-'))).toBeTruthy()
  expect(requests.some((url) => url.includes('/assets/tiktoken_bg-'))).toBeTruthy()
})

test('rejects invalid files and clears persistence', async ({ page }) => {
  await page.goto('./#/')
  await page.getByLabel('Select ChatGPT export ZIP').setInputFiles({ name: 'not-a-zip.txt', mimeType: 'text/plain', buffer: Buffer.from('nope') })
  await expect(page.getByRole('alert')).toContainText('Choose a ChatGPT export ZIP')
})
