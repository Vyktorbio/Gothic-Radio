export interface DriveTrack {
  id: string;
  streamFileId?: string;
  name: string;
  title: string;
  artist: string;
  albumOrFolder: string;
  sourceFolder: string; // e.g. "Coleção", "Organizar", or "Músicas"
  mimeType: string;
  sizeBytes: number;
  durationSeconds?: number;
  trackNumber?: number;
  isDemo?: boolean;
  demoFreqProfile?: number[];
}

export interface ArtistSummary {
  name: string;
  trackCount: number;
  totalSizeBytes: number;
  tracks: DriveTrack[];
}

export interface RawFolderNode {
  id: string;
  name: string;
  parents?: string[];
  shortcutTargetId?: string;
}

export interface ResolvedFolderInfo {
  id: string;
  name: string;
  sourceFolder: string;
  artistFolder: string | null;
  fullPath: string;
  depth: number;
}

const STRICT_AUDIO_EXTENSIONS =
  /\.(mp3|mp4|wav|m4a|m4b|m4p|m4r|flac|ogg|oga|opus|aac|wma|aiff|aif|alac|ape|wv|mpc|tta|mp2|mpga|mpa|weba|webm|3gp|ac3|dts|amr|au|pcm|mid|midi)(\s*\(\d+\))?$/i;

const NON_AUDIO_EXTENSIONS =
  /\.(jpg|jpeg|png|gif|webp|bmp|svg|ico|tiff|heic|pdf|txt|rtf|doc|docx|xls|xlsx|ppt|pptx|csv|json|xml|html|htm|md|ini|db|ds_store|cue|log|m3u|m3u8|pls|sfv|nfo|zip|rar|7z|tar|gz|bz2|exe|dll|dmg|iso|apk|bat|sh|py|js|ts|css|srt|vtt|sub|ass)(\s*\(\d+\))?$/i;

/**
 * Container folders inside "Músicas" that hold collections of songs/artists
 * (such as "Coleção" and "Organizar") and should NOT be treated as an Artist name.
 */
export function isSourceContainerFolderName(rawName: string): boolean {
  const normalized = (rawName || '')
    .trim()
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  return /^(musicas|minhas musicas|music|colecao|minha colecao|organizar|para organizar|a organizar|meu drive|my drive|audios|mp3|mp4|wav|downloads|todas|geral)$/.test(
    normalized
  );
}

export function isDiscFolderName(rawName: string): boolean {
  const normalized = (rawName || '').trim();
  return /^(cd\s*\d+|disco\s*\d+|disc\s*\d+|vol\.?\s*\d+|parte\s*\d+)$/i.test(
    normalized
  );
}

/**
 * Normalizes the display name of the two primary source folders ("Coleção" and "Organizar")
 * even if they have trailing spaces in Google Drive (e.g. "Coleção " or "Organizar ").
 */
export function normalizeSourceFolderLabel(rawName: string): string {
  const trimmed = (rawName || '').trim();
  const normalized = trimmed
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');

  if (normalized === 'colecao' || normalized.startsWith('colecao')) {
    return 'Coleção';
  }
  if (normalized === 'organizar' || normalized.includes('organizar')) {
    return 'Organizar';
  }
  if (normalized === 'musicas' || normalized === 'music') {
    return 'Músicas';
  }
  return trimmed || 'Músicas';
}

/**
 * Extracts a Google Drive Folder ID from a pasted URL
 * (e.g. https://drive.google.com/drive/folders/1abc123?usp=sharing,
 *  https://drive.google.com/drive/u/0/folders/1abc123,
 *  https://drive.google.com/open?id=1abc123)
 * or a raw Drive Folder ID string.
 */
export function extractDriveFolderId(rawInput: string): string | null {
  const trimmed = (rawInput || '').trim();
  if (!trimmed) return null;

  const foldersMatch = trimmed.match(/\/folders\/([a-zA-Z0-9_-]{10,})/);
  if (foldersMatch && foldersMatch[1]) {
    return foldersMatch[1];
  }

  const idParamMatch = trimmed.match(/[?&]id=([a-zA-Z0-9_-]{10,})/);
  if (idParamMatch && idParamMatch[1]) {
    return idParamMatch[1];
  }

  if (/^[a-zA-Z0-9_-]{10,80}$/.test(trimmed)) {
    return trimmed;
  }

  return null;
}

/**
 * Determines whether a Google Drive file is a playable audio file
 * (MP3, MP4, WAV, M4A, FLAC, OGG, AAC, OPUS, WMA, etc.).
 * Strictly rejects images, documents, archives, subtitles, and system files.
 */
