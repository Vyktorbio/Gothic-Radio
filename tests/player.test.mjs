import test from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import { readFileSync } from 'node:fs';
import { IDBFactory } from 'fake-indexeddb';

const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
const sample = [{ id: 'test-1', title: 'Faixa de teste', artist: 'Artista de teste' }];
function boot({ db = new IDBFactory(), values = new Map(), full = false, fetch = async () => { throw Error('Network must not be needed to open saved music'); } } = {}) {
  const events = new Map();
  const nodes = new Map();
  function element() {
    return { textContent: '', value: '', src: '', currentTime: 0, duration: 180, children: [],
      classList: { add() {}, remove() {}, toggle() {} }, setAttribute() {},
      append(...children) { this.children.push(...children); }, appendChild(child) { this.children.push(child); },
      play: async () => {}, pause() {},
    };
  }
  const document = { body: element(), querySelector: () => null, createElement: element,
    getElementById(id) { if (!nodes.has(id)) nodes.set(id, element()); return nodes.get(id); } };
  const popup = {};
  const localStorage = { getItem: k => values.get(k) ?? null, removeItem: k => values.delete(k),
    setItem(k, v) { if (full) throw Error('QuotaExceededError'); values.set(k, v); } };
  const window = { indexedDB: db, addEventListener: (name, fn) => events.set(name, fn), open: () => popup };
  const ctx = vm.createContext({ window, document, localStorage, indexedDB: db, navigator: {}, console,
    setTimeout, clearTimeout, fetch, URL, Response, Blob, structuredClone });
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
  assert.equal(app.run('authPopup'), null);
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

test('OAuth bridge accepts only the opened window and its authorized origin', async () => {
  const app = boot();
  app.run('void ensureValidToken(true)');
  const origin = app.run('BRIDGE_ORIGIN');
  const message = { type: 'GOTHIC_RADIO_OAUTH_TOKEN', accessToken: 'unit-test-token' };
  app.events.get('message')({ origin: 'https://example.invalid', source: app.popup, data: message });
  assert.equal(app.run('accessToken'), null);
  app.events.get('message')({ origin, source: {}, data: message });
  assert.equal(app.run('accessToken'), null);
  app.events.get('message')({ origin, source: app.popup, data: message });
  assert.equal(app.run('accessToken'), 'unit-test-token');
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
