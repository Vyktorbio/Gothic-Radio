import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const sample = [{ id: 'test-1', title: 'Faixa de teste', artist: 'Artista de teste' }];
function boot({ db = new IDBFactory(), values = new Map(), full = false, navigator = {}, fetch = async () => { throw Error('Network must not be needed to open saved music'); } } = {}) {
  const events = new Map();
  const nodes = new Map();
  function element() {
    return { textContent: '', value: '', src: '', currentTime: 0, duration: 180, children: [],
      classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {},
      append(...children) { this.children.push(...children); }, appendChild(child) { this.children.push(child); },
      paused: true, playbackRate: 1, async play() { this.paused = false; this.onplay?.(); this.onplaying?.(); }, pause() { this.paused = true; this.onpause?.(); },
    };
  }
  const document = { baseURI: 'https://vyktorbio.github.io/Gothic-Radio/', body: element(), querySelector: () => null, createElement: element,
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); } };
  const popup = {};
  const localStorage = { getItem: k => values.get(k) ?? null, removeItem: k => values.delete(k),
    setItem(k, v) { if (full) throw Error('QuotaExceededError'); values.set(k, v); } };
  const window = { indexedDB: db, addEventListener: (name, fn) => events.set(name, fn), open: () => popup };
  const ctx = vm.createContext({ window, document, localStorage, indexedDB: db, navigator, MediaMetadata: class { constructor(data) { Object.assign(this, data); } }, console,
    setTimeout, clearTimeout, fetch, URL, Response, Blob, structuredClone, AbortController, TextDecoder, crypto: { randomUUID: () => 'station-' + Math.random() } });
  vm.runInContext(script, ctx);
  return { ctx, db, values, nodes, events, popup, run: code => vm.runInContext(code, ctx) };
}

test('opens a saved catalog and last selection without a token or scan', async () => {
  const values = new Map([
    ['gothic_radio_tracks_v4', JSON.stringify(sample)],
    ['gothic_radio_playback_v1', JSON.stringify({ trackId: 'test-1', time: 42, volume: .4 })],
  ]);
  const app = boot({ values });
  assert.equal(app.run('tracks.length'), 1);
  assert.equal(app.nodes.get('track-title').textContent, sample[0].title);
  assert.equal(app.nodes.get('audio-player').volume, .4);
  assert.equal(app.run('accessToken'), null);
  assert.equal(app.run('pendingAuthPromise'), null);
  await app.run('restoreMusicMemory()');
  assert.equal(app.run('currentTrack.id'), 'test-1');
});

test('large catalog survives localStorage quota failure and a fresh app load', async () => {
  const db = new IDBFactory();
  const app = boot({ db, full: true });
  await app.run('restoreMusicMemory()');
  app.ctx.catalog = Array.from({ length: 3500 }, (_, i) => ({ id: `test-${i}`, title: `Faixa ${i}`, artist: 'Teste' }));
  assert.equal(await app.run('writeMusicMemory(catalog)'), true);
  const reopened = boot({ db, full: true });
  await reopened.run('restoreMusicMemory()');
  assert.equal(reopened.run('tracks.length'), 3500);
  assert.equal(reopened.nodes.get('count-total').textContent, 3500);
});

test('an old database snapshot cannot replace a newly updated local catalog', async () => {
  const db = new IDBFactory();
  const app = boot({ db });
  app.ctx.catalog = sample;
  await app.run('writeMusicMemory(catalog)');
  const values = new Map([
    ['gothic_radio_tracks_v4', JSON.stringify([{ id: 'new', title: 'Nova', artist: 'Novo' }])],
    ['gothic_radio_meta_v4', JSON.stringify({ lastSyncedAt: '2099-01-01T00:00:00.000Z' })],
  ]);
  const reopened = boot({ db, values });
  await reopened.run('restoreMusicMemory()');
  assert.equal(reopened.run('currentTrack.id'), 'new');
});

test('a failed refresh preserves existing tracks', async () => {
  const app = boot({ values: new Map([['gothic_radio_tracks_v4', JSON.stringify(sample)]]) });
  await app.run('restoreMusicMemory()');
  app.run("accessToken = 'unit-test-token'; tokenExpiresAt = Date.now() + 3600000;");
  await app.run('scanColecao(true)');
  assert.equal(app.run('tracks.length'), 1);
  assert.equal(app.run('currentTrack.id'), sample[0].id);
});