export function isAudioFile(fileName: string, mimeType: string = ''): boolean {
  const cleanName = (fileName || '').trim();
  const cleanMime = (mimeType || '').toLowerCase().trim();

  if (!cleanName || cleanName.startsWith('.')) return false;
  if (cleanMime === 'application/vnd.google-apps.folder') return false;
  if (
    cleanMime.startsWith('application/vnd.google-apps.') &&
    cleanMime !== 'application/vnd.google-apps.audio'
  ) {
    return false;
  }

  if (
    cleanMime.startsWith('image/') ||
    cleanMime.startsWith('text/') ||
    cleanMime.includes('pdf') ||
    cleanMime.includes('document') ||
    cleanMime.includes('spreadsheet') ||
    cleanMime.includes('presentation') ||
    cleanMime.includes('zip') ||
    cleanMime.includes('rar') ||
    cleanMime.includes('7z') ||
    cleanMime.includes('tar') ||
    cleanMime.includes('json') ||
    cleanMime.includes('xml') ||
    cleanMime.includes('msword') ||
    cleanMime.includes('officedocument')
  ) {
    return false;
  }

  if (NON_AUDIO_EXTENSIONS.test(cleanName)) {
    return false;
  }

  if (STRICT_AUDIO_EXTENSIONS.test(cleanName)) {
    return true;
  }

  if (
    cleanMime.startsWith('audio/') ||
    cleanMime === 'application/ogg' ||
    cleanMime === 'application/x-ogg' ||
    cleanMime === 'application/flac' ||
    cleanMime === 'application/x-flac' ||
    cleanMime === 'application/x-wav' ||
    cleanMime === 'application/x-m4a' ||
    cleanMime === 'video/mp4' ||
    cleanMime === 'video/ogg' ||
    cleanMime === 'video/webm'
  ) {
    return true;
  }

  return false;
}

/**
 * Traverses all descendant subfolders starting from one or more root folder IDs
 * (e.g. "Músicas", "Coleção", "Organizar") up to arbitrary depth (15+ levels).
 * Recognizes "Coleção" and "Organizar" as source folders so that folders inside them
 * are properly identified as Artist folders!
 */
export function buildFolderHierarchy(
  rootFolders: { id: string; name: string }[],
  allFolders: RawFolderNode[]
): Map<string, ResolvedFolderInfo> {
  const result = new Map<string, ResolvedFolderInfo>();
  const childrenByParent = new Map<string, RawFolderNode[]>();

  for (const folder of allFolders) {
    for (const parentId of folder.parents || []) {
      const list = childrenByParent.get(parentId);
      if (list) {
        list.push(folder);
      } else {
        childrenByParent.set(parentId, [folder]);
      }
    }
  }

  const queue: ResolvedFolderInfo[] = [];

  for (const root of rootFolders) {
    const cleanRootName = root.name.trim();
    const sourceLabel = normalizeSourceFolderLabel(cleanRootName);
    const isContainer = isSourceContainerFolderName(cleanRootName);

    const rootInfo: ResolvedFolderInfo = {
      id: root.id,
      name: cleanRootName,
      sourceFolder: sourceLabel,
      artistFolder: isContainer || isDiscFolderName(cleanRootName) ? null : cleanRootName,
      fullPath: cleanRootName,
      depth: 0,
    };
    result.set(root.id, rootInfo);
    queue.push(rootInfo);
  }

  while (queue.length > 0) {
    const current = queue.shift()!;
    if (current.depth > 15) continue;

    const children = childrenByParent.get(current.id) || [];
    for (const child of children) {
      const effectiveId = child.shortcutTargetId || child.id;
      if (result.has(effectiveId)) continue;

      const cleanChildName = child.name.trim();
      const nextDepth = current.depth + 1;
      const childIsSourceContainer = isSourceContainerFolderName(cleanChildName);

      // Update sourceFolder if this child is "Coleção" or "Organizar" inside "Músicas"
      const nextSourceFolder = childIsSourceContainer
        ? normalizeSourceFolderLabel(cleanChildName)
        : current.sourceFolder;

      // If parent had no artistFolder yet (because parent was "Músicas", "Coleção", or "Organizar"),
      // and this child is NOT a container or disc folder, then this child is the Artist folder!
      const inferredArtistFolder =
        current.artistFolder ||
        (!childIsSourceContainer && !isDiscFolderName(cleanChildName)
          ? cleanChildName
          : null);

      const childInfo: ResolvedFolderInfo = {
        id: effectiveId,
        name: cleanChildName,
        sourceFolder: nextSourceFolder,
        artistFolder: inferredArtistFolder,
        fullPath: `${current.fullPath} / ${cleanChildName}`,
        depth: nextDepth,
      };

      result.set(effectiveId, childInfo);
      if (child.id !== effectiveId) {
        result.set(child.id, childInfo);
      }
      queue.push(childInfo);
    }
  }

  return result;
}

