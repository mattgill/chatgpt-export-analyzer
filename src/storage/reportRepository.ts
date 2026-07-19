import { SNAPSHOT_SCHEMA_VERSION, type AnalysisSnapshot } from '../analysis/types'

const DATABASE = 'chatgpt-export-analytics'
const STORE = 'reports'
const LATEST = 'latest'
export type LoadResult = { snapshot: AnalysisSnapshot | null; recovered: boolean }

function validSnapshot(value: unknown): value is AnalysisSnapshot {
  if (!value || typeof value !== 'object') return false
  const snapshot = value as Partial<AnalysisSnapshot>
  return snapshot.schemaVersion === SNAPSHOT_SCHEMA_VERSION && typeof snapshot.analyzedAt === 'string' && !!snapshot.source && !!snapshot.totals && !!snapshot.inventory && Array.isArray(snapshot.topConversations) && snapshot.topConversations.length <= 100 && !('file' in snapshot) && !('messages' in snapshot)
}

function database(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DATABASE, 1)
    request.onupgradeneeded = () => { if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE) }
    request.onsuccess = () => resolve(request.result)
    request.onerror = () => reject(request.error)
  })
}

async function transaction<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T> {
  const db = await database()
  return new Promise<T>((resolve, reject) => {
    const tx = db.transaction(STORE, mode); const request = run(tx.objectStore(STORE))
    request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); tx.onabort = () => reject(tx.error); tx.oncomplete = () => db.close()
  })
}

export const reportRepository = {
  async loadLatest(): Promise<LoadResult> {
    const value = await transaction('readonly', (store) => store.get(LATEST))
    if (value === undefined) return { snapshot: null, recovered: false }
    if (validSnapshot(value)) return { snapshot: value, recovered: false }
    await this.clear()
    return { snapshot: null, recovered: true }
  },
  async replaceLatest(snapshot: AnalysisSnapshot): Promise<void> {
    if (!validSnapshot(snapshot)) throw new Error('Only a valid AnalysisSnapshot can be stored')
    await transaction('readwrite', (store) => store.put(snapshot, LATEST))
  },
  async clear(): Promise<void> { await transaction('readwrite', (store) => store.delete(LATEST)) },
}