test('login uses the direct provider and saves its result without an external bridge', async () => {
  const app = boot();
  let calls = 0;
  app.ctx.window.gothicRadioSignIn = async () => {
    calls++;
    return { accessToken: 'unit-test-token', email: 'test@example.invalid' };
  };
  const first = app.run('ensureValidToken(true)');
  const second = app.run('ensureValidToken(true)');
  assert.equal(await first, 'unit-test-token');
  assert.equal(await second, 'unit-test-token');
  assert.equal(calls, 1);
  assert.equal(app.run('pendingAuthPromise'), null);
  assert.equal(app.nodes.get('btn-connect').disabled, false);
  assert.equal(app.values.get('gothic_radio_drive_token_v1'), 'unit-test-token');
  assert.doesNotMatch(html, /ais-dev-|oauth_bridge|input-manual-token/);
});

test('unauthorized domain and cancelled logins settle and allow another attempt', async () => {
  const app = boot();
  for (const code of ['auth/unauthorized-domain', 'auth/popup-closed-by-user']) {
    app.ctx.window.gothicRadioSignIn = async () => { throw { code }; };
    assert.equal(await app.run('ensureValidToken(true)'), null);
    assert.equal(app.run('pendingAuthPromise'), null);
    assert.equal(app.nodes.get('btn-connect').disabled, false);
    assert.equal(app.run('accessToken'), null);
    if (code === 'auth/unauthorized-domain') {
      assert.match(app.nodes.get('status-banner').textContent, /vyktorbio.github.io/);
    }
  }
});

test('playback without a fresh user gesture asks for a tap instead of opening a blocked popup', async () => {
  const app = boot();
  app.ctx.navigator.userActivation = { isActive: false };
  app.ctx.window.gothicRadioSignIn = () => { throw Error('Must not open popup'); };
  assert.equal(await app.run('ensureValidToken(true)'), null);
  assert.match(app.nodes.get('status-banner').textContent, /Toque em Entrar/);
});

test('corrupt browser memory cannot prevent startup', async () => {
  const app = boot({ values: new Map([['gothic_radio_tracks_v4', '{'], ['radio_drive_favorite_ids_v1', '{']]) });
  await app.run('restoreMusicMemory()');
  assert.equal(app.run('tracks.length'), 0);
  assert.equal(app.run('favIds.size'), 0);
});

test('published source has no embedded account token or source labels', () => {
  assert.doesNotMatch(html, /ya29\.[A-Za-z0-9_-]+/);
  const ui = html.split('<script>')[0];
  assert.doesNotMatch(ui, /Google Drive|pasta|Coleção|sempre por perto/i);
  assert.match(html, /const EMBEDDED_TOKEN = ""/);
});


test('the supplied catalog loads all 140121 tracks and renders a bounded page', async () => {
  const app = boot({ full: true, fetch: async url => {
    assert.match(url, /^\.\/catalog\/[a-zA-Z0-9.-]+\.json$/);
    return new Response(readFileSync(new URL('../public/' + url.slice(2), import.meta.url)), { status: 200 });
  } });
  await app.run('musicReady');
  assert.equal(app.run('tracks.length'), 140121);
  assert.equal(app.nodes.get('count-total').textContent, 140121);
  assert.ok(app.nodes.get('tracks-list').children.length <= 102);
  const reopened = boot({ db: app.db, full: true });
  await reopened.run('musicReady');
  assert.equal(reopened.run('tracks.length'), 140121);
});

const queueTracks = [
  { id: 'a', title: 'First', artist: 'One' },
  { id: 'b', title: 'Second', artist: 'Two' },
  { id: 'c', title: 'Third', artist: 'Three' },
];
function playerFixture(navigator = {}, fetch = async () => new Response(new Blob(['test audio']))) {
  return boot({ navigator, fetch, values: new Map([
    ['gothic_radio_tracks_v4', JSON.stringify(queueTracks)],
    ['gothic_radio_drive_token_v1', 'unit-test-token'],
    ['gothic_radio_drive_token_exp_v1', String(Date.now() + 3600000)],
  ]) });
}

