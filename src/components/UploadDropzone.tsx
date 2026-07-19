import { useRef, useState } from 'react'

export function UploadDropzone({ disabled, onFile }: { disabled: boolean; onFile: (file: File) => void }) {
  const input = useRef<HTMLInputElement>(null); const [dragging, setDragging] = useState(false)
  const accept = (files: FileList | null) => { const file = files?.[0]; if (file) onFile(file) }
  return <section className={`dropzone ${dragging ? 'dragging' : ''}`} aria-label="ChatGPT export ZIP" onDragOver={(event) => { event.preventDefault(); setDragging(true) }} onDragLeave={() => setDragging(false)} onDrop={(event) => { event.preventDefault(); setDragging(false); accept(event.dataTransfer.files) }}>
    <input ref={input} aria-label="Select ChatGPT export ZIP" type="file" accept=".zip,application/zip" disabled={disabled} onChange={(event) => accept(event.target.files)} />
    <button type="button" disabled={disabled} onClick={() => input.current?.click()}>Select a ChatGPT export ZIP</button>
    <p>ChatGPT export ZIPs up to 100 MiB</p>
  </section>
}
