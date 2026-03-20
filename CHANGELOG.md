# Changelog

## [v1.5.8] - 2026-03-20

### Bug Fixes
- **FetchBlock stall at 64MB boundary**: Eliminated deterministic freeze at warmup
  boundary by correcting 8 comparison operators (`>=` → `>`) in disk_warmup.go and
  main.go. Chunks starting exactly at 64MB are now written in full.
- **Disk warmup handle panic**: Prevented writes to closed file handles during torrent
  cleanup via `atomic.Bool` closed flag checked before every WriteAt.
- **Nil pointer in torrent status**: Added nil guard for `fileStat` before accessing
  `fileStat.Id` during status enumeration.
- **AI tuner state leak**: Restored default `connections_limit`/`peer_timeout_seconds`
  at playback end; `CurrentLimit` reset to zero so each session starts from config.

### Features
- **Async Wake with warmup hit**: `Wake()` runs asynchronously when head warmup cache
  is present — `Open()` returns in 0.1–0.5s instead of blocking until torrent ready.
  Synchronous path preserved for cold starts.

### Refactoring
- **warmupFileSize hardcoded**: Removed `WarmupHeadSizeMB` config UI field; value is
  always 64MB. Existing `warmup_head_size_mb` entries in config.json are silently
  ignored for backward compatibility.
- **getHandle returns cachedHandle**: Safer lifetime tracking of disk warmup file
  handles; `closed` flag now accessible without extra sync.
