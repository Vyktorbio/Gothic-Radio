import React, { useState } from 'react';
import { Download, Smartphone, X, Check, Github, Loader2 } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';
import type { DriveTrack } from '../utils/musicLogic';
import {
  downloadStandalonePwaHtml,
  publishStandaloneHtmlToGitHub,
} from '../utils/exportStandaloneHtml';

interface PWAInstallModalProps {
  isOpen: boolean;
  onClose: () => void;
  tracks: DriveTrack[];
}

export const PWAInstallButton: React.FC<{
  onOpenModal: () => void;
}> = ({ onOpenModal }) => {
  return (
    <button
      type="button"
      onClick={onOpenModal}
      className="hw-button inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono text-xs font-semibold tracking-wider text-cyan-300 hover:text-white whitespace-nowrap shrink-0"
    >
      <Github className="h-3.5 w-3.5 text-cyan-400" />
      <span>GitHub / PWA</span>
    </button>
  );
};

export const PWAExportModal: React.FC<PWAInstallModalProps> = ({
  isOpen,
  onClose,
  tracks,
}) => {
  const { isInstallable, isInstalled, install } = usePWAInstall();
  const [downloaded, setDownloaded] = useState(false);

  // Direct GitHub publishing state
  const [repoName, setRepoName] = useState<string>(() => {
    try {
      return localStorage.getItem('radio_github_repo_v1') || '';
    } catch {
      return '';
    }
  });
  const [branch, setBranch] = useState<string>('main');
  const [githubToken, setGithubToken] = useState<string>('');
  const [isPublishing, setIsPublishing] = useState<boolean>(false);
  const [publishResult, setPublishResult] = useState<{
    htmlUrl: string;
    pagesHintUrl: string;
  } | null>(null);
  const [publishError, setPublishError] = useState<string | null>(null);

  if (!isOpen) return null;

  const handleDownloadHtml = () => {
    downloadStandalonePwaHtml(tracks);
    setDownloaded(true);
    setTimeout(() => setDownloaded(false), 4000);
  };

  const handlePublishToGitHub = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsPublishing(true);
    setPublishError(null);
    setPublishResult(null);

    try {
      try {
        localStorage.setItem('radio_github_repo_v1', repoName.trim());
      } catch {
        // Ignore storage errors
      }
      const res = await publishStandaloneHtmlToGitHub({
        repoFullName: repoName,
        branch,
        githubToken,
        tracks,
      });
      setPublishResult(res);
    } catch (err: unknown) {
      setPublishError(
        err instanceof Error
          ? err.message
          : 'Não foi possível enviar para o GitHub.'
      );
    } finally {
      setIsPublishing(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="pwa-modal-title"
    >
      <div className="max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-xl border-2 border-[#252E3D] bg-[#10151D] p-6 text-slate-100 shadow-2xl space-y-5">
        <div className="flex items-center justify-between border-b border-slate-800 pb-4">
          <div className="flex items-center gap-2.5">
            <Github className="h-5 w-5 text-cyan-400 shrink-0" />
            <h2
              id="pwa-modal-title"
              className="font-display text-sm font-bold tracking-wider text-white"
            >
              CONECTAR GITHUB & INSTALAR PWA NO IPHONE
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar modal GitHub e PWA"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-800 hover:text-white"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Option 1: Direct GitHub API Push */}
        <form
          onSubmit={handlePublishToGitHub}
          className="rounded-lg border border-cyan-500/30 bg-[#070A0E] p-4 space-y-3"
        >
          <div className="flex items-center justify-between">
            <span className="font-mono text-xs font-bold tracking-wider text-cyan-300">
              1. PUBLICAR DIRETO NO SEU REPOSITÓRIO GITHUB
            </span>
            <span className="font-mono text-[11px] text-emerald-400">
              {tracks.length} músicas na memória
            </span>
          </div>
          <p className="text-xs leading-relaxed text-slate-300">
            Envie o arquivo <code className="font-mono text-white">index.html</code>{' '}
            (já com a memória das suas músicas da pasta{' '}
            <strong className="text-white">Coleção</strong> embutida) direto para o seu repositório do GitHub:
          </p>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
            <input
              type="text"
              value={repoName}
              onChange={(e) => setRepoName(e.target.value)}
              placeholder="usuario/meu-radio"
              aria-label="Repositório do GitHub (usuario/repositorio)"
              className="sm:col-span-2 rounded-md border border-slate-800 bg-[#10151D] px-3 py-2 font-mono text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />
            <input
              type="text"
              value={branch}
              onChange={(e) => setBranch(e.target.value)}
              placeholder="main"
              aria-label="Branch do GitHub"
              className="rounded-md border border-slate-800 bg-[#10151D] px-3 py-2 font-mono text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <input
            type="password"
            value={githubToken}
            onChange={(e) => setGithubToken(e.target.value)}
            placeholder="GitHub Personal Access Token (ghp_...)"
            aria-label="GitHub Personal Access Token"
            className="w-full rounded-md border border-slate-800 bg-[#10151D] px-3 py-2 font-mono text-xs text-white placeholder-slate-500 focus:border-cyan-400 focus:outline-none"
          />

          <button
            type="submit"
            disabled={isPublishing}
            className="hw-button flex w-full items-center justify-center gap-2 rounded-md border-cyan-500/60 py-2.5 font-mono text-xs font-bold tracking-wider text-cyan-300 hover:text-white disabled:opacity-50"
          >
            {isPublishing ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                <span>ENVIANDO PARA O GITHUB...</span>
              </>
            ) : (
              <>
                <Github className="h-4 w-4" />
                <span>PUBLICAR INDEX.HTML NO GITHUB AGORA</span>
              </>
            )}
          </button>

          {publishError && (
            <div className="rounded-md border border-rose-500/40 bg-rose-950/30 p-2.5 font-mono text-xs text-rose-300">
              {publishError}
            </div>
          )}

          {publishResult && (
            <div className="rounded-md border border-emerald-500/40 bg-emerald-950/30 p-3 font-mono text-xs text-emerald-300 space-y-1">
              <div className="font-bold">✓ Publicado com sucesso no GitHub!</div>
              <div className="truncate">
                Repositório:{' '}
                <a
                  href={publishResult.htmlUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="underline text-cyan-300"
                >
                  {publishResult.htmlUrl}
                </a>
              </div>
              <div className="truncate">
                GitHub Pages URL:{' '}
                <span className="text-white">{publishResult.pagesHintUrl}</span>
              </div>
            </div>
          )}
        </form>

        {/* Option 2: Download Single index.html */}
        <div className="rounded-lg border border-slate-800 bg-[#070A0E] p-4 space-y-3">
          <div className="font-mono text-xs font-bold tracking-wider text-amber-400">
            2. OU BAIXAR O ARQUIVO ÚNICO INDEX.HTML
          </div>
          <p className="text-xs leading-relaxed text-slate-300">
            Baixe o aplicativo 80s Digital Radio em um único arquivo{' '}
            <code className="text-white font-mono">index.html</code> (já com a memória das suas músicas embutida) para subir manualmente no GitHub:
          </p>
          <button
            type="button"
            onClick={handleDownloadHtml}
            className="hw-button flex w-full items-center justify-center gap-2 rounded-md border-amber-500/60 py-2.5 font-mono text-xs font-bold tracking-wider text-amber-300 hover:text-white"
          >
            {downloaded ? (
              <>
                <Check className="h-4 w-4 text-emerald-400" />
                <span>ARQUIVO INDEX.HTML BAIXADO!</span>
              </>
            ) : (
              <>
                <Download className="h-4 w-4" />
                <span>BAIXAR INDEX.HTML COMPLETO</span>
              </>
            )}
          </button>
        </div>

        {/* Option 3: iPhone PWA Install */}
        <div className="rounded-lg border border-slate-800 bg-[#070A0E] p-4 space-y-2">
          <div className="flex items-center gap-2 font-mono text-xs font-bold tracking-wider text-white">
            <Smartphone className="h-4 w-4 text-cyan-400" />
            <span>3. INSTALAR PWA NO IPHONE (SAFARI)</span>
          </div>
          <p className="text-xs text-slate-300 leading-relaxed">
            No Safari do iPhone, abra a URL do seu GitHub Pages (ou este app), toque em{' '}
            <strong>Compartilhar</strong> e selecione{' '}
            <strong>Adicionar à Tela de Início</strong>.
          </p>
          {isInstallable && !isInstalled && (
            <button
              type="button"
              onClick={install}
              className="hw-button mt-2 flex w-full items-center justify-center gap-2 rounded-md py-2 font-mono text-xs font-bold text-cyan-300"
            >
              INSTALAR PWA NESTE DISPOSITIVO
            </button>
          )}
        </div>
      </div>
    </div>
  );
};
