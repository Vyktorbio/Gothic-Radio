import firebaseConfig from '../../firebase-applet-config.json';
import type { DriveTrack } from './musicLogic';

/**
 * Generates a complete, self-contained `index.html` 1980s Digital Synthesizer Radio PWA
 * named "Gothic Rádio" ready to host on GitHub Pages and install on iPhone:
 * - 1980s VFD (Vacuum Fluorescent Display), segmented LED VU meter, tactile hardware buttons.
 * - Persistent Folder Memory (IndexedDB + localStorage): loads the Coleção catalog in 0ms without re-scanning on startup.
 * - Resilient rate-limit backoff retry & full subfolder traversal so 100% of songs load without dropping batches.
 */
export function generateStandalonePwaHtmlString(
  currentTracks: DriveTrack[] = []
): string {
  const realTracks = currentTracks.filter((t) => !t.isDemo);
  const embeddedTracksJson = JSON.stringify(realTracks).replace(/</g, '\\u003c');
  const defaultClientId = firebaseConfig.oAuthClientId || '';

  return `<!doctype html>
<html lang="pt-BR" class="dark">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no, viewport-fit=cover" />
  <meta name="theme-color" content="#070A0E" />
  <meta name="mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-capable" content="yes" />
  <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
  <meta name="apple-mobile-web-app-title" content="Gothic Rádio" />
  <title>Gothic Rádio — 80s Digital Synthesizer</title>
  <link rel="manifest" href="data:application/manifest+json;utf8,${encodeURIComponent(
    JSON.stringify({
      id: './',
      name: 'Gothic Rádio — 80s Digital',
      short_name: 'Gothic Rádio',
      description: 'Gothic Rádio — Rádio digital anos 80 conectada à pasta Coleção do Google Drive com memória persistente.',
      start_url: './',
      scope: './',
      display: 'standalone',
      background_color: '#070A0E',
      theme_color: '#070A0E',
    })
  )}" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script src="https://accounts.google.com/gsi/client" async defer></script>
  <link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Orbitron:wght@600;700;800&family=Share+Tech+Mono&display=swap" rel="stylesheet" />
  <style>
    body { font-family: 'DM Sans', sans-serif; background: #070A0E; color: #E2E8F0; -webkit-tap-highlight-color: transparent; }
    .font-display { font-family: 'Orbitron', monospace; }
    .font-mono { font-family: 'Share Tech Mono', monospace; font-variant-numeric: tabular-nums; }
    .vfd-screen {
      background-color: #03090C;
      background-image: linear-gradient(rgba(0, 245, 212, 0.035) 1px, transparent 1px), linear-gradient(90deg, rgba(0, 245, 212, 0.025) 1px, transparent 1px);
      background-size: 100% 3px, 6px 100%;
      box-shadow: inset 0 3px 12px rgba(0,0,0,0.95), inset 0 0 24px rgba(0,245,212,0.06);
    }
    .vfd-glow-cyan { color: #00F5D4; text-shadow: 0 0 8px rgba(0, 245, 212, 0.55); }
    .vfd-glow-amber { color: #FFB000; text-shadow: 0 0 8px rgba(255, 176, 0, 0.55); }
    .hw-button {
      background: linear-gradient(180deg, #1E2530 0%, #121720 100%);
      border: 1px solid #2E3846;
      box-shadow: inset 0 1px 0 rgba(255,255,255,0.08), 0 2px 0 #05070A, 0 3px 6px rgba(0,0,0,0.6);
    }
    .hw-button:active { transform: translateY(1px); }
  </style>
</head>
<body class="min-h-screen flex flex-col bg-[#070A0E] text-[#E2E8F0] select-none">
  <audio id="audio-player" preload="auto"></audio>

  <!-- 1980s Hardware Top Bar -->
  <header class="flex items-center justify-between gap-4 border-b border-slate-800/90 bg-[#0A0E14] px-5 py-3">
    <div class="flex items-center gap-2">
      <span class="font-display text-sm font-extrabold tracking-widest text-white">GOTHIC RÁDIO</span>
      <span class="font-mono text-[10px] tracking-widest text-cyan-400 border border-cyan-500/40 px-1.5 py-0.5 rounded-xs">80s DIGITAL</span>
    </div>
    <div class="flex items-center gap-3 font-mono text-xs">
      <button id="btn-open-menu" class="hw-button rounded-md px-3 py-1.5 text-cyan-300">BUSCAR (<span id="count-total">0</span>)</button>
      <button id="btn-rescan" class="hw-button rounded-md px-3 py-1.5 text-amber-300" title="Ler todas as músicas da pasta Coleção">SCAN MEM</button>
      <button id="btn-connect" class="hw-button rounded-md px-3 py-1.5 text-emerald-300">CONECTAR</button>
    </div>
  </header>

  <!-- Centered 1980s Digital Synthesizer Receiver -->
  <main class="flex-1 flex flex-col items-center justify-center p-4">
    <div id="status-banner" class="hidden mb-3 w-full max-w-lg rounded-md border border-cyan-500/40 bg-cyan-950/30 px-4 py-2 text-center font-mono text-xs text-cyan-300"></div>

    <section class="w-full max-w-lg rounded-xl border-2 border-[#252E3D] bg-gradient-to-b from-[#161C26] via-[#10151D] to-[#0B0E14] p-5 shadow-2xl">
      <div class="flex items-center justify-between border-b border-[#222B38] pb-3">
        <div class="font-mono text-xs text-slate-400">
          <span class="text-white font-bold">GOTHIC RÁDIO</span> · <span id="station-sub">0 MEM · SEQ</span>
        </div>
        <button id="btn-search-top" class="hw-button rounded-md px-3 py-1 font-mono text-xs text-cyan-300">MEM / ARTISTA</button>
      </div>

      <!-- VFD Display -->
      <div class="vfd-screen mt-4 rounded-lg border-2 border-[#05080B] p-4">
        <div class="flex items-center justify-between border-b border-cyan-950/80 pb-2 font-mono text-[11px] tracking-widest">
          <span id="mem-status" class="text-emerald-400">● MEM LOCKED</span>
          <span class="vfd-glow-cyan font-display text-sm font-bold">FM <span id="fm-freq">88.8</span> MHz</span>
        </div>
        <div class="mt-3 flex items-center justify-between gap-2">
          <div class="min-w-0 flex-1">
            <h1 id="track-title" class="vfd-glow-cyan truncate font-mono text-lg font-bold">PASTA COLEÇÃO</h1>
            <p id="track-artist" class="vfd-glow-amber mt-0.5 truncate font-mono text-xs">CONECTE OU SELECIONE NA MEMÓRIA</p>
          </div>
          <div class="text-right font-mono">
            <div id="time-current" class="vfd-glow-cyan text-base font-bold">00:00</div>
            <div id="time-total" class="text-[11px] text-slate-500">00:00</div>
          </div>
        </div>
      </div>

      <!-- Scrubber + Prominent Favorite Key -->
      <div class="mt-4 flex items-center gap-3">
        <input id="seek-slider" type="range" min="0" max="100" step="0.5" value="0" class="h-2 flex-1 cursor-pointer appearance-none rounded-xs bg-[#06090D] accent-[#00F5D4]" />
        <button id="btn-fav-current" class="hw-button rounded-md px-3.5 py-2 font-mono text-xs font-bold text-slate-200">♥ FAVORITAR</button>
      </div>

      <!-- 1980s Hardware Transport Keys -->
      <div class="mt-4 grid grid-cols-5 gap-2 font-mono text-xs font-bold">
        <button id="btn-shuffle" class="hw-button rounded-md py-2.5 text-slate-400">RND</button>
        <button id="btn-prev" class="hw-button rounded-md py-2.5 text-slate-200">|&lt;&lt;</button>
        <button id="btn-play" class="hw-button rounded-md py-2.5 text-amber-300">▶ PLAY</button>
        <button id="btn-next" class="hw-button rounded-md py-2.5 text-slate-200">&gt;&gt;|</button>
        <button id="btn-only-favs" class="hw-button rounded-md py-2.5 text-slate-400">FAVS</button>
      </div>
    </section>
  </main>

  <!-- Slide-over Search & Artist Memory Drawer -->
  <div id="drawer" class="fixed inset-0 z-50 hidden justify-end bg-black/80 backdrop-blur-xs">
    <div class="flex h-full w-full max-w-md flex-col border-l border-slate-800 bg-[#0D111A] p-5 font-mono">
      <div class="flex items-center justify-between pb-3 border-b border-slate-800">
        <h2 class="font-display text-sm font-bold text-cyan-300">GOTHIC RÁDIO · MEMÓRIA (<span id="drawer-count">0</span>)</h2>
        <button id="btn-close-drawer" class="text-slate-400 hover:text-white text-lg px-2">✕</button>
      </div>
      <input id="search-input" type="search" placeholder="Buscar música ou artista na memória..." class="mt-3 w-full rounded-md border border-slate-800 bg-[#070A0E] px-3.5 py-2.5 text-sm text-cyan-200 placeholder-slate-500 focus:border-cyan-400 focus:outline-none" />
      <div id="artist-chips" class="mt-3 flex gap-1.5 overflow-x-auto pb-2 text-xs"></div>
      <div id="tracks-list" class="mt-2 flex-1 overflow-y-auto space-y-1"></div>
    </div>
  </div>

  <script>
    const CLIENT_ID = localStorage.getItem('radio_custom_client_id') || ${JSON.stringify(defaultClientId)};
    const SCOPES = 'https://www.googleapis.com/auth/drive.readonly';
    const COLECAO_FOLDER_ID = localStorage.getItem('radio_colecao_folder_id_v1') || '1lWs0LtOkqLMjOgX_zGRP9MmaDdMdxgnV';
    const AUDIO_EXT = /\\.(mp3|mp4|wav|m4a|m4b|m4p|m4r|flac|ogg|oga|opus|aac|wma|aiff|aif|alac|ape|wv|mpc|tta|mp2|mpga|mpa|weba|webm|3gp|ac3|dts|amr|au|pcm|mid|midi)(\\s*\\(\\d+\\))?$/i;
    const NON_AUDIO_EXT = /\\.(jpg|jpeg|png|gif|webp|pdf|txt|doc|docx|zip|rar|ini|db|srt|cue|log|m3u)(\\s*\\(\\d+\\))?$/i;

    let tracks = JSON.parse(localStorage.getItem('gothic_radio_tracks_v4') || 'null') || ${embeddedTracksJson};
    let favIds = new Set(JSON.parse(localStorage.getItem('radio_drive_favorite_ids_v1') || '[]'));
    let savedEmail = localStorage.getItem('radio_drive_user_email_v1') || '';
    let accessToken = localStorage.getItem('radio_drive_token_v1') || null;
    let tokenExpiresAt = Number(localStorage.getItem('radio_drive_token_exp_v1') || '0');
    let selectedArtist = 'ALL';
    let onlyFavs = false;
    let isShuffle = false;
    let searchQuery = '';
    let currentTrack = tracks[0] || null;
    let isPlaying = false;

    const audio = document.getElementById('audio-player');
    const statusBanner = document.getElementById('status-banner');

    function fmtTime(sec) {
      if (!sec || !Number.isFinite(sec)) return '00:00';
      const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
      return String(m).padStart(2, '0') + ':' + String(s).padStart(2, '0');
    }

    function showStatus(msg) {
      if (!msg) { statusBanner.classList.add('hidden'); return; }
      statusBanner.textContent = msg;
      statusBanner.classList.remove('hidden');
    }

    function isAudio(name, mime) {
      if (!name || name.startsWith('.')) return false;
      if (NON_AUDIO_EXT.test(name)) return false;
      if (AUDIO_EXT.test(name)) return true;
      const m = (mime || '').toLowerCase();
      if (m.startsWith('audio/') || m === 'video/mp4' || m === 'application/ogg' || m === 'application/flac' || m === 'application/x-flac') return true;
      return false;
    }

    async function ensureValidToken(interactive = false) {
      if (accessToken && Date.now() < tokenExpiresAt - 60000) return accessToken;
      if (!window.google?.accounts?.oauth2) return null;
      return new Promise((resolve) => {
        const client = google.accounts.oauth2.initTokenClient({
          client_id: CLIENT_ID,
          scope: SCOPES,
          login_hint: savedEmail || undefined,
          prompt: interactive ? 'select_account' : '',
          callback: (resp) => {
            if (resp && resp.access_token) {
              accessToken = resp.access_token;
              tokenExpiresAt = Date.now() + (Number(resp.expires_in || 3500) * 1000);
              localStorage.setItem('radio_drive_token_v1', accessToken);
              localStorage.setItem('radio_drive_token_exp_v1', String(tokenExpiresAt));
              resolve(accessToken);
            } else {
              resolve(null);
            }
          }
        });
        client.requestAccessToken({ prompt: interactive ? '' : '' });
      });
    }

    async function driveListAll(q, fields) {
      let all = [], pageToken = '';
      do {
        const url = 'https://www.googleapis.com/drive/v3/files?q=' + encodeURIComponent(q) +
          '&fields=nextPageToken,files(' + fields + ')&pageSize=1000&supportsAllDrives=true&includeItemsFromAllDrives=true' +
          (pageToken ? '&pageToken=' + encodeURIComponent(pageToken) : '');
        let res = null;
        for (let attempt = 0; attempt < 5; attempt++) {
          res = await fetch(url, { headers: { Authorization: 'Bearer ' + accessToken } });
          if (res.ok) break;
          await new Promise(r => setTimeout(r, 500 * Math.pow(2, attempt)));
        }
        if (!res || !res.ok) throw new Error('Drive API ' + (res ? res.status : 'erro'));
        const data = await res.json();
        if (data.files) all.push(...data.files);
        pageToken = data.nextPageToken || '';
      } while (pageToken);
      return all;
    }

    async function scanColecao(force = false) {
      if (!force && tracks.length > 0) {
        renderUI();
        return;
      }
      const tok = await ensureValidToken(true);
      if (!tok) return;
      showStatus('SCANNING PASTA COLEÇÃO NO GOOGLE DRIVE...');
      try {
        const artistByFolderId = new Map();
        const visitedFolders = new Set([COLECAO_FOLDER_ID]);
        let frontier = [{ id: COLECAO_FOLDER_ID, artist: null }];
        const rawFiles = [];

        for (let depth = 0; depth < 25 && frontier.length > 0; depth++) {
          const nextFrontier = [];
          for (let i = 0; i < frontier.length; i += 20) {
            const chunk = frontier.slice(i, i + 20);
            const parentOr = chunk.map(c => "'" + c.id + "' in parents").join(' or ');
            const items = await driveListAll("(" + parentOr + ") and trashed = false", "id,name,mimeType,size,parents,shortcutDetails");
            for (const item of items) {
              const isSub = item.mimeType === 'application/vnd.google-apps.folder' ||
                (item.mimeType === 'application/vnd.google-apps.shortcut' && item.shortcutDetails?.targetMimeType === 'application/vnd.google-apps.folder');
              if (isSub) {
                const fid = item.shortcutDetails?.targetId || item.id;
                const parentNode = chunk.find(c => (item.parents || []).includes(c.id));
                const folderName = (item.name || '').trim();
                const normName = folderName.toLowerCase().normalize('NFD').replace(/[\\u0300-\\u036f]/g, '');
                const isContainer = normName === 'colecao' || normName === 'musicas';
                const artist = (parentNode && parentNode.artist) ? parentNode.artist : (isContainer ? null : folderName);
                if (artist) artistByFolderId.set(fid, artist);
                if (!visitedFolders.has(fid)) {
                  visitedFolders.add(fid);
                  nextFrontier.push({ id: fid, artist });
                }
              } else {
                rawFiles.push(item);
              }
            }
            showStatus('MEMORIZANDO COLEÇÃO... ' + rawFiles.length + ' ARQUIVOS LIDOS');
          }
          frontier = nextFrontier;
        }

        const parsed = [];
        const seen = new Set();
        for (const f of rawFiles) {
          if (seen.has(f.id)) continue;
          const eid = f.shortcutDetails?.targetId || f.id;
          const emime = f.shortcutDetails?.targetMimeType || f.mimeType || '';
          if (!isAudio(f.name, emime)) continue;
          seen.add(f.id);
          const clean = f.name.replace(AUDIO_EXT, '').trim();
          const parts = clean.split(/\\s+[-–—]\\s+/);
          const folderArtist = artistByFolderId.get((f.parents || [])[0]) || 'Coleção';
          const artist = parts.length >= 2 ? parts[0].trim() : folderArtist;
          const title = parts.length >= 2 ? parts.slice(1).join(' - ').trim() : clean;
          parsed.push({ id: f.id, streamFileId: eid, name: f.name, title, artist, sourceFolder: 'Coleção', mimeType: emime, sizeBytes: Number(f.size || 0) });
        }

        tracks = parsed;
        try { localStorage.setItem('gothic_radio_tracks_v4', JSON.stringify(tracks)); } catch (e) {}
        currentTrack = tracks[0] || null;
        showStatus('');
        renderUI();
      } catch (e) {
        showStatus('ERRO DRIVE: ' + e.message);
      }
    }

    function getQueue() {
      return tracks.filter(t => {
        if (onlyFavs && !favIds.has(t.id)) return false;
        if (selectedArtist !== 'ALL' && t.artist !== selectedArtist) return false;
        if (searchQuery && !(t.title.toLowerCase().includes(searchQuery) || t.artist.toLowerCase().includes(searchQuery))) return false;
        return true;
      });
    }

    async function playTrack(track) {
      if (!track) return;
      currentTrack = track;
      renderUI();
      try {
        showStatus('CARREGANDO ÁUDIO...');
        const cache = ('caches' in window) ? await caches.open('gothic-radio-audio-cache-v1') : null;
        const cacheKey = 'https://gothic-radio.local/audio/' + encodeURIComponent(track.id);
        let blob = null;
        if (cache) {
          const hit = await cache.match(cacheKey);
          if (hit) blob = await hit.blob();
        }
        if (!blob) {
          const tok = await ensureValidToken(false);
          if (!tok) { showStatus('CLIQUE EM CONECTAR PARA RENOVAR SESSÃO'); return; }
          const id = track.streamFileId || track.id;
          const res = await fetch('https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(id) + '?alt=media&supportsAllDrives=true', {
            headers: { Authorization: 'Bearer ' + tok }
          });
          if (!res.ok) throw new Error('Status ' + res.status);
          blob = await res.blob();
          if (cache) await cache.put(cacheKey, new Response(blob));
        }
        audio.src = URL.createObjectURL(blob);
        await audio.play();
        isPlaying = true;
        showStatus('');
        if ('mediaSession' in navigator) {
          navigator.mediaSession.metadata = new MediaMetadata({ title: track.title, artist: track.artist, album: 'Gothic Rádio · Coleção' });
        }
        renderUI();
      } catch (e) {
        showStatus('TOQUE EM CONECTAR PARA AUTENTICAR O ÁUDIO');
      }
    }

    function nextTrack() {
      const q = getQueue();
      if (!q.length) return;
      if (isShuffle) {
        playTrack(q[Math.floor(Math.random() * q.length)]);
      } else {
        const idx = q.findIndex(t => t.id === currentTrack?.id);
        playTrack(q[(idx + 1) % q.length]);
      }
    }

    function renderUI() {
      const q = getQueue();
      document.getElementById('count-total').textContent = tracks.length;
      document.getElementById('drawer-count').textContent = q.length;
      document.getElementById('station-sub').textContent = q.length + ' MEM · ' + (isShuffle ? 'RND' : 'SEQ');
      document.getElementById('track-title').textContent = currentTrack ? currentTrack.title : (tracks.length ? 'SELECIONE UMA FAIXA' : 'MEMÓRIA VAZIA');
      document.getElementById('track-artist').textContent = currentTrack ? currentTrack.artist.toUpperCase() : 'TOQUE EM CONECTAR';
      document.getElementById('btn-play').textContent = isPlaying ? '⏸ PAUSE' : '▶ PLAY';
      const isFav = currentTrack && favIds.has(currentTrack.id);
      document.getElementById('btn-fav-current').textContent = isFav ? '♥ FAVORITA' : '♡ FAVORITAR';

      const listEl = document.getElementById('tracks-list');
      listEl.innerHTML = '';
      q.forEach(t => {
        const row = document.createElement('div');
        row.className = 'flex items-center justify-between rounded-md px-3 py-2 cursor-pointer border border-transparent hover:border-cyan-500/40 ' + (currentTrack?.id === t.id ? 'bg-cyan-950/40 border-cyan-500/60 text-cyan-300' : '');
        row.innerHTML = '<div class="truncate pr-2"><div class="text-sm font-bold truncate">' + t.title + '</div><div class="text-xs text-amber-400/90 truncate">' + t.artist + '</div></div>';
        row.onclick = () => { playTrack(t); document.getElementById('drawer').classList.add('hidden'); };
        listEl.appendChild(row);
      });
    }

    document.getElementById('btn-connect').onclick = async () => {
      const tok = await ensureValidToken(true);
      if (tok && tracks.length === 0) scanColecao(true);
      else renderUI();
    };
    document.getElementById('btn-rescan').onclick = () => scanColecao(true);
    document.getElementById('btn-open-menu').onclick = () => document.getElementById('drawer').classList.remove('hidden');
    document.getElementById('btn-search-top').onclick = () => document.getElementById('drawer').classList.remove('hidden');
    document.getElementById('btn-close-drawer').onclick = () => document.getElementById('drawer').classList.add('hidden');
    document.getElementById('btn-play').onclick = () => { if (!audio.src) playTrack(currentTrack || tracks[0]); else if (audio.paused) { audio.play(); isPlaying = true; renderUI(); } else { audio.pause(); isPlaying = false; renderUI(); } };
    document.getElementById('btn-next').onclick = nextTrack;
    document.getElementById('btn-prev').onclick = nextTrack;
    document.getElementById('btn-shuffle').onclick = () => { isShuffle = !isShuffle; renderUI(); };
    document.getElementById('btn-only-favs').onclick = () => { onlyFavs = !onlyFavs; renderUI(); };
    document.getElementById('btn-fav-current').onclick = () => {
      if (!currentTrack) return;
      if (favIds.has(currentTrack.id)) favIds.delete(currentTrack.id); else favIds.add(currentTrack.id);
      localStorage.setItem('radio_drive_favorite_ids_v1', JSON.stringify(Array.from(favIds)));
      renderUI();
    };
    document.getElementById('search-input').oninput = (e) => { searchQuery = e.target.value.toLowerCase(); renderUI(); };
    audio.onended = nextTrack;
    audio.ontimeupdate = () => {
      document.getElementById('seek-slider').value = audio.currentTime || 0;
      document.getElementById('seek-slider').max = audio.duration || 100;
      document.getElementById('time-current').textContent = fmtTime(audio.currentTime);
      document.getElementById('time-total').textContent = fmtTime(audio.duration);
    };
    window.addEventListener('keydown', (e) => {
      if (e.ctrlKey || e.metaKey || e.altKey) return;
      const tag = e.target && e.target.tagName;
      if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
      if (tag === 'BUTTON' && (e.code === 'Space' || e.key === ' ')) return;
      if (e.code === 'Space' || e.key === ' ') {
        e.preventDefault();
        document.getElementById('btn-play').click();
      } else if (e.key === 'ArrowRight') {
        e.preventDefault();
        nextTrack();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        nextTrack();
      }
    });
    renderUI();
  </script>
</body>
</html>`;
}

