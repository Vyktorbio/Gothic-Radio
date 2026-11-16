# Backup and discovery

The header gear opens native dialog settings. Backup export/import and genre-indexing controls live there, leaving the player uncluttered. No Firebase changes or cloud synchronization are introduced.

Backup version 1 is JSON with format gothic-radio-personal. It contains stations, favorite track IDs, up to 200 history entries, and all recorded heard IDs. The explicit export allowlist excludes credentials, account email, audio, catalog, genre cache and playback preferences. Keep the file private because it contains listening selections.

Import accepts at most 32 MiB and validates format/version, bounded lists, identifiers, text and history timestamps. A preview shows counts; the user must confirm. Import combines memberships for identical station IDs, preserves current station names, deduplicates favorite/heard IDs and history events, and retains only the latest 200 history entries. Station names alone do not identify stations. Nothing is deleted from the current collection. Playback settings and active station queue are preserved. References absent from the current catalog remain in the backup for possible later use.

File reading and confirmation are bound to the active account generation. Changing accounts invalidates the pending preview. Successful import is reported only after IndexedDB commits. If storage fails, existing data is not deleted; the in-memory merged selection remains available for export, with an error shown rather than a success message.

Discovery records IDs when audio actually starts, separately from capped history. Existing available history seeds the heard set. Pausing/resuming does not increment unique progress, failed playback does not count, and historical plays outside available records cannot be reconstructed. Progress counts the intersection with the current catalog. The unheard filter combines with stations, genre/favorites/artist/search and shuffle; it never silently returns to already heard tracks on exhaustion. Filter preference and heard IDs persist per account.

Validation: existing and new Node/fake-IndexedDB tests plus Vite build run in PR CI. Browser UI, Safari file export/import through Files, mobile focus/VoiceOver and real media behavior require manual device verification. No local browser/executor was available for this change.
