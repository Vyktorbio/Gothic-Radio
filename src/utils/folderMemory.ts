import type { DriveTrack } from './musicLogic';
import type { DriveFolder } from '../services/driveMusic';

const LOCAL_TRACKS_KEY = 'gothic_radio_tracks_v4';
const LOCAL_META_KEY = 'gothic_radio_meta_v4';
const IDB_NAME = 'GothicRadioMemoryDB';
const IDB_VERSION = 1;
const IDB_STORE = 'folder_memory';
const IDB_SNAPSHOT_KEY = 'gothic_radio_snapshot_v4';
const AUDIO_CACHE_NAME = 'gothic-radio-audio-cache-v1';

export interface FolderMemoryMeta {
  folderId: string;
  folderName: string;
  trackCount: number;
  lastSyncedAt: string; // ISO string
  scanComplete: boolean;
  availableFolders?: DriveFolder[];
}

export interface StoredFolderMemory {
  tracks: DriveTrack[];
  meta: FolderMemoryMeta | null;
}

function openMemoryDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB indisponível'));
      return;
    }
    const req = indexedDB.open(IDB_NAME, IDB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) {
        db.createObjectStore(IDB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/**
 * Synchronously loads tracks & metadata from localStorage for instant 0ms initial render.
 */
export function loadFolderMemorySync(): StoredFolderMemory {
  let tracks: DriveTrack[] = [];
  let meta: FolderMemoryMeta | null = null;

  try {
    const rawTracks = localStorage.getItem(LOCAL_TRACKS_KEY);
    if (rawTracks) {
      const parsed = JSON.parse(rawTracks);
      if (Array.isArray(parsed)) {
        tracks = parsed.filter(
          (item): item is DriveTrack =>
            Boolean(item && typeof item.id === 'string' && !item.isDemo)
        );
      }
    }
  } catch {
    // Ignore localStorage parse errors
  }

  try {
    const rawMeta = localStorage.getItem(LOCAL_META_KEY);
    if (rawMeta) {
      const parsedMeta = JSON.parse(rawMeta);
      if (parsedMeta && typeof parsedMeta.folderId === 'string') {
        meta = parsedMeta as FolderMemoryMeta;
      }
    }
  } catch {
    // Ignore localStorage parse errors
  }

  return { tracks, meta };
}

/**
 * Asynchronously loads tracks & metadata from IndexedDB (supports unlimited tracks >5MB)
 * or falls back to localStorage.
 */
export async function loadFolderMemoryAsync(): Promise<StoredFolderMemory> {
  try {
    const db = await openMemoryDB();
    return await new Promise<StoredFolderMemory>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readonly');
      const store = tx.objectStore(IDB_STORE);
      const req = store.get(IDB_SNAPSHOT_KEY);
      req.onsuccess = () => {
        if (req.result && Array.isArray(req.result.tracks)) {
          resolve({
            tracks: req.result.tracks,
            meta: req.result.meta || null,
          });
        } else {
          resolve(loadFolderMemorySync());
        }
      };
      req.onerror = () => resolve(loadFolderMemorySync());
    });
  } catch {
    return loadFolderMemorySync();
  }
}

/**
 * Saves the scanned Coleção folder tracks and metadata persistently in both
 * localStorage (for instant startup) and IndexedDB (for unlimited capacity).
 */
export async function saveFolderMemory(
  tracks: DriveTrack[],
  meta: FolderMemoryMeta
): Promise<void> {
  try {
    localStorage.setItem(LOCAL_TRACKS_KEY, JSON.stringify(tracks));
    localStorage.setItem(LOCAL_META_KEY, JSON.stringify(meta));
  } catch {
    // If localStorage quota is exceeded on huge libraries, IndexedDB below still stores everything
  }

  try {
    const db = await openMemoryDB();
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      const store = tx.objectStore(IDB_STORE);
      store.put({ tracks, meta }, IDB_SNAPSHOT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  } catch {
    // Ignore IndexedDB errors
  }
}

export async function clearFolderMemory(): Promise<void> {
  try {
    localStorage.removeItem(LOCAL_TRACKS_KEY);
    localStorage.removeItem(LOCAL_META_KEY);
  } catch {
    // Ignore
  }
  try {
    const db = await openMemoryDB();
    await new Promise<void>((resolve) => {
      const tx = db.transaction(IDB_STORE, 'readwrite');
      tx.objectStore(IDB_STORE).delete(IDB_SNAPSHOT_KEY);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  } catch {
    // Ignore
  }
}

/**
 * Checks if an audio file blob is already cached in CacheStorage so it can play
 * immediately offline or before OAuth token refresh.
 */
export async function getCachedAudioBlob(trackId: string): Promise<Blob | null> {
  if (typeof caches === 'undefined') return null;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const match = await cache.match(
      `https://gothic-radio.local/audio/${encodeURIComponent(trackId)}`
    );
    if (match) {
      return await match.blob();
    }
  } catch {
    // Ignore CacheStorage read errors
  }
  return null;
}

export async function saveCachedAudioBlob(trackId: string, blob: Blob): Promise<void> {
  if (typeof caches === 'undefined') return;
  try {
    const cache = await caches.open(AUDIO_CACHE_NAME);
    const response = new Response(blob, {
      headers: {
        'Content-Type': blob.type || 'audio/mpeg',
      },
    });
    await cache.put(
      `https://gothic-radio.local/audio/${encodeURIComponent(trackId)}`,
      response
    );
  } catch {
    // Ignore CacheStorage quota errors
  }
}
