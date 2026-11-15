import React from 'react';
import {
  Play,
  Pause,
  SkipBack,
  SkipForward,
  Shuffle,
  Volume2,
  VolumeX,
  Heart,
  Search,
  Loader2,
  Disc3,
} from 'lucide-react';
import {
  formatDuration,
  formatFileSize,
  formatAudioFormat,
  type DriveTrack,
} from '../utils/musicLogic';

interface RadioDeckPlayerProps {
  currentTrack: DriveTrack | null;
  nextTrack: DriveTrack | null;
  totalQueueCount: number;
  isPlaying: boolean;
  isBuffering: boolean;
  isShuffle: boolean;
  isFavorite: boolean;
  onlyFavoritesMode: boolean;
  selectedArtist: string;
  selectedSource: string;
  currentTime: number;
  duration: number;
  volume: number;
  isMuted: boolean;
  coverImageUrl: string;
  memoryLastSyncedAt?: string | null;
  onTogglePlay: () => void;
  onPrevTrack: () => void;
  onNextTrack: () => void;
  onToggleShuffle: () => void;
  onToggleFavoriteCurrent: () => void;
  onToggleOnlyFavoritesMode: () => void;
  onOpenSearchMenu: () => void;
  onSeek: (newTime: number) => void;
  onVolumeChange: (newVol: number) => void;
  onToggleMute: () => void;
  onResetStation: () => void;
}

