# Personal radio

The active player remains index.html, styled by src/player-mobile.css. Legacy React player components are unchanged.

## Behavior and storage
- The station selector distinguishes all music, favorites, personal selections and tagged genres. Global shuffle still operates on the complete current catalog.
- Track menus support multiple station memberships and creating a station in place. Membership edits leave the current queue snapshot unchanged; reselect the station to refresh its queue.
- Rename/delete are available through Edit station; deletion requires confirmation and only removes the local selection.
- Stations, favorite IDs, the most recent 200 actual playback starts and genre results are in IndexedDB, partitioned by normalized account email. They are device/browser-local, not cloud-synchronized. Browser data removal can erase them.
- Original owner data is retained. Legacy catalog snapshots remain readable. New catalog/playback writes use account keys. Switching accounts stops playback/downloads, clears personal selection and restores the selected account's data.
- History uses the audio playing event and one entry per playback request, so pause/resume does not duplicate entries.
- Preloading keeps only one speculative audio Blob, capped at 32 MiB, with no new persistent audio cache. Save-Data/2G disable preloading. A foreground Next reuses an in-flight speculative request; queue changes abort obsolete requests. Background tasks never request interactive login.

## Genre extraction scope
The catalog loader currently supplies ID, title, artist and stream ID, without genre. Extraction uses Drive files.get?alt=media with Range: bytes=0-65535, serially, up to 50 files per user-started batch, with 500 ms spacing. Responses other than 206 are cancelled without consuming their full body. 401/403/429/network errors pause the batch; restarting retries the unfinished file. Completed results persist individually and subsequent batches skip them.

Implemented parser: complete textual TCON frames in ID3v2.3/v2.4 and FLAC Vorbis GENRE comments contained in the first 64 KiB. Unsupported, incomplete, numeric ID3 genre references, unsynchronized/extended ID3 headers, M4A/Ogg/other formats remain unresolved, not inferred. These outcomes are cached as examined, not classified. UI explicitly shows partial coverage and supported formats.

This is intentionally a bounded first parser, not full format coverage. A later parser version must provide an explicit retry/invalidation path for previously unsupported entries. Modified tags in existing file IDs are not automatically reindexed yet.

Drive partial download reference: https://developers.google.com/workspace/drive/api/guides/manage-downloads#partial_download

## Validation
CI executes the existing test command plus added player integration tests, then the Vite production build. Tests use fake IndexedDB, mocked media events and network responses; they do not prove actual browser audio decoding.

Manual release checks still required:
1. iPhone Safari and installed PWA: open menus, select multiple stations, create/rename/cancel deletion/confirm deletion, reload.
2. Lock screen: next, previous, pause/resume and metadata on actual audio.
3. Real Drive authorization and CORS for Range, MP3/FLAC tag samples and rate limiting.
4. Rapid Next during a slow download, changing station, disconnecting network and switching Google accounts.
5. Mobile layout at 320/375/430 px, dialog keyboard/focus and VoiceOver.

No deployment workflow is triggered for the feature branch. The existing main-only Pages workflow is unchanged.
