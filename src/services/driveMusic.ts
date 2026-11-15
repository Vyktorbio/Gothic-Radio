import {
  parseTrackFilename,
  isAudioFile,
  buildFolderHierarchy,
  normalizeSourceFolderLabel,
  extractDriveFolderId,
  type DriveTrack,
  type RawFolderNode,
  type ResolvedFolderInfo,
} from '../utils/musicLogic';
import {
  getCachedAudioBlob,
  saveCachedAudioBlob,
} from '../utils/folderMemory';

export const DEFAULT_COLECAO_FOLDER_ID = '1lWs0LtOkqLMjOgX_zGRP9MmaDdMdxgnV';
export const DEFAULT_COLECAO_FOLDER_URL =
  'https://drive.google.com/drive/folders/1lWs0LtOkqLMjOgX_zGRP9MmaDdMdxgnV?usp=drive_link';

export interface DriveFolder {
  id: string;
  name: string;
}

interface RawDriveFile {
  id: string;
  name: string;
  mimeType: string;
  size?: string;
  parents?: string[];
  shortcutDetails?: {
    targetId?: string;
    targetMimeType?: string;
  };
}

const DRIVE_API_BASE = 'https://www.googleapis.com/drive/v3/files';

const audioBlobUrlCache = new Map<string, string>();
const MAX_CACHED_BLOBS = 12;

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Resilient Google Drive API fetch with automatic exponential backoff retry
 * on rate limits (403 userRateLimitExceeded / rateLimitExceeded, 429) and transient 5xx errors.
 */
async function driveFetch<T>(
  url: string,
  accessToken: string,
  maxRetries: number = 5
): Promise<T> {
  let attempt = 0;

  while (true) {
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });

    if (response.ok) {
      return (await response.json()) as T;
    }

    const bodyText = await response.text().catch(() => '');
    const isRateLimit =
      response.status === 429 ||
      (response.status === 403 &&
        /rateLimit|userRateLimit|quotaExceeded|backendError/i.test(bodyText));
    const isTransientServerErr = response.status >= 500 && response.status < 600;

    if ((isRateLimit || isTransientServerErr) && attempt < maxRetries) {
      const delayMs = Math.min(4500, 450 * Math.pow(2, attempt));
      attempt += 1;
      await sleep(delayMs);
      continue;
    }

    if (response.status === 401 || response.status === 403) {
      const err = new Error(
        'Sessão do Google Drive expirada ou sem permissão. Clique em Conectar.'
      );
      (err as Error & { status?: number }).status = response.status;
      throw err;
    }

    throw new Error(
      `Erro ao consultar Google Drive (${response.status}): ${
        bodyText || response.statusText
      }`
    );
  }
}

/**
 * Fetches ALL pages of a Google Drive files.list query using pageSize=1000 and nextPageToken.
 * Supports up to 200 pages (200,000 files) per query.
 */
async function driveFetchAllPages(
  q: string,
  fields: string,
  accessToken: string,
  onPageLoaded?: (accumulatedCount: number) => void,
  maxPages: number = 200
): Promise<RawDriveFile[]> {
  const allFiles: RawDriveFile[] = [];
  let pageToken: string | undefined;
  let pageCount = 0;

  do {
    const tokenParam: string = pageToken
      ? `&pageToken=${encodeURIComponent(pageToken)}`
      : '';
    const url: string = `${DRIVE_API_BASE}?q=${encodeURIComponent(
      q
    )}&fields=nextPageToken,files(${fields})&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true${tokenParam}`;

    const data: {
      nextPageToken?: string;
      files?: RawDriveFile[];
    } = await driveFetch<{
      nextPageToken?: string;
      files?: RawDriveFile[];
    }>(url, accessToken);

    if (data.files && data.files.length > 0) {
      allFiles.push(...data.files);
      if (onPageLoaded) {
        onPageLoaded(allFiles.length);
      }
    }

    pageToken = data.nextPageToken;
    pageCount += 1;
  } while (pageToken && pageCount < maxPages);

  return allFiles;
}