export const RadioDeckPlayer: React.FC<RadioDeckPlayerProps> = ({
  currentTrack,
  nextTrack,
  totalQueueCount,
  isPlaying,
  isBuffering,
  isShuffle,
  isFavorite,
  onlyFavoritesMode,
  selectedArtist,
  selectedSource,
  currentTime,
  duration,
  volume,
  isMuted,
  coverImageUrl,
  memoryLastSyncedAt,
  onTogglePlay,
  onPrevTrack,
  onNextTrack,
  onToggleShuffle,
  onToggleFavoriteCurrent,
  onToggleOnlyFavoritesMode,
  onOpenSearchMenu,
  onSeek,
  onVolumeChange,
  onToggleMute,
  onResetStation,
}) => {
  const [imgFailed, setImgFailed] = React.useState(false);

  const effectiveDuration =
    duration > 0 ? duration : currentTrack?.durationSeconds || 0;

  const stationLabel = onlyFavoritesMode
    ? 'FAV MEMORY'
    : selectedArtist !== 'ALL'
    ? selectedArtist.toUpperCase()
    : selectedSource !== 'ALL'
    ? selectedSource.toUpperCase()
    : 'COLEÇÃO';

  const hasActiveFilter =
    onlyFavoritesMode || selectedArtist !== 'ALL' || selectedSource !== 'ALL';

  // Compute a deterministic 1980s FM digital synthesizer frequency (88.1 - 107.9 MHz)
  const fmFrequency = React.useMemo(() => {
    if (!currentTrack) return '88.1';
    let hash = 0;
    for (let i = 0; i < currentTrack.id.length; i++) {
      hash = (hash * 31 + currentTrack.id.charCodeAt(i)) % 198;
    }
    const freq = 88.1 + (Math.abs(hash) % 198) * 0.1;
    return freq.toFixed(1);
  }, [currentTrack]);

  return (
    <section
      aria-label="Player principal da Rádio Digital Anos 80"
      className="relative w-full max-w-lg rounded-xl border-2 border-[#252E3D] bg-gradient-to-b from-[#161C26] via-[#10151D] to-[#0B0E14] p-5 shadow-[0_24px_60px_rgba(0,0,0,0.9),inset_0_1px_0_rgba(255,255,255,0.1)]"
    >
      {/* Top 1980s Rack Faceplate Header */}
      <div className="flex items-center justify-between gap-3 border-b border-[#222B38] pb-3.5">
        <div className="flex items-center gap-2.5 min-w-0">
          {/* Rack Screw Left */}
          <span
            aria-hidden="true"
            className="h-2.5 w-2.5 shrink-0 rounded-full border border-slate-600 bg-[#0A0D12] shadow-inner"
          />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="font-display text-xs font-extrabold tracking-widest text-slate-100">
                GOTHIC RÁDIO
              </span>
              <span className="rounded-xs border border-cyan-500/40 bg-cyan-950/50 px-1.5 py-0.5 font-mono text-[10px] tracking-wider text-cyan-300">
                QUARTZ 80s
              </span>
            </div>
            <div className="mt-0.5 font-mono text-[11px] tracking-wider text-slate-400 truncate">
              CH: {stationLabel} · {totalQueueCount} MEM
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {hasActiveFilter && (
            <button
              type="button"
              onClick={onResetStation}
              className="hw-button rounded-md px-2.5 py-1.5 font-mono text-xs font-semibold tracking-wider text-amber-300 whitespace-nowrap shrink-0"
            >
              [ ALL MEM ]
            </button>
          )}
          <button
            type="button"
            onClick={onOpenSearchMenu}
            aria-label="Abrir menu de busca e artistas"
            className="hw-button inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs font-semibold tracking-wider text-cyan-300 hover:text-cyan-200 whitespace-nowrap shrink-0"
          >
            <Search className="h-3.5 w-3.5 text-cyan-400" />
            <span>Buscar</span>
          </button>
        </div>
      </div>

      {/* Recessed 1980s Vacuum Fluorescent Display (VFD) Window */}
      <div className="vfd-screen mt-4 rounded-lg border-2 border-[#05080B] p-4 ring-1 ring-slate-700/60">
        {/* Top VFD Status Matrix */}
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-cyan-950/80 pb-2.5 font-mono text-[11px] tracking-widest">
          <div className="flex items-center gap-2.5">
            <span className="inline-flex items-center gap-1.5 text-emerald-400">
              <span
                className={`h-2 w-2 rounded-full ${
                  totalQueueCount > 0
                    ? 'bg-emerald-400 shadow-[0_0_8px_#34d399]'
                    : 'bg-slate-700'
                }`}
              />
              <span>{totalQueueCount > 0 ? 'MEM LOCKED' : 'NO MEM'}</span>
            </span>
            <span className="text-slate-600">|</span>
            <span
              className={
                isPlaying ? 'vfd-glow-amber font-semibold' : 'text-slate-600'
              }
            >
              STEREO
            </span>
            <span className="text-slate-600">|</span>
            <span
              className={
                isShuffle ? 'vfd-glow-amber font-semibold' : 'text-cyan-400/80'
              }
            >
              {isShuffle ? 'RND' : 'SEQ'}
            </span>
          </div>

          <div className="flex items-center gap-1.5">
            <span className="text-[10px] text-cyan-500/80">FM</span>
            <span className="vfd-glow-cyan font-display text-sm font-bold tracking-wider">
              {fmFrequency}
            </span>
            <span className="text-[10px] text-cyan-500/80">MHz</span>
          </div>
        </div>

        {/* Center VFD Readout + Mini Studio Monitor */}
        <div className="mt-3.5 flex items-center gap-3.5">
          {/* Compact 80s Monitor Window */}
          <div className="relative h-16 w-16 shrink-0 overflow-hidden rounded-md border border-cyan-500/30 bg-[#050A0E]">
            {!imgFailed ? (
              <img
                src={coverImageUrl}
                alt={
                  currentTrack
                    ? `${currentTrack.title} - ${currentTrack.artist}`
                    : 'Rádio Drive'
                }
                referrerPolicy="no-referrer"
                onError={() => setImgFailed(true)}
                className="h-full w-full object-cover opacity-85 contrast-125"
              />
            ) : (
              <div className="flex h-full w-full items-center justify-center">
                <Disc3 className="h-7 w-7 text-cyan-400/70" />
              </div>
            )}
            <div className="pointer-events-none absolute inset-0 bg-gradient-to-t from-black/70 via-transparent to-cyan-500/10" />
          </div>

          {/* Digital Phosphor Track & Artist Display */}
          <div className="min-w-0 flex-1">
            <div className="flex items-center justify-between gap-2 font-mono text-[11px] text-cyan-400/75">
              <span className="truncate">
                {currentTrack
                  ? `${formatAudioFormat(
                      currentTrack.mimeType,
                      currentTrack.name
                    )} · ${formatFileSize(currentTrack.sizeBytes)}`
                  : memoryLastSyncedAt
                  ? 'MEMÓRIA PRONTA'
                  : 'AGUARDANDO SINCRONIZAÇÃO'}
              </span>
              <span className="vfd-glow-cyan shrink-0 font-mono text-sm font-bold tabular-nums">
                {formatDuration(currentTime)}
              </span>
            </div>

            <h1
              className="vfd-glow-cyan mt-1 truncate font-mono text-lg font-bold tracking-wide"
              title={currentTrack?.title || 'Pasta Coleção'}
            >
              {currentTrack ? currentTrack.title : 'PASTA COLEÇÃO'}
            </h1>

            <p className="vfd-glow-amber mt-0.5 truncate font-mono text-xs tracking-wider">
              {currentTrack
                ? currentTrack.artist.toUpperCase()
                : 'CONECTE SEU GOOGLE DRIVE'}
            </p>
          </div>
        </div>

        {/* 1980s Segmented Peak-Level LED VU Meter (16 Bars) */}
        <div className="mt-4 border-t border-cyan-950/80 pt-3">
          <div className="mb-1.5 flex items-center justify-between font-mono text-[10px] tracking-widest text-slate-400">
            <span>PEAK LEVEL METER (dB)</span>
            <span className="font-mono tabular-nums text-cyan-400/80">
              -20 · -10 · -3 · 0 · +3 · +6
            </span>
          </div>
          <div
            className="grid grid-cols-16 gap-1 h-4 items-end rounded-xs bg-[#020507] p-1 border border-slate-800/80"
            aria-hidden="true"
            data-testid="audio-visualizer"
          >
            {Array.from({ length: 16 }).map((_, idx) => {
              const wave = isPlaying
                ? Math.abs(
                    Math.sin(currentTime * 7.5 + idx * 0.55) * 0.65 +
                      Math.cos(currentTime * 4.2 - idx * 0.3) * 0.35
                  )
                : 0.12;
              const isLit = isPlaying
                ? idx / 16 <= Math.max(0.18, wave)
                : idx < 2;

              const barColor =
                idx >= 13
                  ? isLit
                    ? 'bg-[#FF2A6D] shadow-[0_0_6px_#FF2A6D]'
                    : 'bg-rose-950/30'
                  : idx >= 10
                  ? isLit
                    ? 'bg-[#FFB000] shadow-[0_0_6px_#FFB000]'
                    : 'bg-amber-950/30'
                  : isLit
                  ? 'bg-[#00F5D4] shadow-[0_0_6px_#00F5D4]'
                  : 'bg-cyan-950/30';

              return (
                <span
                  key={idx}
                  className={`h-full w-full rounded-[1px] transition-colors duration-75 ${barColor}`}
                />
              );
            })}
          </div>
        </div>
      </div>

      {/* Prominent Hardware Favorite Button + Digital Scrubber Row */}
      <div className="mt-4 flex items-center justify-between gap-3">
        <div className="flex-1">
          <label htmlFor="radio-seek-slider" className="sr-only">
            Posição da música
          </label>
          <input
            id="radio-seek-slider"
            type="range"
            min={0}
            max={effectiveDuration > 0 ? effectiveDuration : 100}
            step={0.5}
            value={
              effectiveDuration > 0
                ? Math.min(currentTime, effectiveDuration)
                : 0
            }
            onChange={(e) => onSeek(parseFloat(e.target.value))}
            disabled={!currentTrack}
            aria-label="Avançar ou retroceder na música"
            className="h-2 w-full cursor-pointer appearance-none rounded-xs border border-slate-800 bg-[#06090D] accent-[#00F5D4] disabled:cursor-not-allowed"
          />
          <div className="mt-1 flex items-center justify-between font-mono text-[11px] text-slate-400 tabular-nums">
            <span>ELAPSED {formatDuration(currentTime)}</span>
            <span>TOTAL {formatDuration(effectiveDuration)}</span>
          </div>
        </div>

        {/* Tactile 80s Hardware Favorite Button with Red LED Indicator */}
        <button
          type="button"
          onClick={onToggleFavoriteCurrent}
          disabled={!currentTrack}
          aria-pressed={isFavorite}
          aria-label={
            isFavorite ? 'Remover dos favoritos' : 'Favoritar música'
          }
          title={isFavorite ? 'Remover dos favoritos' : 'Favoritar música'}
          className={`hw-button inline-flex items-center gap-2 rounded-md px-3.5 py-2.5 font-mono text-xs font-bold tracking-wider whitespace-nowrap shrink-0 ${
            isFavorite
              ? 'border-rose-500/80 text-rose-300'
              : 'text-slate-300 hover:text-white'
          } disabled:opacity-40`}
        >
          <span
            className={`h-2 w-2 rounded-full ${
              isFavorite
                ? 'bg-[#FF2A6D] shadow-[0_0_8px_#FF2A6D]'
                : 'bg-slate-700'
            }`}
          />
          <Heart
            className={`h-3.5 w-3.5 ${
              isFavorite ? 'fill-rose-400 text-rose-400' : ''
            }`}
          />
          <span>{isFavorite ? 'FAVORITA' : 'Favoritar'}</span>
        </button>
      </div>

      {/* 1980s Hardware Push-Button Transport Bank */}
      <div className="mt-4 grid grid-cols-5 gap-2">
        <button
          type="button"
          onClick={onToggleShuffle}
          aria-pressed={isShuffle}
          aria-label="Modo Aleatório"
          className={`hw-button flex flex-col items-center justify-center gap-1 rounded-md py-2.5 font-mono text-[11px] font-bold tracking-wider ${
            isShuffle ? 'border-amber-500/80 text-amber-300' : 'text-slate-400'
          }`}
        >
          <span
            className={`h-1.5 w-3 rounded-xs ${
              isShuffle
                ? 'bg-[#FFB000] shadow-[0_0_6px_#FFB000]'
                : 'bg-slate-700'
            }`}
          />
          <div className="inline-flex items-center gap-1">
            <Shuffle className="h-3.5 w-3.5" />
            <span>Aleatório</span>
          </div>
        </button>

        <button
          type="button"
          onClick={onPrevTrack}
          disabled={!currentTrack}
          aria-label="Música anterior"
          className="hw-button flex flex-col items-center justify-center gap-1 rounded-md py-2.5 font-mono text-[11px] font-bold tracking-wider text-slate-200 disabled:opacity-40"
        >
          <span className="h-1.5 w-3 rounded-xs bg-slate-700" />
          <div className="inline-flex items-center gap-1">
            <SkipBack className="h-4 w-4" />
            <span>PREV</span>
          </div>
        </button>

        <button
          type="button"
          onClick={onTogglePlay}
          disabled={!currentTrack}
          aria-label={isPlaying ? 'Pausar rádio' : 'Tocar rádio'}
          className={`hw-button flex flex-col items-center justify-center gap-1 rounded-md py-2.5 font-mono text-xs font-extrabold tracking-widest ${
            isPlaying
              ? 'border-cyan-400/80 text-cyan-300'
              : 'border-amber-500/70 text-amber-300'
          } disabled:opacity-40`}
        >
          <span
            className={`h-1.5 w-5 rounded-xs ${
              isPlaying
                ? 'bg-[#00F5D4] shadow-[0_0_8px_#00F5D4]'
                : 'bg-[#FFB000] shadow-[0_0_6px_#FFB000]'
            }`}
          />
          <div className="inline-flex items-center gap-1">
            {isBuffering ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : isPlaying ? (
              <Pause className="h-4 w-4 fill-current" />
            ) : (
              <Play className="h-4 w-4 fill-current" />
            )}
            <span>{isPlaying ? 'PAUSE' : 'PLAY'}</span>
          </div>
        </button>

        <button
          type="button"
          onClick={onNextTrack}
          disabled={!currentTrack}
          aria-label="Próxima música"
          className="hw-button flex flex-col items-center justify-center gap-1 rounded-md py-2.5 font-mono text-[11px] font-bold tracking-wider text-slate-200 disabled:opacity-40"
        >
          <span className="h-1.5 w-3 rounded-xs bg-slate-700" />
          <div className="inline-flex items-center gap-1">
            <SkipForward className="h-4 w-4" />
            <span>NEXT</span>
          </div>
        </button>

        <button
          type="button"
          onClick={onToggleOnlyFavoritesMode}
          aria-pressed={onlyFavoritesMode}
          aria-label="Ouvir apenas favoritas"
          className={`hw-button flex flex-col items-center justify-center gap-1 rounded-md py-2.5 font-mono text-[11px] font-bold tracking-wider ${
            onlyFavoritesMode
              ? 'border-rose-500/80 text-rose-300'
              : 'text-slate-400'
          }`}
        >
          <span
            className={`h-1.5 w-3 rounded-xs ${
              onlyFavoritesMode
                ? 'bg-[#FF2A6D] shadow-[0_0_6px_#FF2A6D]'
                : 'bg-slate-700'
            }`}
          />
          <div className="inline-flex items-center gap-1">
            <Heart
              className={`h-3.5 w-3.5 ${
                onlyFavoritesMode ? 'fill-rose-400 text-rose-400' : ''
              }`}
            />
            <span>Só Favs</span>
          </div>
        </button>
      </div>

      {/* Bottom Attenuator / Volume + Next Up Readout */}
      <div className="mt-4 space-y-2.5 border-t border-[#222B38] pt-3.5">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onToggleMute}
            aria-label={isMuted ? 'Ativar som' : 'Silenciar som'}
            className="font-mono text-xs text-slate-400 transition-colors hover:text-cyan-300"
          >
            {isMuted || volume === 0 ? (
              <VolumeX className="h-4 w-4 text-rose-400" />
            ) : (
              <Volume2 className="h-4 w-4 text-cyan-400" />
            )}
          </button>
          <span className="font-mono text-[10px] tracking-widest text-slate-400">
            ATT/VOL
          </span>
          <label htmlFor="radio-volume-slider" className="sr-only">
            Volume da rádio
          </label>
          <input
            id="radio-volume-slider"
            type="range"
            min={0}
            max={1}
            step={0.02}
            value={isMuted ? 0 : volume}
            onChange={(e) => onVolumeChange(parseFloat(e.target.value))}
            aria-label="Volume da rádio"
            className="h-1.5 flex-1 cursor-pointer appearance-none rounded-xs bg-[#06090D] accent-[#00F5D4]"
          />
          <span className="w-10 text-right font-mono text-xs text-cyan-300 tabular-nums">
            {Math.round((isMuted ? 0 : volume) * 100)}%
          </span>
        </div>

        {nextTrack && (
          <div className="flex items-center justify-between font-mono text-xs text-slate-400">
            <span className="shrink-0 text-[10px] tracking-widest text-slate-500">
              NEXT MEM:
            </span>
            <button
              type="button"
              onClick={onNextTrack}
              className="ml-2 truncate text-slate-300 transition-colors hover:text-cyan-300"
            >
              {nextTrack.artist} — {nextTrack.title}
            </button>
          </div>
        )}
      </div>
    </section>
  );
};
