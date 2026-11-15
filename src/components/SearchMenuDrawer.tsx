import React, { useState } from 'react';
import {
  Search,
  X,
  Heart,
  Play,
  Pause,
  Users,
  Folder,
  Link2,
} from 'lucide-react';
import {
  formatAudioFormat,
  extractDriveFolderId,
  type DriveTrack,
  type ArtistSummary,
} from '../utils/musicLogic';
import type { DriveFolder } from '../services/driveMusic';

interface SearchMenuDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: DriveTrack[];
  visibleTracks: DriveTrack[];
  artistSummaries: ArtistSummary[];
  availableFolders: DriveFolder[];
  activeFolderName: string;
  savedFolderInput: string;
  currentTrack: DriveTrack | null;
  isPlaying: boolean;
  favoriteIds: Set<string>;
  onlyFavoritesMode: boolean;
  selectedArtist: string;
  searchQuery: string;
  onSearchChange: (q: string) => void;
  onSelectArtist: (artist: string) => void;
  onSetOnlyFavoritesMode: (enabled: boolean) => void;
  onPlayTrack: (track: DriveTrack) => void;
  onToggleFavorite: (trackId: string) => void;
  onSelectOverrideFolder: (folderInput: string) => void;
}

const INITIAL_DRAWER_LIMIT = 1000;