export function normalizeFolderKey(name: string): string {
  return (name || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
}

/**
 * Reads ALL audio tracks inside the user's configured "Coleção" folder
 * (1lWs0LtOkqLMjOgX_zGRP9MmaDdMdxgnV) and all nested artist/album subfolders at any depth.
 * Streams partial tracks via onProgress on every batch so songs appear immediately.
 */
export async function scanColecaoAudioTracks(
  accessToken: string,
  overrideFolderInput?: string | null,
  onProgress?: (
    count: number,
    message: string,
    partialTracks?: DriveTrack[]
  ) => void
): Promise<{
  tracks: DriveTrack[];
  activeFolderName: string;
  activeFolderId: string;
  availableFolders: DriveFolder[];
}> {
  const requestedFolderId =
    extractDriveFolderId(overrideFolderInput || '') ||
    DEFAULT_COLECAO_FOLDER_ID;

  if (onProgress) {
    onProgress(0, 'ACESSANDO PASTA COLEÇÃO NO GOOGLE DRIVE...');
  }

  let rootFolderId = requestedFolderId;
  let activeFolderName = 'Coleção';

  // 1. Fetch metadata of the target folder (resolving shortcut if applicable)
  try {
    const metaUrl = `${DRIVE_API_BASE}/${encodeURIComponent(
      requestedFolderId
    )}?fields=id,name,mimeType,shortcutDetails&supportsAllDrives=true`;
    const meta = await driveFetch<RawDriveFile>(metaUrl, accessToken);
    rootFolderId = meta.shortcutDetails?.targetId || meta.id;
    activeFolderName = (meta.name || 'Coleção').trim();
  } catch {
    rootFolderId = requestedFolderId;
    activeFolderName = 'Coleção';
  }

  // 2. Simultaneously fetch global folders index AND direct children of rootFolderId
  // so we immediately know both pre-indexed deep subfolders and direct children!
  const allFoldersQuery =
    "(mimeType = 'application/vnd.google-apps.folder' or mimeType = 'application/vnd.google-apps.shortcut') and trashed = false";
  const directChildrenQuery = `'${rootFolderId}' in parents and trashed = false`;

  const [globalFoldersRaw, directChildren] = await Promise.all([
    driveFetchAllPages(
      allFoldersQuery,
      'id,name,mimeType,parents,shortcutDetails',
      accessToken,
      undefined,
      60
    ).catch(() => [] as RawDriveFile[]),
    driveFetchAllPages(
      directChildrenQuery,
      'id,name,mimeType,size,parents,shortcutDetails',
      accessToken
    ),
  ]);

  const discoveredFoldersMap = new Map<string, RawFolderNode>();
  discoveredFoldersMap.set(rootFolderId, {
    id: rootFolderId,
    name: activeFolderName,
  });

  for (const item of globalFoldersRaw) {
    const isFolder =
      item.mimeType === 'application/vnd.google-apps.folder' ||
      (item.mimeType === 'application/vnd.google-apps.shortcut' &&
        item.shortcutDetails?.targetMimeType ===
          'application/vnd.google-apps.folder');
    if (isFolder) {
      const effectiveId = item.shortcutDetails?.targetId || item.id;
      discoveredFoldersMap.set(effectiveId, {
        id: effectiveId,
        name: item.name.trim(),
        parents: item.parents,
        shortcutTargetId: item.shortcutDetails?.targetId,
      });
    }
  }

  const targetRoots: { id: string; name: string }[] = [
    { id: rootFolderId, name: activeFolderName },
  ];
  if (requestedFolderId !== rootFolderId) {
    targetRoots.push({ id: requestedFolderId, name: activeFolderName });
  }

  const rawAudioCandidates: RawDriveFile[] = [];
  const visitedFolderIds = new Set<string>([rootFolderId, requestedFolderId]);
  let currentFrontierIds: string[] = [];

  for (const item of directChildren) {
    const isSubfolder =
      item.mimeType === 'application/vnd.google-apps.folder' ||
      (item.mimeType === 'application/vnd.google-apps.shortcut' &&
        item.shortcutDetails?.targetMimeType ===
          'application/vnd.google-apps.folder');

    if (isSubfolder) {
      const effectiveFolderId = item.shortcutDetails?.targetId || item.id;
      discoveredFoldersMap.set(effectiveFolderId, {
        id: effectiveFolderId,
        name: item.name.trim(),
        parents: [rootFolderId],
        shortcutTargetId: item.shortcutDetails?.targetId,
      });
      if (!visitedFolderIds.has(effectiveFolderId)) {
        visitedFolderIds.add(effectiveFolderId);
        currentFrontierIds.push(effectiveFolderId);
      }
      if (item.id !== effectiveFolderId && !visitedFolderIds.has(item.id)) {
        visitedFolderIds.add(item.id);
        currentFrontierIds.push(item.id);
      }
    } else {
      rawAudioCandidates.push(item);
    }
  }

  // Also add any descendant folders already known from globalFoldersRaw so we can fetch their files in fewer rounds
  const prebuiltHierarchy = buildFolderHierarchy(
    targetRoots,
    Array.from(discoveredFoldersMap.values())
  );
  for (const knownFolderId of prebuiltHierarchy.keys()) {
    if (!visitedFolderIds.has(knownFolderId)) {
      visitedFolderIds.add(knownFolderId);
      currentFrontierIds.push(knownFolderId);
    }
  }

  // Emit initial partial tracks if direct audio files were found in the root
  if (rawAudioCandidates.length > 0 && onProgress) {
    const partial = mapRawFilesToTracks(
      rawAudioCandidates,
      prebuiltHierarchy,
      activeFolderName
    );
    onProgress(
      partial.length,
      `LENDO PASTA ${activeFolderName.toUpperCase()}... ${partial.length} MÚSICAS CARREGADAS`,
      partial
    );
  }

  // 3. Breadth-First Search (BFS) across all nested subfolders inside Coleção (up to 25 levels deep)
  // Uses chunkSize = 20 and concurrency = 2 with exponential backoff in driveFetch so 0 requests are dropped!
  for (let depth = 0; depth < 25 && currentFrontierIds.length > 0; depth++) {
    const nextFrontierIds: string[] = [];
    const chunkSize = 20;
    const chunks: string[][] = [];

    for (let i = 0; i < currentFrontierIds.length; i += chunkSize) {
      chunks.push(currentFrontierIds.slice(i, i + chunkSize));
    }

    const concurrency = 2;
    for (let i = 0; i < chunks.length; i += concurrency) {
      const batch = chunks.slice(i, i + concurrency);
      const batchResults = await Promise.all(
        batch.map(async (chunk) => {
          const parentOr = chunk.map((id) => `'${id}' in parents`).join(' or ');
          const qChildren = `(${parentOr}) and trashed = false`;
          return driveFetchAllPages(
            qChildren,
            'id,name,mimeType,size,parents,shortcutDetails',
            accessToken
          );
        })
      );

      for (const items of batchResults) {
        for (const item of items) {
          const isSubfolder =
            item.mimeType === 'application/vnd.google-apps.folder' ||
            (item.mimeType === 'application/vnd.google-apps.shortcut' &&
              item.shortcutDetails?.targetMimeType ===
                'application/vnd.google-apps.folder');

          if (isSubfolder) {
            const effectiveFolderId =
              item.shortcutDetails?.targetId || item.id;
            discoveredFoldersMap.set(effectiveFolderId, {
              id: effectiveFolderId,
              name: item.name.trim(),
              parents: item.parents,
              shortcutTargetId: item.shortcutDetails?.targetId,
            });
            if (!visitedFolderIds.has(effectiveFolderId)) {
              visitedFolderIds.add(effectiveFolderId);
              nextFrontierIds.push(effectiveFolderId);
            }
            if (
              item.id !== effectiveFolderId &&
              !visitedFolderIds.has(item.id)
            ) {
              visitedFolderIds.add(item.id);
              nextFrontierIds.push(item.id);
            }
          } else {
            rawAudioCandidates.push(item);
          }
        }
      }

      if (onProgress) {
        const currentHierarchy = buildFolderHierarchy(
          targetRoots,
          Array.from(discoveredFoldersMap.values())
        );
        const partialTracks = mapRawFilesToTracks(
          rawAudioCandidates,
          currentHierarchy,
          activeFolderName
        );
        onProgress(
          partialTracks.length,
          `LENDO PASTA ${activeFolderName.toUpperCase()}... ${partialTracks.length} MÚSICAS CARREGADAS`,
          partialTracks
        );
      }
    }

    currentFrontierIds = nextFrontierIds;
  }

  const finalHierarchy = buildFolderHierarchy(
    targetRoots,
    Array.from(discoveredFoldersMap.values())
  );

  const tracks = mapRawFilesToTracks(
    rawAudioCandidates,
    finalHierarchy,
    activeFolderName
  );

  const availableFolders: DriveFolder[] = Array.from(
    discoveredFoldersMap.values()
  )
    .map((f) => ({
      id: f.shortcutTargetId || f.id,
      name: f.name.trim(),
    }))
    .sort((a, b) =>
      a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' })
    );

  return {
    tracks,
    activeFolderName,
    activeFolderId: targetRoots[0].id,
    availableFolders,
  };
}

function mapRawFilesToTracks(
  rawFiles: RawDriveFile[],
  hierarchy: Map<string, ResolvedFolderInfo>,
  rootFolderName: string
): DriveTrack[] {
  const seenFileIds = new Set<string>();
  const tracks: DriveTrack[] = [];

  for (const file of rawFiles) {
    if (seenFileIds.has(file.id)) continue;

    const effectiveStreamId = file.shortcutDetails?.targetId || file.id;
    const effectiveMime =
      file.shortcutDetails?.targetMimeType || file.mimeType || '';

    // Verify that this file is a playable audio file (MP3, MP4, WAV, M4A, FLAC, OGG, AAC, WMA, OPUS, etc.)
    if (!isAudioFile(file.name, effectiveMime)) {
      continue;
    }

    seenFileIds.add(file.id);

    const parentId = file.parents?.[0];
    const folderInfo = parentId ? hierarchy.get(parentId) : undefined;
    const parentName = folderInfo?.name || rootFolderName;
    const sourceFolder =
      folderInfo?.sourceFolder || normalizeSourceFolderLabel(parentName);

    const parsed = parseTrackFilename(
      file.name,
      parentName,
      rootFolderName,
      folderInfo?.artistFolder,
      folderInfo?.fullPath
    );

    tracks.push({
      id: file.id,
      streamFileId: effectiveStreamId,
      name: file.name,
      title: parsed.title,
      artist: parsed.artist,
      albumOrFolder: parsed.albumOrFolder,
      sourceFolder,
      mimeType: effectiveMime || 'audio/mpeg',
      sizeBytes: file.size ? parseInt(file.size, 10) : 0,
      trackNumber: parsed.trackNumber,
    });
  }

  tracks.sort((a, b) => {
    const artistCmp = a.artist.localeCompare(b.artist, 'pt-BR', {
      sensitivity: 'base',
    });
    if (artistCmp !== 0) return artistCmp;

    return a.title.localeCompare(b.title, 'pt-BR', { sensitivity: 'base' });
  });

  return tracks;
}

function resolvePlayableMimeType(fileName: string, rawMimeType: string): string {
  const lowerName = fileName.toLowerCase();
  if (lowerName.includes('.mp3')) return 'audio/mpeg';
  if (lowerName.includes('.mp4') || lowerName.includes('.m4a')) return 'audio/mp4';
  if (lowerName.includes('.wav')) return 'audio/wav';
  if (lowerName.includes('.flac')) return 'audio/flac';
  if (
    lowerName.includes('.ogg') ||
    lowerName.includes('.oga') ||
    lowerName.includes('.opus')
  ) {
    return 'audio/ogg';
  }
  if (lowerName.includes('.aac')) return 'audio/aac';
  if (lowerName.includes('.weba') || lowerName.includes('.webm')) return 'audio/webm';
  if (rawMimeType && rawMimeType.startsWith('audio/')) return rawMimeType;
  if (rawMimeType === 'video/mp4') return 'audio/mp4';
  return 'audio/mpeg';
}

export async function getPlayableTrackUrl(
  track: DriveTrack,
  accessToken: string | null
): Promise<string> {
  if (audioBlobUrlCache.has(track.id)) {
    return audioBlobUrlCache.get(track.id)!;
  }

  // 1. Check persistent local CacheStorage first so previously played songs play in 0ms
  const cachedBlob = await getCachedAudioBlob(track.id);
  if (cachedBlob) {
    const objectUrl = URL.createObjectURL(cachedBlob);
    cacheBlobUrl(track.id, objectUrl);
    return objectUrl;
  }

  if (!accessToken) {
    throw new Error(
      'Reconecte o Google Drive para transmitir esta faixa pela primeira vez.'
    );
  }

  const targetFileId = track.streamFileId || track.id;
  const downloadUrl = `${DRIVE_API_BASE}/${encodeURIComponent(
    targetFileId
  )}?alt=media&supportsAllDrives=true`;

  const response = await fetch(downloadUrl, {
    headers: {
      Authorization: `Bearer ${accessToken}`,
    },
  });

  if (response.status === 401 || response.status === 403) {
    const err = new Error(
      'Sessão expirada no Google Drive. Clique em Conectar para renovar.'
    );
    (err as Error & { status?: number }).status = response.status;
    throw err;
  }

  if (!response.ok) {
    throw new Error(
      `Falha ao carregar áudio do Google Drive (${response.status}).`
    );
  }

  const rawBlob = await response.blob();
  const normalizedMime = resolvePlayableMimeType(
    track.name,
    rawBlob.type || track.mimeType
  );
  const playableBlob =
    rawBlob.type === normalizedMime
      ? rawBlob
      : new Blob([rawBlob], { type: normalizedMime });

  // Persist audio in local CacheStorage so future plays of this song are instant
  void saveCachedAudioBlob(track.id, playableBlob);

  const objectUrl = URL.createObjectURL(playableBlob);
  cacheBlobUrl(track.id, objectUrl);
  return objectUrl;
}

function cacheBlobUrl(trackId: string, objectUrl: string) {
  if (audioBlobUrlCache.size >= MAX_CACHED_BLOBS) {
    const oldestKey = audioBlobUrlCache.keys().next().value;
    if (oldestKey) {
      const oldUrl = audioBlobUrlCache.get(oldestKey);
      if (oldUrl) URL.revokeObjectURL(oldUrl);
      audioBlobUrlCache.delete(oldestKey);
    }
  }
  audioBlobUrlCache.set(trackId, objectUrl);
}