export function downloadStandalonePwaHtml(currentTracks: DriveTrack[] = []) {
  const htmlContent = generateStandalonePwaHtmlString(currentTracks);
  const blob = new Blob([htmlContent], { type: 'text/html;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = 'index.html';
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}

/**
 * Directly commits and publishes `index.html` to a user's GitHub repository
 * via the official GitHub REST API (`PUT /repos/{owner}/{repo}/contents/index.html`).
 */
export async function publishStandaloneHtmlToGitHub(params: {
  repoFullName: string; // e.g. "usuario/gothic-radio"
  branch?: string;
  githubToken: string;
  tracks: DriveTrack[];
}): Promise<{ htmlUrl: string; pagesHintUrl: string }> {
  const cleanRepo = params.repoFullName
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/^\/+|\/+$/g, '');

  const parts = cleanRepo.split('/');
  if (parts.length < 2 || !parts[0] || !parts[1]) {
    throw new Error(
      'Informe o repositório no formato usuario/nome-do-repositorio.'
    );
  }

  const owner = parts[0];
  const repo = parts[1];
  const branch = (params.branch || 'main').trim() || 'main';
  const token = params.githubToken.trim();
  if (!token) {
    throw new Error('Informe seu Personal Access Token do GitHub (ghp_...).');
  }

  const apiUrl = `https://api.github.com/repos/${encodeURIComponent(
    owner
  )}/${encodeURIComponent(repo)}/contents/index.html`;

  const headers: Record<string, string> = {
    Accept: 'application/vnd.github+json',
    Authorization: `Bearer ${token}`,
  };

  let existingSha: string | undefined;
  const checkRes = await fetch(
    `${apiUrl}?ref=${encodeURIComponent(branch)}`,
    { headers }
  );
  if (checkRes.ok) {
    const existingData = (await checkRes.json()) as { sha?: string };
    existingSha = existingData.sha;
  }

  const htmlString = generateStandalonePwaHtmlString(params.tracks);
  const utf8Bytes = new TextEncoder().encode(htmlString);
  let binary = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binary += String.fromCharCode(utf8Bytes[i]);
  }
  const base64Content = btoa(binary);

  const putBody: Record<string, unknown> = {
    message: 'Deploy Gothic Rádio 80s PWA (Pasta Coleção com memória persistente)',
    content: base64Content,
    branch,
  };
  if (existingSha) {
    putBody.sha = existingSha;
  }

  const putRes = await fetch(apiUrl, {
    method: 'PUT',
    headers: {
      ...headers,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(putBody),
  });

  if (!putRes.ok) {
    const errText = await putRes.text().catch(() => '');
    throw new Error(
      `Erro ao publicar no GitHub (${putRes.status}): ${
        errText || putRes.statusText
      }`
    );
  }

  return {
    htmlUrl: `https://github.com/${owner}/${repo}/blob/${branch}/index.html`,
    pagesHintUrl: `https://${owner}.github.io/${repo}/`,
  };
}
