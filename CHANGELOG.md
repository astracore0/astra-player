# Changelog

## 2.4.0
- **Conversion cache for 10-bit / HEVC videos.** The converted video is written to disk; a finished conversion is replayed instantly from any position, with no re-encoding.
- Conversion keeps running while the video is paused, buffering, or the tab is closed (the old behaviour froze or stalled ffmpeg). Environment: `ASTRA_TC_CACHE_MB`, `ASTRA_NO_TC_CACHE`.
- New Quality tab in the player settings (Auto, 4K, 2K, 1080p, 720p, 480p, 360p) for converted videos; the choice is saved. Server gained a 2K (1440p) level.
- New Filters tab: preset dropdown with many extra presets, custom filters you can name and delete, sliders with +/- buttons.
- Equalizer: presets, 5 bands, reverb, bass boost and virtualizer.
- Themed controls: YouTube-style seek line, round +/- sliders, blue/white progress bars, one-line dropdowns.
- Toasts are coloured by message: green (done), yellow (warning), red (error), blue (info).
- Video output is sent in larger blocks, which is lighter on a phone's network stack over localhost.
- Fixes: episode list layout, watch history and library headers, offline text covers.

## 1.21.7
- Previous release.