/**
 * Parses a Google Drive filename and its folder hierarchy into structured
 * { title, artist, albumOrFolder, trackNumber } metadata.
 */
export function parseTrackFilename(
  rawFileName: string,
  parentFolderName: string = 'Músicas',
  rootFolderName: string = 'Músicas',
  hierarchyArtistFolder?: string | null,
  hierarchyFullPath?: string | null
): {
  title: string;
  artist: string;
  albumOrFolder: string;
  trackNumber?: number;
} {
  const withoutExt = rawFileName.replace(STRICT_AUDIO_EXTENSIONS, '').trim();
  const normalizedParent = (parentFolderName || 'Músicas').trim();
  const normalizedRoot = (rootFolderName || 'Músicas').trim();

  const isInsideMeaningfulSubfolder =
    normalizedParent.length > 0 &&
    normalizedParent.toLowerCase() !== normalizedRoot.toLowerCase() &&
    !isSourceContainerFolderName(normalizedParent);

  const fallbackFolderArtist =
    (hierarchyArtistFolder &&
    !isSourceContainerFolderName(hierarchyArtistFolder) &&
    !isDiscFolderName(hierarchyArtistFolder)
      ? cleanArtistName(hierarchyArtistFolder)
      : null) ||
    (isInsideMeaningfulSubfolder && !isDiscFolderName(normalizedParent)
      ? cleanArtistName(normalizedParent)
      : null);

  const albumDisplay =
    hierarchyFullPath ||
    (isInsideMeaningfulSubfolder
      ? normalizedParent
      : normalizeSourceFolderLabel(normalizedParent));

  let working = withoutExt;
  let trackNumber: number | undefined;

  // Strip optional leading "[01]" or "(01)" or "01 - " or "01. " or "01_"
  const leadingTrackMatch = working.match(
    /^(?:\[?\(?(\d{1,3})\)?\]?\s*(?:[-._)]|\s+)\s*)(.+)$/
  );
  if (leadingTrackMatch) {
    const parsedNum = parseInt(leadingTrackMatch[1], 10);
    const remainder = leadingTrackMatch[2].trim();
    if (remainder.length > 0 && parsedNum > 0 && parsedNum < 999) {
      trackNumber = parsedNum;
      working = remainder;
    }
  }

  // Split by " - " or " – " (en-dash) or " — " (em-dash)
  const parts = working
    .split(/\s+[-–—]\s+/)
    .map((p) => p.trim())
    .filter(Boolean);

  if (parts.length >= 2) {
    if (parts.length >= 3 && /^\d{1,3}$/.test(parts[1])) {
      trackNumber = trackNumber ?? parseInt(parts[1], 10);
      const candidateArtist = cleanArtistName(parts[0]);
      const candidateTitle = parts.slice(2).join(' - ').trim();
      return {
        artist:
          !isSourceContainerFolderName(candidateArtist) &&
          candidateArtist !== 'Artista Desconhecido'
            ? candidateArtist
            : fallbackFolderArtist || 'Artista Desconhecido',
        title: candidateTitle || withoutExt,
        albumOrFolder: albumDisplay,
        trackNumber,
      };
    }

    const candidateArtist = cleanArtistName(parts[0]);
    const candidateTitle = parts.slice(1).join(' - ').trim();
    return {
      artist:
        !isSourceContainerFolderName(candidateArtist) &&
        candidateArtist !== 'Artista Desconhecido'
          ? candidateArtist
          : fallbackFolderArtist || 'Artista Desconhecido',
      title: candidateTitle || withoutExt,
      albumOrFolder: albumDisplay,
      trackNumber,
    };
  }

  if (fallbackFolderArtist) {
    return {
      artist: fallbackFolderArtist,
      title: working || withoutExt,
      albumOrFolder: albumDisplay,
      trackNumber,
    };
  }

  return {
    artist: 'Artista Desconhecido',
    title: working || withoutExt,
    albumOrFolder: albumDisplay,
    trackNumber,
  };
}

export function cleanArtistName(raw: string): string {
  const trimmed = raw.replace(/\s+/g, ' ').trim();
  if (!trimmed) return 'Artista Desconhecido';
  return trimmed;
}

/**
 * Groups a list of tracks by artist name, sorted alphabetically with
 * "Artista Desconhecido" placed at the end.
 */
