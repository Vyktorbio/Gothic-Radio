import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import type { User } from 'firebase/auth';
import {
  AlertCircle,
  LogOut,
  RefreshCw,
  Database,
} from 'lucide-react';
import {
  initAuth,
  googleSignIn,
  getAccessToken,
  logout,
} from './services/auth';
import {
  scanColecaoAudioTracks,
  getPlayableTrackUrl,
  DEFAULT_COLECAO_FOLDER_ID,
  DEFAULT_COLECAO_FOLDER_URL,
  type DriveFolder,
} from './services/driveMusic';
import {
  groupTracksByArtist,
  filterTracks,
  buildPlaybackQueue,
  getNextTrack,
  getPreviousTrack,
  extractDriveFolderId,
  type DriveTrack,
} from './utils/musicLogic';
import {
  loadFolderMemorySync,
  loadFolderMemoryAsync,
  saveFolderMemory,
} from './utils/folderMemory';
import { GoogleSignInButton } from './components/GoogleSignInButton';
import { RadioDeckPlayer } from './components/RadioDeckPlayer';
import { SearchMenuDrawer } from './components/SearchMenuDrawer';
import { PWAInstallButton, PWAExportModal } from './components/PWAInstallButton';

const IMG_TURNTABLE = '/src/assets/images/radio_vinyl_turntable_1794758138558.jpg';
const IMG_ACOUSTIC_ARTIST = '/src/assets/images/artist_acoustic_portrait_1794758139212.jpg';

const FAVORITES_STORAGE_KEY = 'radio_drive_favorite_ids_v1';
const FOLDER_ID_STORAGE_KEY = 'radio_colecao_folder_id_v1';

function loadSavedFavoriteIds(): Set<string> {
  try {
    const raw = localStorage.getItem(FAVORITES_STORAGE_KEY);
    if (!raw) return new Set();
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      return new Set(parsed.filter((item): item is string => typeof item === 'string'));
    }
  } catch {
    // Ignore storage read errors
  }
  return new Set();
}

function saveFavoriteIds(ids: Set<string>) {
  try {
    localStorage.setItem(FAVORITES_STORAGE_KEY, JSON.stringify(Array.from(ids)));
  } catch {
    // Ignore storage write errors
  }
}

function loadSavedFolderId(): string {
  try {
    const saved = localStorage.getItem(FOLDER_ID_STORAGE_KEY);
    if (saved) {
      const clean = extractDriveFolderId(saved);
      if (clean) return clean;
    }
  } catch {
    // Ignore storage read errors
  }
  return DEFAULT_COLECAO_FOLDER_ID;
}

function saveFolderId(folderId: string) {
  try {
    localStorage.setItem(FOLDER_ID_STORAGE_KEY, folderId);
  } catch {
    // Ignore storage write errors
  }
}