test('lock screen actions control playback, next, previous, metadata and seek position', async () => {
  const actions = new Map();
  let position;
  const mediaSession = { setActionHandler: (name, handler) => actions.set(name, handler), setPositionState: p => { position = p; } };
  const app = playerFixture({ mediaSession });
  await app.run('musicReady');
  await actions.get('play')();
  assert.equal(mediaSession.playbackState, 'playing');
  assert.equal(mediaSession.metadata.title, 'First');
  assert.match(mediaSession.metadata.artwork[0].src, /Gothic-Radio\/pwa-512x512.png$/);
  await actions.get('nexttrack')();
  assert.equal(app.run('currentTrack.id'), 'b');
  assert.equal(app.nodes.get('next-track-title').textContent, 'Third');
  await actions.get('previoustrack')();
  assert.equal(app.run('currentTrack.id'), 'a');
  actions.get('seekto')({ seekTime: 999 });
  assert.equal(position.position, 180);
  actions.get('pause')();
  assert.equal(mediaSession.playbackState, 'paused');
  assert.equal(actions.get('seekforward'), null);
  assert.equal(actions.get('seekbackward'), null);
});

test('shuffle preview stays stable and is the exact next track; previous follows history', async () => {
  const app = playerFixture();
  await app.run('musicReady');
  app.run('isShuffle = true; renderUI()');
  const announced = app.run('getNextTrack().id');
  assert.notEqual(announced, 'a');
  app.run('renderUI(); renderUI()');
  assert.equal(app.run('getNextTrack().id'), announced);
  await app.run('nextTrack()');
  assert.equal(app.run('currentTrack.id'), announced);
  await app.run('prevTrack()');
  assert.equal(app.run('currentTrack.id'), 'a');
});

test('up next follows filters and handles empty and single-track queues', async () => {
  const app = playerFixture();
  await app.run('musicReady');
  app.run("selectedArtist = 'Three'; renderUI()");
  assert.equal(app.run('getNextTrack().id'), 'c');
  app.run('isShuffle = true; renderUI()');
  assert.equal(app.run('getNextTrack().id'), 'c');
  app.run('onlyFavs = true; renderUI()');
  assert.equal(app.run('getNextTrack()'), null);
  assert.equal(app.nodes.get('next-track-title').textContent, 'Nenhuma faixa na fila');
});

test('one unsupported media action cannot disable the other lock screen controls', () => {
  const registered = [];
  playerFixture({ mediaSession: { setActionHandler(name) {
    if (name === 'seekto') throw Error('Unsupported');
    registered.push(name);
  } } });
  assert.ok(registered.includes('nexttrack'));
  assert.ok(registered.includes('previoustrack'));
  assert.ok(registered.includes('seekforward'));
});


test('stations persist, deduplicate membership and do not mutate active queue', async () => {
  const app = playerFixture();
  await app.run('musicReady');
  app.run("createStation('Noite'); setStationMembership(personal.stations[0].id, 'a', true); setStationMembership(personal.stations[0].id, 'a', true)");
  assert.equal(app.run('personal.stations[0].ids.length'), 1);
  app.run("selectStation('personal:' + personal.stations[0].id)");
  assert.equal(app.run('getQueue().length'), 1);
  app.run("setStationMembership(personal.stations[0].id, 'b', true)");
  assert.equal(app.run('getQueue().length'), 1);
  app.run("selectStation('personal:' + personal.stations[0].id)");
  assert.equal(app.run('getQueue().length'), 2);
  app.run("setStationMembership(personal.stations[0].id, 'a', false)");
  await app.run('personalWrites');
  const reopened = boot({ db: app.db, values: app.values });
  await reopened.run('musicReady');
  assert.equal(reopened.run('personal.stations[0].name'), 'Noite');
  assert.equal(reopened.run('personal.stations[0].ids.join()'), 'b');
});

test('history records actual playback once per request, survives reload, is capped', async () => {
  const app = playerFixture();
  await app.run('musicReady');
  await app.run('playTrack(tracks[0])');
  assert.equal(app.run('personal.history.length'), 1);
  app.run('audio.pause()');
  await app.run('resumePlayback()');
  assert.equal(app.run('personal.history.length'), 1);
  await app.run('nextTrack()');
  assert.equal(app.run('personal.history[0].id'), 'b');
  app.run('for (let i=0;i<205;i++) { playbackRequest++; audio.onplaying(); }');
  assert.equal(app.run('personal.history.length'), 200);
  await app.run('personalWrites');
  const reopened = boot({ db: app.db, values: app.values });
  await reopened.run('musicReady');
  assert.equal(reopened.run('personal.history.length'), 200);
});