export const SearchMenuDrawer: React.FC<SearchMenuDrawerProps> = ({
  isOpen,
  onClose,
  tracks,
  visibleTracks,
  artistSummaries,
  availableFolders,
  activeFolderName,
  savedFolderInput,
  currentTrack,
  isPlaying,
  favoriteIds,
  onlyFavoritesMode,
  selectedArtist,
  searchQuery,
  onSearchChange,
  onSelectArtist,
  onSetOnlyFavoritesMode,
  onPlayTrack,
  onToggleFavorite,
  onSelectOverrideFolder,
}) => {
  const [activeTab, setActiveTab] = useState<'musicas' | 'artistas' | 'pastas'>('musicas');
  const [limit, setLimit] = useState<number>(INITIAL_DRAWER_LIMIT);
  const [folderLinkInput, setFolderLinkInput] = useState<string>(savedFolderInput || '');
  const [folderLinkError, setFolderLinkError] = useState<string | null>(null);

  if (!isOpen) return null;

  const displayedTracks = visibleTracks.slice(0, limit);

  const handleApplyFolderLink = (e: React.FormEvent) => {
    e.preventDefault();
    setFolderLinkError(null);
    const extracted = extractDriveFolderId(folderLinkInput);
    if (!extracted) {
      setFolderLinkError(
        'Cole um link válido de pasta do Google Drive (ex: https://drive.google.com/drive/folders/...) ou o ID da pasta.'
      );
      return;
    }
    onSelectOverrideFolder(extracted);
    setActiveTab('musicas');
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/75 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-label="Menu de busca e artistas da pasta Coleção"
    >
      <div className="flex h-full w-full max-w-xl flex-col border-l border-slate-800 bg-[#0D111A] text-slate-100 shadow-2xl">
        {/* Header + Search Input */}
        <div className="border-b border-slate-800/90 p-5 space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h2 className="font-display text-base font-bold text-white">
                Buscar na Pasta {activeFolderName}
              </h2>
              <p className="text-xs text-slate-400 font-mono tabular-nums">
                {tracks.length} {tracks.length === 1 ? 'música' : 'músicas'} · Exclusivamente {activeFolderName}
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              aria-label="Fechar menu de busca"
              className="rounded-lg p-2 text-slate-400 transition-colors hover:bg-slate-800 hover:text-white"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {/* Direct Search Input */}
          <div className="relative">
            <Search className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-500" />
            <input
              type="search"
              value={searchQuery}
              onChange={(e) => {
                onSearchChange(e.target.value);
                setActiveTab('musicas');
                setLimit(INITIAL_DRAWER_LIMIT);
              }}
              placeholder="Buscar música ou artista na Coleção..."
              aria-label="Buscar música ou artista"
              autoFocus
              className="w-full rounded-xl border border-slate-800 bg-[#080B10] py-2.5 pl-10 pr-4 text-sm text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
            />
          </div>

          {/* Favorites & All Filter Bar */}
          <div className="flex flex-wrap items-center gap-1.5">
            <button
              type="button"
              onClick={() => {
                onSetOnlyFavoritesMode(false);
                onSelectArtist('ALL');
              }}
              className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                !onlyFavoritesMode && selectedArtist === 'ALL'
                  ? 'bg-amber-500 text-slate-950 font-semibold'
                  : 'bg-[#080B10] text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              Todas da Coleção ({tracks.length})
            </button>

            <button
              type="button"
              onClick={() => onSetOnlyFavoritesMode(!onlyFavoritesMode)}
              className={`inline-flex items-center gap-1 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                onlyFavoritesMode
                  ? 'bg-rose-500 text-white font-semibold'
                  : 'bg-[#080B10] text-slate-300 border border-slate-800 hover:border-slate-700'
              }`}
            >
              <Heart className="h-3 w-3 fill-current" />
              <span>Favoritas ({favoriteIds.size})</span>
            </button>
          </div>

          {/* View Switch: Músicas vs Artistas vs Pasta do Drive */}
          <div className="flex items-center justify-between border-t border-slate-800/80 pt-3">
            <div className="flex items-center gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('musicas')}
                className={`rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'musicas'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                Músicas ({visibleTracks.length})
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('artistas')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'artistas'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Users className="h-3.5 w-3.5" />
                <span>Artistas ({artistSummaries.length})</span>
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('pastas')}
                className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                  activeTab === 'pastas'
                    ? 'bg-slate-800 text-white'
                    : 'text-slate-400 hover:text-white'
                }`}
              >
                <Folder className="h-3.5 w-3.5" />
                <span>Pasta do Drive</span>
              </button>
            </div>

            {selectedArtist !== 'ALL' && (
              <button
                type="button"
                onClick={() => onSelectArtist('ALL')}
                className="text-xs text-amber-400 hover:underline whitespace-nowrap shrink-0"
              >
                Artista: {selectedArtist} (Limpar)
              </button>
            )}
          </div>
        </div>

        {/* Drawer Body */}
        <div className="flex-1 overflow-y-auto p-4">
          {activeTab === 'pastas' ? (
            <div className="space-y-4">
              {/* Paste Folder Link or ID directly */}
              <form
                onSubmit={handleApplyFolderLink}
                className="rounded-xl border border-slate-800 bg-[#080B10] p-4 space-y-3"
              >
                <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                  <Link2 className="h-3.5 w-3.5" />
                  <span>Colar Link ou ID da Pasta "Coleção"</span>
                </div>
                <p className="text-xs text-slate-400 leading-relaxed">
                  Cole abaixo o link da sua pasta <strong className="text-white">Coleção</strong> no Google Drive (ex: <code className="text-slate-300 font-mono">https://drive.google.com/drive/folders/...</code>):
                </p>
                <div className="flex gap-2">
                  <input
                    type="text"
                    value={folderLinkInput}
                    onChange={(e) => setFolderLinkInput(e.target.value)}
                    placeholder="https://drive.google.com/drive/folders/..."
                    className="flex-1 rounded-lg border border-slate-800 bg-[#111622] px-3 py-2 text-xs text-white placeholder-slate-500 focus:border-amber-500 focus:outline-none"
                  />
                  <button
                    type="submit"
                    className="rounded-lg bg-amber-500 px-3.5 py-2 text-xs font-semibold text-slate-950 hover:bg-amber-400 whitespace-nowrap shrink-0"
                  >
                    Carregar Pasta
                  </button>
                </div>
                {folderLinkError && (
                  <p className="text-xs text-red-400">{folderLinkError}</p>
                )}
              </form>

              {/* Or Pick from Discovered Drive Folders */}
              {availableFolders.length > 0 && (
                <div className="space-y-2">
                  <div className="text-xs font-semibold text-slate-300">
                    Ou selecione uma pasta encontrada no seu Google Drive:
                  </div>
                  {availableFolders.map((folder) => (
                    <button
                      key={folder.id}
                      type="button"
                      onClick={() => {
                        setFolderLinkInput(folder.id);
                        onSelectOverrideFolder(folder.id);
                        setActiveTab('musicas');
                      }}
                      className="flex w-full items-center justify-between rounded-xl border border-slate-800 bg-[#080B10] px-3.5 py-2.5 text-left text-xs text-slate-200 hover:border-amber-500/60"
                    >
                      <span className="inline-flex items-center gap-2 truncate">
                        <Folder className="h-3.5 w-3.5 text-amber-400 shrink-0" />
                        <span className="truncate">{folder.name}</span>
                      </span>
                      <span className="text-amber-400 font-medium shrink-0">Selecionar</span>
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : activeTab === 'artistas' ? (
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => {
                  onSelectArtist('ALL');
                  setActiveTab('musicas');
                }}
                className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs transition-colors ${
                  selectedArtist === 'ALL'
                    ? 'border-amber-500/70 bg-amber-500/15 text-white font-semibold'
                    : 'border-slate-800 bg-[#080B10] text-slate-300 hover:border-slate-700'
                }`}
              >
                <span>Todos os Artistas</span>
                <span className="font-mono tabular-nums text-slate-400">
                  {tracks.length}
                </span>
              </button>

              {artistSummaries.map((artist) => {
                const isSelected = selectedArtist === artist.name;
                return (
                  <button
                    key={artist.name}
                    type="button"
                    onClick={() => {
                      onSelectArtist(artist.name);
                      setActiveTab('musicas');
                    }}
                    className={`flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-xs transition-colors ${
                      isSelected
                        ? 'border-amber-500/70 bg-amber-500/15 text-white font-semibold'
                        : 'border-slate-800 bg-[#080B10] text-slate-300 hover:border-slate-700'
                    }`}
                  >
                    <span className="truncate">{artist.name}</span>
                    <span className="ml-2 font-mono tabular-nums text-slate-400 shrink-0">
                      {artist.trackCount}
                    </span>
                  </button>
                );
              })}
            </div>
          ) : visibleTracks.length === 0 ? (
            <div className="py-10 text-center space-y-3">
              <p className="text-xs text-slate-400">
                {tracks.length === 0
                  ? 'Nenhuma música carregada ainda.'
                  : 'Nenhuma música encontrada para o filtro atual.'}
              </p>
              {tracks.length === 0 && (
                <button
                  type="button"
                  onClick={() => setActiveTab('pastas')}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3.5 py-2 text-xs font-semibold text-amber-300 hover:bg-amber-500/20"
                >
                  <Link2 className="h-3.5 w-3.5" />
                  <span>Colar Link da Pasta Coleção</span>
                </button>
              )}
            </div>
          ) : (
            <div className="space-y-1">
              {displayedTracks.map((track) => {
                const isCurrent = currentTrack?.id === track.id;
                const isFav = favoriteIds.has(track.id);
                return (
                  <div
                    key={track.id}
                    className={`flex items-center justify-between gap-3 rounded-xl border px-3.5 py-2.5 transition-colors ${
                      isCurrent
                        ? 'border-amber-500/50 bg-amber-500/10 text-white'
                        : 'border-transparent bg-[#080B10]/70 text-slate-200 hover:border-slate-800 hover:bg-slate-800/40'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => onPlayTrack(track)}
                      className="flex flex-1 items-center gap-3 min-w-0 text-left"
                    >
                      <span
                        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
                          isCurrent
                            ? 'bg-amber-500 text-slate-950'
                            : 'bg-slate-800/80 text-slate-300'
                        }`}
                      >
                        {isCurrent && isPlaying ? (
                          <Pause className="h-3.5 w-3.5 fill-current" />
                        ) : (
                          <Play className="h-3.5 w-3.5 fill-current ml-0.5" />
                        )}
                      </span>
                      <div className="min-w-0 flex-1">
                        <div
                          className={`truncate text-sm font-medium ${
                            isCurrent ? 'text-amber-300 font-semibold' : 'text-white'
                          }`}
                        >
                          {track.title}
                        </div>
                        <div className="truncate text-xs text-slate-400">
                          {track.artist}
                          {' · '}
                          {track.sourceFolder}
                          {' · '}
                          <span className="font-mono tabular-nums">
                            {formatAudioFormat(track.mimeType, track.name)}
                          </span>
                        </div>
                      </div>
                    </button>

                    <button
                      type="button"
                      onClick={() => onToggleFavorite(track.id)}
                      aria-label={
                        isFav
                          ? `Desfavoritar ${track.title}`
                          : `Favoritar ${track.title}`
                      }
                      className={`rounded-lg p-2 transition-colors shrink-0 ${
                        isFav
                          ? 'text-rose-400 hover:bg-rose-500/10'
                          : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                      }`}
                    >
                      <Heart
                        className={`h-4 w-4 ${isFav ? 'fill-rose-400' : ''}`}
                      />
                    </button>
                  </div>
                );
              })}

              {visibleTracks.length > limit && (
                <div className="pt-3 text-center">
                  <button
                    type="button"
                    onClick={() => setLimit((prev) => prev + INITIAL_DRAWER_LIMIT)}
                    className="rounded-lg border border-slate-700 bg-[#080B10] px-4 py-2 text-xs font-medium text-slate-200 hover:bg-slate-800"
                  >
                    Mostrar mais ({visibleTracks.length - limit} restantes)
                  </button>
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
