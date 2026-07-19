import { spawn } from 'node:child_process'
import { existsSync, readFileSync } from 'node:fs'
import { mkdtemp, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { chromium } from '@playwright/test'
import { zipSync, strToU8 } from 'fflate'

const args = process.argv.slice(2); const sizeIndex = args.indexOf('--size-mib'); const zipIndex = args.indexOf('--zip'); const size = sizeIndex >= 0 ? Number(args[sizeIndex + 1]) : Number.NaN; const zipPath = zipIndex >= 0 ? args[zipIndex + 1] : undefined

function generatedArchive(mib: number) {
  const target = Math.floor(mib * 1024 * 1024) - 2048
  const line = JSON.stringify({ id: 'benchmark', title: 'Synthetic benchmark', mapping: { user: { message: { author: { role: 'user' }, create_time: 1704067200, content: { parts: ['synthetic token data '.repeat(40)] } } } } })
  const repetitions = Math.floor(target / Buffer.byteLength(`${line}\n`)); const json = `[${Array.from({ length: repetitions }, () => line).join(',')}]`
  return { archive: zipSync({ 'conversations.json': strToU8(json) }, { level: 0 }), expandedBytes: Buffer.byteLength(json), conversations: repetitions }
}

async function waitForServer(url: string) { for (let attempt = 0; attempt < 100; attempt += 1) { try { if ((await fetch(url)).ok) return } catch { /* Starting. */ } await new Promise((resolve) => setTimeout(resolve, 100)) }; throw new Error('Timed out starting the static preview server.') }

async function main() {
  let archive: Uint8Array; let name: string; let expandedBytes: number | undefined; let conversations: number | undefined; let temporaryDirectory: string | undefined; let uploadPath: string | undefined
  if (zipPath) {
    if (!existsSync(zipPath)) { console.log(JSON.stringify({ status: 'skipped', reason: 'private ZIP not found', path: zipPath })); return }
    archive = new Uint8Array(readFileSync(zipPath)); name = 'private-export.zip'; uploadPath = zipPath
  } else {
    if (!Number.isFinite(size) || size <= 0) throw new Error('Use --size-mib <positive number> or --zip <private ZIP path>.')
    const generated = generatedArchive(size); archive = generated.archive; expandedBytes = generated.expandedBytes; conversations = generated.conversations; name = 'synthetic-benchmark.zip'
  }
  if (!uploadPath) { temporaryDirectory = await mkdtemp(join(tmpdir(), 'chatgpt-export-benchmark-')); uploadPath = join(temporaryDirectory, name); await writeFile(uploadPath, archive) }
  const server = spawn('npm', ['run', 'preview:pages'], { stdio: 'ignore' }); const started = performance.now(); let browser
  try {
    await waitForServer('http://127.0.0.1:4173/chatgpt-export-analytics-tool/')
    browser = await chromium.launch(); const page = await browser.newPage(); const errors: string[] = []; page.on('pageerror', (error) => errors.push(error.message)); await page.goto('http://127.0.0.1:4173/chatgpt-export-analytics-tool/#/')
    await page.getByLabel('Select ChatGPT export ZIP').setInputFiles(uploadPath); await page.waitForURL(/#\/report$/, { timeout: 15 * 60_000 })
    const downloadStarted = performance.now(); const downloadPromise = page.waitForEvent('download'); await page.getByRole('button', { name: 'Download Markdown ZIP' }).click(); const download = await downloadPromise; const downloadPath = await download.path()
    if (!downloadPath) throw new Error('Markdown download did not produce a local file.')
    const archiveBytes = (await stat(downloadPath)).size
    const metric = { status: 'completed', source: zipPath ? 'private' : 'synthetic', compressedBytes: archive.byteLength, expandedConversationBytes: expandedBytes, conversations, elapsedMs: Math.round(performance.now() - started), markdownDownloadCompleted: true, markdownArchiveBytes: archiveBytes, markdownExportElapsedMs: Math.round(performance.now() - downloadStarted), pageErrors: errors.length }
    console.log(JSON.stringify(metric))
  } finally { await browser?.close(); server.kill(); if (temporaryDirectory) await rm(temporaryDirectory, { recursive: true, force: true }) }
}

void main()