export function groupTracksByArtist(tracks: DriveTrack[]): ArtistSummary[] {
  const map = new Map<string, DriveTrack[]>();

  for (const track of tracks) {
    const artistKey = track.artist || 'Artista Desconhecido';
    const existing = map.get(artistKey);
    if (existing) {
      existing.push(track);
    } else {
      map.set(artistKey, [track]);
    }
  }

  const summaries: ArtistSummary[] = Array.from(map.entries()).map(
    ([name, artistTracks]) => {
      const totalSizeBytes = artistTracks.reduce(
        (acc, t) => acc + (t.sizeBytes || 0),
        0
      );
      return {
        name,
        trackCount: artistTracks.length,
        totalSizeBytes,
        tracks: artistTracks,
      };
    }
  );

  summaries.sort((a, b) => {
    if (a.name === 'Artista Desconhecido' && b.name !== 'Artista Desconhecido')
      return 1;
    if (b.name === 'Artista Desconhecido' && a.name !== 'Artista Desconhecido')
      return -1;
    return a.name.localeCompare(b.name, 'pt-BR', { sensitivity: 'base' });
  });

  return summaries;
}

/**
 * Filters tracks by selected artist ('ALL' or artist name), optional source folder
 * ('ALL', 'Coleção', 'Organizar'), and optional search query.
 */
export function filterTracks(
  tracks: DriveTrack[],
  selectedArtist: string,
  searchQuery: string,
  selectedSource: string = 'ALL'
): DriveTrack[] {
  const normalizedQuery = searchQuery.trim().toLowerCase();

  return tracks.filter((track) => {
    if (selectedSource !== 'ALL' && track.sourceFolder !== selectedSource) {
      return false;
    }
    if (selectedArtist !== 'ALL' && track.artist !== selectedArtist) {
      return false;
    }
    if (!normalizedQuery) {
      return true;
    }
    return (
      track.title.toLowerCase().includes(normalizedQuery) ||
      track.artist.toLowerCase().includes(normalizedQuery) ||
      track.albumOrFolder.toLowerCase().includes(normalizedQuery) ||
      track.sourceFolder.toLowerCase().includes(normalizedQuery) ||
      track.name.toLowerCase().includes(normalizedQuery)
    );
  });
}

/**
 * Builds a playback order of tracks.
 */
export function buildPlaybackQueue(
  tracks: DriveTrack[],
  isShuffle: boolean,
  currentTrackId?: string | null,
  randomFn: () => number = Math.random
): DriveTrack[] {
  if (tracks.length <= 1 || !isShuffle) {
    return [...tracks];
  }

  const pool = [...tracks];
  let pinnedFirst: DriveTrack | undefined;

  if (currentTrackId) {
    const currentIdx = pool.findIndex((t) => t.id === currentTrackId);
    if (currentIdx !== -1) {
      pinnedFirst = pool.splice(currentIdx, 1)[0];
    }
  }

  for (let i = pool.length - 1; i > 0; i--) {
    const j = Math.floor(randomFn() * (i + 1));
    const temp = pool[i];
    pool[i] = pool[j];
    pool[j] = temp;
  }

  return pinnedFirst ? [pinnedFirst, ...pool] : pool;
}

export function getNextTrack(
  queue: DriveTrack[],
  currentTrackId: string | null
): DriveTrack | null {
  if (queue.length === 0) return null;
  if (!currentTrackId) return queue[0];

  const idx = queue.findIndex((t) => t.id === currentTrackId);
  if (idx === -1) return queue[0];

  const nextIdx = (idx + 1) % queue.length;
  return queue[nextIdx];
}

export function getPreviousTrack(
  queue: DriveTrack[],
  currentTrackId: string | null
): DriveTrack | null {
  if (queue.length === 0) return null;
  if (!currentTrackId) return queue[0];

  const idx = queue.findIndex((t) => t.id === currentTrackId);
  if (idx === -1) return queue[0];

  const prevIdx = (idx - 1 + queue.length) % queue.length;
  return queue[prevIdx];
}

export function formatDuration(seconds?: number): string {
  if (
    seconds === undefined ||
    seconds === null ||
    !Number.isFinite(seconds) ||
    seconds < 0
  ) {
    return '--:--';
  }
  const totalSec = Math.floor(seconds);
  const mins = Math.floor(totalSec / 60);
  const secs = totalSec % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

export function formatFileSize(bytes?: number): string {
  if (!bytes || bytes <= 0) return 'Áudio';
  const mb = bytes / (1024 * 1024);
  if (mb >= 1) {
    return `${mb.toFixed(1)} MB`;
  }
  const kb = Math.max(1, Math.round(bytes / 1024));
  return `${kb} KB`;
}

export function formatAudioFormat(mimeType: string, fileName: string): string {
  const extMatch = fileName.match(/\.([a-z0-9]+)$/i);
  if (extMatch) {
    return extMatch[1].toUpperCase();
  }
  if (mimeType.includes('mpeg') || mimeType.includes('mp3')) return 'MP3';
  if (mimeType.includes('flac')) return 'FLAC';
  if (mimeType.includes('wav')) return 'WAV';
  if (mimeType.includes('mp4') || mimeType.includes('m4a')) return 'M4A';
  if (mimeType.includes('ogg')) return 'OGG';
  return 'AUDIO';
}