test('failed audio does not enter history or open background login', async () => {
  const app = playerFixture({}, async () => { throw Error('offline'); });
  await app.run('musicReady');
  await app.run('playTrack(tracks[0])');
  assert.equal(app.run('personal.history.length'), 0);
  app.ctx.window.gothicRadioSignIn = () => { throw Error('Unexpected popup'); };
  app.run('accessToken = null; prepareNext(tracks[1])');
  assert.equal(app.run('prefetchJob'), null);
});

test('prefetch is exactly announced next and reused while pending', async () => {
  const requests = [];
  let release;
  const app = playerFixture({}, async (url, options) => {
    requests.push({ url, signal: options.signal });
    if (url.includes('/b?')) await new Promise(resolve => { release = resolve; });
    return new Response(new Blob(['audio']));
  });
  await app.run('musicReady');
  await app.run('playTrack(tracks[0])');
  assert.equal(app.run('prefetchJob.id'), 'b');
  const pending = app.run('nextTrack()');
  await new Promise(resolve => setTimeout(resolve, 0));
  assert.equal(requests.filter(r => r.url.includes('/b?')).length, 1);
  release();
  await pending;
  assert.equal(app.run('loadedTrackId'), 'b');
});

test('queue changes cancel obsolete prefetch and preserve current audio', async () => {
  const app = playerFixture();
  await app.run('musicReady');
  await app.run('playTrack(tracks[0])');
  const job = app.run('prefetchJob');
  app.run("selectedArtist = 'Three'; renderUI()");
  assert.equal(job.controller.signal.aborted, true);
  assert.equal(app.run('prefetchJob.id'), 'c');
  assert.equal(app.run('loadedTrackId'), 'a');
});

test('account switch isolates personal data and can restore old account', async () => {
  const app = playerFixture();
  await app.run('musicReady');
  app.run("createStation('Private')");
  await app.run('personalWrites');
  // Avoid published catalog fetch in this isolation unit; tested separately above.
  app.run('loadPublishedCatalog = async () => {}');
  await app.run("changePersonalAccount('other@example.invalid')");
  assert.equal(app.run('personal.stations.length'), 0);
  assert.equal(app.run('favIds.size'), 0);
  assert.equal(app.run('tracks.length'), 0);
  await app.run("changePersonalAccount('')");
  assert.equal(app.run('personal.stations[0].name'), 'Private');
});

test('genre normalization uses tags only and partial parser rejects unsupported bytes', async () => {
  const app = playerFixture();
  await app.run('musicReady');
  assert.equal(app.run("normalizeGenres(['Post Punk', 'post-punk', 'EBM']).join('|')"), 'post-punk|ebm');
  assert.equal(app.run('parsePartialGenres(new Uint8Array([1,2,3])).status'), 'unsupported');
  app.run("personal.genres.a = { values: ['ebm'], status: 'tagged' }; selectStation('genre:ebm')");
  assert.equal(app.run('getQueue().map(t => t.id).join()'), 'a');
  app.run("selectStation('all')");
  assert.equal(app.run('getQueue().length'), 3);
});

test('genre indexing refuses full responses and preserves retryability', async () => {
  const app = playerFixture({}, async () => new Response(new Blob(['not partial']), { status: 200 }));
  await app.run('musicReady');
  await app.run('indexGenres()');
  assert.equal(app.run('Object.keys(personal.genres).length'), 0);
  assert.equal(app.run('genreRunning'), false);
});

test('ID3v2.3 text genre is decoded from a bounded frame', async () => {
  const app = playerFixture();
  await app.run('musicReady');
  app.ctx.tag = new Uint8Array([73,68,51,3,0,0,0,0,0,14,84,67,79,78,0,0,0,4,0,0,3,69,66,77]);
  assert.equal(app.run("parsePartialGenres(tag).values.join()"), 'ebm');
});
