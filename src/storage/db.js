import { openDB } from 'idb'

const DB_NAME = 'lab-data-studio'
const DB_VERSION = 1
const STORE = 'kv'
const KEY = 'app-state'
const FALLBACK_KEY = 'lab-data-studio:state'

let dbPromise = null

function getDB() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, DB_VERSION, {
      upgrade(db) {
        if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE)
      }
    })
  }
  return dbPromise
}

export async function loadState() {
  try {
    const db = await getDB()
    const value = await db.get(STORE, KEY)
    if (value) return value
  } catch (error) {
    console.warn('[storage] IndexedDB 读取失败，尝试 localStorage', error)
  }
  try {
    const raw = localStorage.getItem(FALLBACK_KEY)
    if (raw) return JSON.parse(raw)
  } catch (error) {
    console.warn('[storage] localStorage 读取失败', error)
  }
  return null
}

export async function saveState(state, mode = 'auto') {
  if (mode !== 'fallback') {
    try {
      const db = await getDB()
      await db.put(STORE, state, KEY)
      return 'indexeddb'
    } catch (error) {
      console.warn('[storage] IndexedDB 写入失败，回退 localStorage', error)
    }
  }
  localStorage.setItem(FALLBACK_KEY, JSON.stringify(state))
  return 'localstorage'
}

export async function clearState() {
  try {
    const db = await getDB()
    await db.delete(STORE, KEY)
  } catch {
    /* ignore */
  }
  try {
    localStorage.removeItem(FALLBACK_KEY)
  } catch {
    /* ignore */
  }
}
