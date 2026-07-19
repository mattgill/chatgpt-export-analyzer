import { createContext, useContext, useMemo, useState, type ReactNode } from 'react'

type ExportSession = { sourceFile: File | null; setSourceFile(file: File): void; clearSource(): void }
const ExportSessionContext = createContext<ExportSession>({ sourceFile: null, setSourceFile: () => undefined, clearSource: () => undefined })

export function ExportSessionProvider({ children, initialSourceFile = null }: { children: ReactNode; initialSourceFile?: File | null }) {
  const [sourceFile, setSourceFile] = useState<File | null>(initialSourceFile)
  const value = useMemo(() => ({ sourceFile, setSourceFile, clearSource: () => setSourceFile(null) }), [sourceFile])
  return <ExportSessionContext.Provider value={value}>{children}</ExportSessionContext.Provider>
}

// eslint-disable-next-line react-refresh/only-export-components
export const useExportSession = (): ExportSession => useContext(ExportSessionContext)
