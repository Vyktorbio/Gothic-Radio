import test from 'node:test';
import assert from 'node:assert/strict';
import {
  parseTrackFilename,
  isAudioFile,
  buildFolderHierarchy,
  groupTracksByArtist,
  filterTracks,
  buildPlaybackQueue,
  getNextTrack,
  getPreviousTrack,
  formatDuration,
  formatFileSize,
  extractDriveFolderId,
  type DriveTrack,
} from './musicLogic';

test('parseTrackFilename extracts artist and title from "Artist - Title.mp3"', () => {
  const parsed = parseTrackFilename('Jorge Ben Jor - Chove Chuva.mp3', 'Músicas', 'Músicas');
  assert.equal(parsed.artist, 'Jorge Ben Jor');
  assert.equal(parsed.title, 'Chove Chuva');
  assert.equal(parsed.albumOrFolder, 'Músicas');
});

test('parseTrackFilename extracts leading track number and artist from "03 - Djavan - Oceano.flac"', () => {
  const parsed = parseTrackFilename('03 - Djavan - Oceano.flac', 'Músicas', 'Músicas');
  assert.equal(parsed.trackNumber, 3);
  assert.equal(parsed.artist, 'Djavan');
  assert.equal(parsed.title, 'Oceano');
});

test('buildFolderHierarchy recognizes "Coleção " and "Organizar " inside "Músicas" as source folders and resolves artists inside them', () => {
  const roots = [{ id: 'root-musicas', name: 'Músicas' }];
  const allFolders = [
    { id: 'f-colecao', name: 'Coleção ', parents: ['root-musicas'] },
    { id: 'f-organizar', name: 'Organizar ', parents: ['root-musicas'] },
    { id: 'f-artist-1', name: 'Caetano Veloso', parents: ['f-colecao'] },
    { id: 'f-album-1', name: 'Transa (1972)', parents: ['f-artist-1'] },
    { id: 'f-artist-2', name: 'Tim Maia', parents: ['f-organizar'] },
  ];

  const hierarchy = buildFolderHierarchy(roots, allFolders);

  const colecaoInfo = hierarchy.get('f-colecao');
  assert.ok(colecaoInfo);
  assert.equal(colecaoInfo.sourceFolder, 'Coleção');
  assert.equal(colecaoInfo.artistFolder, null);

  const organizarInfo = hierarchy.get('f-organizar');
  assert.ok(organizarInfo);
  assert.equal(organizarInfo.sourceFolder, 'Organizar');
  assert.equal(organizarInfo.artistFolder, null);

  const album1Info = hierarchy.get('f-album-1');
  assert.ok(album1Info);
  assert.equal(album1Info.sourceFolder, 'Coleção');
  assert.equal(album1Info.artistFolder, 'Caetano Veloso');

  const parsedFromColecao = parseTrackFilename(
    '01 - You Dont Know Me.mp3',
    album1Info.name,
    'Músicas',
    album1Info.artistFolder,
    album1Info.fullPath
  );
  assert.equal(parsedFromColecao.artist, 'Caetano Veloso');
  assert.equal(parsedFromColecao.title, 'You Dont Know Me');

  // Direct file inside "Organizar " without artist subfolder should not use "Organizar" as artist
  const parsedDirectInOrganizar = parseTrackFilename(
    'Djavan - Samurai.mp4',
    organizarInfo.name,
    'Músicas',
    organizarInfo.artistFolder,
    organizarInfo.fullPath
  );
  assert.equal(parsedDirectInOrganizar.artist, 'Djavan');
  assert.equal(parsedDirectInOrganizar.title, 'Samurai');
});

test('isAudioFile accepts MP3, MP4, WAV, M4A, FLAC and strictly rejects images, docs, and archives', () => {
  assert.equal(isAudioFile('Faixa 01.MP3', 'application/octet-stream'), true);
  assert.equal(isAudioFile('Clipe Musical.mp4', 'video/mp4'), true);
  assert.equal(isAudioFile('Estudio Master.WAV', 'audio/wav'), true);
  assert.equal(isAudioFile('Acustico.m4a', 'video/mp4'), true);
  assert.equal(isAudioFile('Samba.flac', 'audio/flac'), true);
  assert.equal(isAudioFile('capa.jpg', 'image/jpeg'), false);
  assert.equal(isAudioFile('encarte.pdf', 'application/pdf'), false);
  assert.equal(isAudioFile('letras.txt', 'text/plain'), false);
  assert.equal(isAudioFile('legenda.srt', 'text/plain'), false);
  assert.equal(isAudioFile('album.zip', 'application/zip'), false);
  assert.equal(isAudioFile('Planilha', 'application/vnd.google-apps.spreadsheet'), false);
  assert.equal(isAudioFile('desktop.ini', 'application/octet-stream'), false);
});