export default function App() {
  // Load initial folder memory synchronously from localStorage (0ms)
  const initialMemory = useMemo(() => loadFolderMemorySync(), []);

  // Authentication & Persistent Login State
  const [needsAuth, setNeedsAuth] = useState<boolean>(
    initialMemory.tracks.length === 0
  );
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Persistent Folder Memory State (Coleção 1lWs0LtOkqLMjOgX_zGRP9MmaDdMdxgnV)
  const [tracks, setTracks] = useState<DriveTrack[]>(initialMemory.tracks);
  const [memoryLastSyncedAt, setMemoryLastSyncedAt] = useState<string | null>(
    initialMemory.meta?.lastSyncedAt || null
  );
  const [availableFolders, setAvailableFolders] = useState<DriveFolder[]>(
    initialMemory.meta?.availableFolders || []
  );
  const [activeFolderName, setActiveFolderName] = useState<string>(
    initialMemory.meta?.folderName || 'Coleção'
  );
  const [savedFolderId, setSavedFolderId] = useState<string>(() =>
    loadSavedFolderId()
  );
  const [isLoadingDrive, setIsLoadingDrive] = useState<boolean>(false);
  const [loadingStatusText, setLoadingStatusText] = useState<string>('');
  const [driveError, setDriveError] = useState<string | null>(null);

  // Favorites, Search Menu & PWA/GitHub Modal State
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(() =>
    loadSavedFavoriteIds()
  );
  const [onlyFavoritesMode, setOnlyFavoritesMode] = useState<boolean>(false);
  const [isSearchMenuOpen, setIsSearchMenuOpen] = useState<boolean>(false);
  const [isPwaModalOpen, setIsPwaModalOpen] = useState<boolean>(false);

  // Radio Filtering & Queue State
  const [selectedArtist, setSelectedArtist] = useState<string>('ALL');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isShuffle, setIsShuffle] = useState<boolean>(false);
  const [shuffleSeed, setShuffleSeed] = useState<number>(0);

  // Audio Playback State
  const [currentTrackId, setCurrentTrackId] = useState<string | null>(
    initialMemory.tracks[0]?.id || null
  );
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [isBuffering, setIsBuffering] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [volume, setVolume] = useState<number>(0.85);
  const [isMuted, setIsMuted] = useState<boolean>(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const memIsCompleteRef = useRef<boolean>(
    Boolean(initialMemory.meta?.scanComplete && initialMemory.tracks.length > 0)
  );

  // Hydrate from IndexedDB on mount in case the library is very large (>5MB)
  useEffect(() => {
    let mounted = true;
    void loadFolderMemoryAsync().then((asyncMem) => {
      if (!mounted) return;
      if (asyncMem.tracks.length > 0) {
        setTracks((prev) =>
          asyncMem.tracks.length > prev.length ? asyncMem.tracks : prev
        );
        setCurrentTrackId((prev) => prev || asyncMem.tracks[0]?.id || null);
        if (asyncMem.meta) {
          setMemoryLastSyncedAt(asyncMem.meta.lastSyncedAt);
          setActiveFolderName(asyncMem.meta.folderName || 'Coleção');
          if (asyncMem.meta.availableFolders) {
            setAvailableFolders(asyncMem.meta.availableFolders);
          }
          if (asyncMem.meta.scanComplete) {
            memIsCompleteRef.current = true;
          }
        }
      }
    });
    return () => {
      mounted = false;
    };
  }, []);

  // Scans the Coleção folder on Google Drive, streaming partial batches live into state
  // and saving the complete snapshot into Persistent Memory (IndexedDB + localStorage)
  const loadColecaoFromDrive = useCallback(
    async (accessToken: string, overrideFolderInput?: string | null) => {
      const targetFolderId =
        extractDriveFolderId(overrideFolderInput || '') ||
        loadSavedFolderId() ||
        DEFAULT_COLECAO_FOLDER_ID;

      saveFolderId(targetFolderId);
      setSavedFolderId(targetFolderId);
      setIsLoadingDrive(true);
      setLoadingStatusText('SCANNING PASTA COLEÇÃO NO GOOGLE DRIVE...');
      setDriveError(null);

      try {
        const result = await scanColecaoAudioTracks(
          accessToken,
          targetFolderId,
          (_count, msg, partialTracks) => {
            setLoadingStatusText(msg.toUpperCase());
            if (partialTracks && partialTracks.length > 0) {
              setTracks(partialTracks);
              setCurrentTrackId((prev) => prev || partialTracks[0]?.id || null);
            }
          }
        );

        const nowIso = new Date().toISOString();
        setTracks(result.tracks);
        setMemoryLastSyncedAt(nowIso);
        setAvailableFolders(result.availableFolders);
        setActiveFolderName(result.activeFolderName);
        setSelectedArtist('ALL');
        setCurrentTrackId((prev) =>
          prev && result.tracks.some((t) => t.id === prev)
            ? prev
            : result.tracks[0]?.id || null
        );
        memIsCompleteRef.current = true;

        // Save complete catalog to persistent memory (localStorage + IndexedDB)
        await saveFolderMemory(result.tracks, {
          folderId: result.activeFolderId,
          folderName: result.activeFolderName,
          trackCount: result.tracks.length,
          lastSyncedAt: nowIso,
          scanComplete: true,
          availableFolders: result.availableFolders,
        });
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status === 401 || status === 403) {
          setNeedsAuth(true);
          setToken(null);
        }
        const message =
          err instanceof Error
            ? err.message
            : 'Erro ao ler a pasta Coleção no Google Drive.';
        setDriveError(message);
      } finally {
        setIsLoadingDrive(false);
        setLoadingStatusText('');
      }
    },
    []
  );

  // Initialize persistent Firebase Auth:
  // If folder memory already has a completed scan, NEVER re-scan on startup!
  useEffect(() => {
    const unsubscribe = initAuth(
      (authedUser, accessToken) => {
        setUser(authedUser);
        if (accessToken) {
          setToken(accessToken);
        }
        setNeedsAuth(false);
        // Only auto-scan if persistent folder memory hasn't completed a scan yet!
        if (accessToken && !memIsCompleteRef.current) {
          void loadColecaoFromDrive(accessToken);
        }
      },
      () => {
        if (!memIsCompleteRef.current) {
          setNeedsAuth(true);
        }
      }
    );
    return () => unsubscribe();
  }, [loadColecaoFromDrive]);

  const handleLogin = async (forceRescan: boolean = false) => {
    setIsLoggingIn(true);
    setDriveError(null);
    try {
      const result = await googleSignIn(user?.email);
      if (result) {
        setUser(result.user);
        setToken(result.accessToken);
        setNeedsAuth(false);
        if (forceRescan || !memIsCompleteRef.current) {
          await loadColecaoFromDrive(result.accessToken, savedFolderId);
        }
      }
    } catch (err: unknown) {
      const message =
        err instanceof Error
          ? err.message
          : 'Não foi possível conectar ao Google Drive.';
      setDriveError(message);
    } finally {
      setIsLoggingIn(false);
    }
  };

  const handleManualRescan = async () => {
    const activeToken = token || (await getAccessToken());
    if (activeToken) {
      await loadColecaoFromDrive(activeToken, savedFolderId);
    } else {
      await handleLogin(true);
    }
  };

  const handleLogout = async () => {
    if (audioRef.current) {
      audioRef.current.pause();
    }
    setIsPlaying(false);
    await logout();
    setUser(null);
    setToken(null);
    setNeedsAuth(true);
  };

  const handleToggleFavorite = useCallback((trackId: string) => {
    setFavoriteIds((prev) => {
      const next = new Set(prev);
      if (next.has(trackId)) {
        next.delete(trackId);
      } else {
        next.add(trackId);
      }
      saveFavoriteIds(next);
      return next;
    });
  }, []);

  // Base pool filtered by Favorites mode if active
  const baseTracksPool = useMemo(() => {
    if (!onlyFavoritesMode) return tracks;
    return tracks.filter((t) => favoriteIds.has(t.id));
  }, [tracks, onlyFavoritesMode, favoriteIds]);

  const artistSummaries = useMemo(
    () => groupTracksByArtist(baseTracksPool),
    [baseTracksPool]
  );

  // Visible tracks inside Search Menu Drawer
  const visibleTracks = useMemo(
    () => filterTracks(baseTracksPool, selectedArtist, searchQuery, 'ALL'),
    [baseTracksPool, selectedArtist, searchQuery]
  );

  // Active Station Queue (filtered by selected artist and favorites mode)
  const stationBaseTracks = useMemo(() => {
    const filtered = filterTracks(baseTracksPool, selectedArtist, '', 'ALL');
    return filtered.length > 0 ? filtered : tracks;
  }, [baseTracksPool, selectedArtist, tracks]);

  const playbackQueue = useMemo(() => {
    void shuffleSeed;
    return buildPlaybackQueue(stationBaseTracks, isShuffle, currentTrackId);
  }, [stationBaseTracks, isShuffle, shuffleSeed]);

  const currentTrack = useMemo(
    () =>
      tracks.find((t) => t.id === currentTrackId) ||
      playbackQueue[0] ||
      visibleTracks[0] ||
      null,
    [tracks, currentTrackId, playbackQueue, visibleTracks]
  );

  const nextTrack = useMemo(
    () => getNextTrack(playbackQueue, currentTrack?.id || null),
    [playbackQueue, currentTrack]
  );

  const startTrackPlayback = useCallback(
    async (track: DriveTrack, autoPlay: boolean = true) => {
      setCurrentTrackId(track.id);
      setCurrentTime(0);
      setDuration(track.durationSeconds || 0);

      if (!audioRef.current) return;

      setIsBuffering(true);
      setDriveError(null);
      try {
        let activeToken = token || (await getAccessToken());
        let audioUrl: string;
        try {
          audioUrl = await getPlayableTrackUrl(track, activeToken);
        } catch (firstErr) {
          if (!activeToken) {
            const signInRes = await googleSignIn(user?.email);
            if (!signInRes) throw firstErr;
            setUser(signInRes.user);
            setToken(signInRes.accessToken);
            setNeedsAuth(false);
            activeToken = signInRes.accessToken;
            audioUrl = await getPlayableTrackUrl(track, activeToken);
          } else {
            throw firstErr;
          }
        }

        if (!audioRef.current) return;

        audioRef.current.src = audioUrl;
        audioRef.current.volume = isMuted ? 0 : volume;
        audioRef.current.load();

        if (autoPlay) {
          await audioRef.current.play();
          setIsPlaying(true);
        } else {
          setIsPlaying(false);
        }
      } catch (err: unknown) {
        const status = (err as { status?: number })?.status;
        if (status === 401 || status === 403) {
          setNeedsAuth(true);
          setToken(null);
        }
        setIsPlaying(false);
        setDriveError(
          err instanceof Error
            ? err.message
            : 'Clique em Conectar Drive para iniciar a transmissão.'
        );
      } finally {
        setIsBuffering(false);
      }
    },
    [token, isMuted, volume, user]
  );

  const handleTogglePlay = useCallback(async () => {
    if (!currentTrack) return;
    const audio = audioRef.current;
    if (!audio) return;

    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }

    if (!audio.src || audio.src === window.location.href) {
      await startTrackPlayback(currentTrack, true);
    } else {
      try {
        await audio.play();
        setIsPlaying(true);
      } catch {
        await startTrackPlayback(currentTrack, true);
      }
    }
  }, [currentTrack, isPlaying, startTrackPlayback]);

  const handleNextTrack = useCallback(() => {
    const next = getNextTrack(playbackQueue, currentTrack?.id || null);
    if (next) {
      startTrackPlayback(next, true);
    }
  }, [playbackQueue, currentTrack, startTrackPlayback]);

  const handlePrevTrack = useCallback(() => {
    if (audioRef.current && audioRef.current.currentTime > 4) {
      audioRef.current.currentTime = 0;
      setCurrentTime(0);
      return;
    }
    const prev = getPreviousTrack(playbackQueue, currentTrack?.id || null);
    if (prev) {
      startTrackPlayback(prev, true);
    }
  }, [playbackQueue, currentTrack, startTrackPlayback]);

  // iOS Lock Screen & Control Center MediaSession integration
  useEffect(() => {
    if (!('mediaSession' in navigator) || !currentTrack) return;
    try {
      navigator.mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist,
        album: `Gothic Rádio · ${activeFolderName}`,
      });
      navigator.mediaSession.setActionHandler('play', () => {
        void handleTogglePlay();
      });
      navigator.mediaSession.setActionHandler('pause', () => {
        void handleTogglePlay();
      });
      navigator.mediaSession.setActionHandler('previoustrack', () => {
        handlePrevTrack();
      });
      navigator.mediaSession.setActionHandler('nexttrack', () => {
        handleNextTrack();
      });
    } catch {
      // Ignore MediaSession errors on unsupported browsers
    }
  }, [currentTrack, activeFolderName, handleTogglePlay, handlePrevTrack, handleNextTrack]);

  // Global desktop keyboard shortcuts: Space (play/pause), ArrowLeft (previous), ArrowRight (next)
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;

      const target = e.target as HTMLElement | null;
      if (target) {
        const tagName = target.tagName;
        if (
          tagName === 'INPUT' ||
          tagName === 'TEXTAREA' ||
          tagName === 'SELECT' ||
          target.isContentEditable
        ) {
          return;
        }
        if (tagName === 'BUTTON' && (e.code === 'Space' || e.key === ' ')) {
          return;
        }
      }

      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        void handleTogglePlay();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNextTrack();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrevTrack();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [handleTogglePlay, handleNextTrack, handlePrevTrack]);

  const handleToggleShuffle = () => {
    setIsShuffle((prev) => {
      const nextState = !prev;
      if (nextState) {
        setShuffleSeed((s) => s + 1);
      }
      return nextState;
    });
  };

  const handleSelectArtist = (artistName: string) => {
    setSelectedArtist(artistName);
    const artistTracks = filterTracks(baseTracksPool, artistName, '', 'ALL');
    if (artistTracks.length > 0) {
      const targetQueue = buildPlaybackQueue(artistTracks, isShuffle, null);
      const firstTrack = targetQueue[0];
      if (firstTrack) {
        startTrackPlayback(firstTrack, true);
      }
    }
  };

  const handleResetStation = () => {
    setOnlyFavoritesMode(false);
    setSelectedArtist('ALL');
    setSearchQuery('');
  };

  const handleSeek = (newTime: number) => {
    setCurrentTime(newTime);
    if (audioRef.current) {
      audioRef.current.currentTime = newTime;
    }
  };

  const handleVolumeChange = (newVol: number) => {
    setVolume(newVol);
    setIsMuted(newVol === 0);
    if (audioRef.current) {
      audioRef.current.volume = newVol;
    }
  };

  const handleToggleMute = () => {
    setIsMuted((prev) => {
      const next = !prev;
      if (audioRef.current) {
        audioRef.current.volume = next ? 0 : volume;
      }
      return next;
    });
  };

  const activeCoverImage =
    selectedArtist === 'ALL' ? IMG_TURNTABLE : IMG_ACOUSTIC_ARTIST;

  const isCurrentFavorite = currentTrack
    ? favoriteIds.has(currentTrack.id)
    : false;

  return (
    <div className="flex min-h-screen flex-col bg-[#070A0E] text-[#E2E8F0]">
      {/* Hidden HTML5 Audio Element */}
      <audio
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) {
            setCurrentTime(audioRef.current.currentTime);
          }
        }}
        onLoadedMetadata={() => {
          if (audioRef.current && Number.isFinite(audioRef.current.duration)) {
            setDuration(audioRef.current.duration);
          }
        }}
        onEnded={handleNextTrack}
        onError={() => {
          if (isPlaying && playbackQueue.length > 1) {
            handleNextTrack();
          }
        }}
        preload="auto"
      />

      {/* 1980s Hardware Top Bar — Strict 3-Zone Contract */}
      <header className="flex items-center justify-between gap-6 border-b border-[#1E2634] bg-[#0A0E14] px-6 py-3">
        {/* Zone 1: Gothic Rádio 80s Hardware Wordmark */}
        <a
          href="#radio"
          onClick={(e) => {
            e.preventDefault();
            handleResetStation();
          }}
          className="flex items-center gap-2 font-display text-sm font-extrabold tracking-widest text-white whitespace-nowrap shrink-0"
        >
          <span>GOTHIC RÁDIO</span>
          <span className="rounded-xs border border-cyan-500/40 bg-cyan-950/40 px-1.5 py-0.5 font-mono text-[10px] text-cyan-300">
            80s DIGITAL
          </span>
        </a>

        {/* Zone 2: Minimalist Hardware Navigation */}
        <nav
          aria-label="Menu rápido"
          className="flex items-center gap-4 font-mono text-xs text-slate-300"
        >
          <button
            type="button"
            onClick={() => setIsSearchMenuOpen(true)}
            className="hover:text-cyan-300 transition-colors whitespace-nowrap shrink-0"
          >
            Buscar ({tracks.length})
          </button>
          <button
            type="button"
            onClick={() => setOnlyFavoritesMode((prev) => !prev)}
            className={`transition-colors whitespace-nowrap shrink-0 ${
              onlyFavoritesMode ? 'text-rose-400 font-bold' : 'hover:text-cyan-300'
            }`}
          >
            Favoritas ({favoriteIds.size})
          </button>
          <PWAInstallButton onOpenModal={() => setIsPwaModalOpen(true)} />
        </nav>

        {/* Zone 3: Primary Action */}
        <div className="flex items-center gap-2 shrink-0">
          {!user && needsAuth ? (
            <button
              type="button"
              onClick={() => handleLogin(false)}
              disabled={isLoggingIn}
              className="hw-button rounded-md border-amber-500/60 px-3.5 py-1.5 font-mono text-xs font-bold tracking-wider text-amber-300 hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {isLoggingIn ? 'CONECTANDO...' : 'Conectar Drive'}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleManualRescan}
              disabled={isLoadingDrive}
              title="Ler todas as músicas da pasta Coleção e salvar na memória"
              className="hw-button inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs font-semibold tracking-wider text-cyan-300 hover:text-white disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${isLoadingDrive ? 'animate-spin' : ''}`}
              />
              <span>{isLoadingDrive ? 'LENDO...' : 'Scan Memória'}</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Centered Minimalist Viewport */}
      <main
        id="radio"
        className="flex flex-1 flex-col items-center justify-center px-4 py-6"
      >
        {/* Loading Progress Indicator when scanning Coleção */}
        {isLoadingDrive && loadingStatusText && (
          <div
            aria-live="polite"
            className="vfd-screen mb-4 w-full max-w-lg rounded-md border border-cyan-500/40 px-4 py-2.5 text-center font-mono text-xs tracking-wider text-cyan-300"
          >
            {loadingStatusText}
          </div>
        )}

        {/* Error Alert */}
        {driveError && (
          <div
            role="alert"
            className="mb-4 flex w-full max-w-lg items-center justify-between gap-3 rounded-md border border-rose-500/40 bg-rose-950/30 px-4 py-3 font-mono text-xs text-rose-200"
          >
            <div className="flex items-center gap-2">
              <AlertCircle className="h-4 w-4 shrink-0 text-rose-400" />
              <span>{driveError}</span>
            </div>
            <button
              type="button"
              onClick={() => handleLogin(true)}
              className="hw-button rounded-md px-2.5 py-1 font-mono text-xs font-bold text-amber-300 whitespace-nowrap shrink-0"
            >
              CONECTAR
            </button>
          </div>
        )}

        {/* 1980s Digital Synthesizer Radio Deck Player */}
        <RadioDeckPlayer
          currentTrack={currentTrack}
          nextTrack={nextTrack}
          totalQueueCount={stationBaseTracks.length}
          isPlaying={isPlaying}
          isBuffering={isBuffering}
          isShuffle={isShuffle}
          isFavorite={isCurrentFavorite}
          onlyFavoritesMode={onlyFavoritesMode}
          selectedArtist={selectedArtist}
          selectedSource="ALL"
          currentTime={currentTime}
          duration={duration}
          volume={volume}
          isMuted={isMuted}
          coverImageUrl={activeCoverImage}
          memoryLastSyncedAt={memoryLastSyncedAt}
          onTogglePlay={handleTogglePlay}
          onPrevTrack={handlePrevTrack}
          onNextTrack={handleNextTrack}
          onToggleShuffle={handleToggleShuffle}
          onToggleFavoriteCurrent={() => {
            if (currentTrack) {
              handleToggleFavorite(currentTrack.id);
            }
          }}
          onToggleOnlyFavoritesMode={() =>
            setOnlyFavoritesMode((prev) => !prev)
          }
          onOpenSearchMenu={() => setIsSearchMenuOpen(true)}
          onSeek={handleSeek}
          onVolumeChange={handleVolumeChange}
          onToggleMute={handleToggleMute}
          onResetStation={handleResetStation}
        />

        {/* Persistent Folder Memory & Account Status Strip below Deck */}
        <div className="mt-4 flex w-full max-w-lg flex-wrap items-center justify-between gap-3 rounded-lg border border-[#222B38] bg-[#0E131B] px-4 py-2.5 font-mono text-xs text-slate-400">
          {!user ? (
            <>
              <div className="flex items-center gap-2">
                <Database className="h-3.5 w-3.5 text-cyan-400 shrink-0" />
                <span className="text-slate-300">
                  {tracks.length > 0
                    ? `MEMÓRIA SALVA: ${tracks.length} MÚSICAS`
                    : 'PASTA COLEÇÃO VINCULADA'}
                </span>
              </div>
              <GoogleSignInButton
                onClick={() => handleLogin(false)}
                disabled={isLoggingIn}
                label="Sign in with Google"
              />
            </>
          ) : (
            <>
              <div className="flex items-center gap-2 truncate">
                <Database className="h-3.5 w-3.5 text-emerald-400 shrink-0" />
                <span className="text-slate-200 truncate">
                  {user.displayName || user.email}
                </span>
                <span className="text-slate-600">·</span>
                <span className="text-cyan-300 font-bold">
                  MEM: {tracks.length} FAIXAS
                </span>
              </div>
              <div className="flex items-center gap-3 shrink-0">
                <button
                  type="button"
                  onClick={handleManualRescan}
                  disabled={isLoadingDrive}
                  className="text-amber-300 hover:underline whitespace-nowrap"
                >
                  {isLoadingDrive ? 'Lendo...' : 'Recarregar Pasta'}
                </button>
                <button
                  type="button"
                  onClick={handleLogout}
                  className="inline-flex items-center gap-1 text-slate-400 transition-colors hover:text-white whitespace-nowrap"
                >
                  <LogOut className="h-3.5 w-3.5" />
                  <span>Sair</span>
                </button>
              </div>
            </>
          )}
        </div>
      </main>

      {/* Slide-Over Search & Selection Menu */}
      <SearchMenuDrawer
        isOpen={isSearchMenuOpen}
        onClose={() => setIsSearchMenuOpen(false)}
        tracks={tracks}
        visibleTracks={visibleTracks}
        artistSummaries={artistSummaries}
        availableFolders={availableFolders}
        activeFolderName={activeFolderName}
        savedFolderInput={
          savedFolderId === DEFAULT_COLECAO_FOLDER_ID
            ? DEFAULT_COLECAO_FOLDER_URL
            : savedFolderId
        }
        currentTrack={currentTrack}
        isPlaying={isPlaying}
        favoriteIds={favoriteIds}
        onlyFavoritesMode={onlyFavoritesMode}
        selectedArtist={selectedArtist}
        searchQuery={searchQuery}
        onSearchChange={setSearchQuery}
        onSelectArtist={(artist) => {
          handleSelectArtist(artist);
        }}
        onSetOnlyFavoritesMode={setOnlyFavoritesMode}
        onPlayTrack={(track) => {
          startTrackPlayback(track, true);
          setIsSearchMenuOpen(false);
        }}
        onToggleFavorite={handleToggleFavorite}
        onSelectOverrideFolder={(folderInput) => {
          const clean = extractDriveFolderId(folderInput);
          if (clean) {
            saveFolderId(clean);
            setSavedFolderId(clean);
            memIsCompleteRef.current = false;
            if (token) {
              void loadColecaoFromDrive(token, clean);
            } else {
              void handleLogin(true);
            }
          }
        }}
      />

      {/* GitHub Direct Publish & Standalone HTML / iPhone PWA Modal */}
      <PWAExportModal
        isOpen={isPwaModalOpen}
        onClose={() => setIsPwaModalOpen(false)}
        tracks={tracks}
      />
    </div>
  );
}
