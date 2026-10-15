import { settingDef } from './registry'

/**
 * ★★★ BJ — LE SEUL MODULE QUI TOUCHE IndexedDB.
 *
 * Déplacé tel quel de `data/cache.ts` (P2.5b) : la base `lo-yanum` porte la
 * COPIE HORS LIGNE des données (`aggregates`) et la FILE des écritures pas
 * encore envoyées (`outbox`). Les deux restent sur l'appareil — c'est la
 * raison « hors ligne » du registre — mais elles y sont DÉCLARÉES, et plus
 * aucun autre fichier n'ouvre de base (`bun run bjguard`).
 *
 * Le module ne sait rien des enregistrements : il range des valeurs sous des
 * clés, magasin par magasin. `data/cache.ts` garde le sens (clés, format).
 */
export interface KeyValueDb<V> {
  getAll(store: string): Promise<V[]>
  put(store: string, entries: Array<[string, V]>): Promise<void>
  remove(store: string, keys: string[]): Promise<void>
  clear(store: string): Promise<void>
}

export function openKeyValueDb<V>(name: string, version: number, stores: readonly string[]): Promise<KeyValueDb<V> | null> {
  if (!settingDef(name) || settingDef(name)?.area !== 'idb') {
    if (typeof console !== 'undefined') console.error(`[réglages] base IndexedDB non déclarée : ${name}`)
    return Promise.resolve(null)
  }
  if (typeof indexedDB === 'undefined') return Promise.resolve(null)

  return new Promise<KeyValueDb<V> | null>((resolve) => {
    let request: IDBOpenDBRequest
    try {
      request = indexedDB.open(name, version)
    } catch {
      // Safari in a private window throws rather than failing. A cache that
      // cannot open is a slower app, not a broken one.
      resolve(null)
      return
    }

    request.onupgradeneeded = () => {
      const db = request.result
      for (const store of stores) {
        if (!db.objectStoreNames.contains(store)) db.createObjectStore(store)
      }
    }
    request.onerror = () => {
      resolve(null)
    }
    request.onsuccess = () => {
      resolve(wrap<V>(request.result))
    }
  })
}

function wrap<V>(db: IDBDatabase): KeyValueDb<V> {
  const run = <T>(store: string, mode: IDBTransactionMode, body: (s: IDBObjectStore) => IDBRequest<T> | null): Promise<T | undefined> =>
    new Promise((resolve, reject) => {
      const tx = db.transaction(store, mode)
      const request = body(tx.objectStore(store))
      tx.onerror = () => {
        reject(tx.error ?? new Error(`${store}: transaction failed`))
      }
      tx.oncomplete = () => {
        resolve(request?.result)
      }
    })

  return {
    async getAll(store) {
      return ((await run<V[]>(store, 'readonly', (s) => s.getAll())) ?? []) as V[]
    },
    async put(store, entries) {
      if (entries.length === 0) return
      await run(store, 'readwrite', (s) => {
        for (const [key, value] of entries) s.put(value, key)
        return null
      })
    },
    async remove(store, keys) {
      if (keys.length === 0) return
      await run(store, 'readwrite', (s) => {
        for (const key of keys) s.delete(key)
        return null
      })
    },
    async clear(store) {
      await run(store, 'readwrite', (s) => s.clear())
    },
  }
}