const SAMPLE_TRACKS: DriveTrack[] = [
  {
    id: 't1',
    name: 'Jorge Ben Jor - Mas Que Nada.mp3',
    title: 'Mas Que Nada',
    artist: 'Jorge Ben Jor',
    albumOrFolder: 'Músicas / Coleção / Jorge Ben Jor',
    sourceFolder: 'Coleção',
    mimeType: 'audio/mpeg',
    sizeBytes: 4200000,
    durationSeconds: 185,
  },
  {
    id: 't2',
    name: 'Jorge Ben Jor - País Tropical.mp3',
    title: 'País Tropical',
    artist: 'Jorge Ben Jor',
    albumOrFolder: 'Músicas / Coleção / Jorge Ben Jor',
    sourceFolder: 'Coleção',
    mimeType: 'audio/mpeg',
    sizeBytes: 5100000,
    durationSeconds: 210,
  },
  {
    id: 't3',
    name: 'Tim Maia - Azul da Cor do Mar.mp3',
    title: 'Azul da Cor do Mar',
    artist: 'Tim Maia',
    albumOrFolder: 'Músicas / Organizar / Tim Maia',
    sourceFolder: 'Organizar',
    mimeType: 'audio/mpeg',
    sizeBytes: 3800000,
    durationSeconds: 198,
  },
  {
    id: 't4',
    name: 'Djavan - Flor de Lis.wav',
    title: 'Flor de Lis',
    artist: 'Djavan',
    albumOrFolder: 'Músicas / Organizar / Djavan',
    sourceFolder: 'Organizar',
    mimeType: 'audio/wav',
    sizeBytes: 18500000,
    durationSeconds: 232,
  },
];

test('groupTracksByArtist aggregates counts and sorts alphabetically', () => {
  const groups = groupTracksByArtist(SAMPLE_TRACKS);
  assert.equal(groups.length, 3);
  assert.equal(groups[0].name, 'Djavan');
  assert.equal(groups[0].trackCount, 1);
  assert.equal(groups[1].name, 'Jorge Ben Jor');
  assert.equal(groups[1].trackCount, 2);
  assert.equal(groups[2].name, 'Tim Maia');
  assert.equal(groups[2].trackCount, 1);
});

test('filterTracks filters by selected artist, source folder (Coleção / Organizar), and search query', () => {
  const byArtist = filterTracks(SAMPLE_TRACKS, 'Jorge Ben Jor', '');
  assert.equal(byArtist.length, 2);

  const bySourceColecao = filterTracks(SAMPLE_TRACKS, 'ALL', '', 'Coleção');
  assert.equal(bySourceColecao.length, 2);

  const bySourceOrganizar = filterTracks(SAMPLE_TRACKS, 'ALL', '', 'Organizar');
  assert.equal(bySourceOrganizar.length, 2);

  const byArtistAndQuery = filterTracks(SAMPLE_TRACKS, 'Jorge Ben Jor', 'tropical');
  assert.equal(byArtistAndQuery.length, 1);
  assert.equal(byArtistAndQuery[0].id, 't2');
});

test('buildPlaybackQueue keeps current track first when shuffling and permutes rest', () => {
  let seed = 0.42;
  const deterministicRng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };

  const shuffled = buildPlaybackQueue(SAMPLE_TRACKS, true, 't3', deterministicRng);
  assert.equal(shuffled.length, 4);
  assert.equal(shuffled[0].id, 't3');
  const ids = new Set(shuffled.map((t) => t.id));
  assert.equal(ids.size, 4);
});

test('getNextTrack and getPreviousTrack wrap around continuously for radio playback', () => {
  const nextAfterLast = getNextTrack(SAMPLE_TRACKS, 't4');
  assert.equal(nextAfterLast?.id, 't1');

  const prevBeforeFirst = getPreviousTrack(SAMPLE_TRACKS, 't1');
  assert.equal(prevBeforeFirst?.id, 't4');
});

test('formatDuration and formatFileSize format tabular metrics accurately', () => {
  assert.equal(formatDuration(185), '03:05');
  assert.equal(formatDuration(0), '00:00');
  assert.equal(formatDuration(undefined), '--:--');
  assert.equal(formatFileSize(4194304), '4.0 MB');
});

test('extractDriveFolderId extracts exact folder ID from Google Drive folder link', () => {
  assert.equal(
    extractDriveFolderId('https://drive.google.com/drive/folders/1lWs0LtOkqLMjOgX_zGRP9MmaDdMdxgnV?usp=drive_link'),
    '1lWs0LtOkqLMjOgX_zGRP9MmaDdMdxgnV'
  );
  assert.equal(
    extractDriveFolderId('1lWs0LtOkqLMjOgX_zGRP9MmaDdMdxgnV'),
    '1lWs0LtOkqLMjOgX_zGRP9MmaDdMdxgnV'
  );
});

