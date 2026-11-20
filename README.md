# Astra Player

A personal anime / video player for the files on your own phone, PC or server.
A small Node.js server scans your media folder and streams it to a phone-friendly web UI.
Videos a browser cannot play (10-bit, HEVC/H.265) are converted live with ffmpeg, and finished conversions are cached so replaying them is instant.

No account, no cloud, no tracking. It was built and tested mainly on a low-end Android phone (Termux), so it is careful with CPU and memory.

## Features

**Library**
- Library & Playlists shelf built from your folders, plus a Watch History shelf with resume
- Covers: online thumbnails when you allow it, otherwise generated text covers; you can set your own cover
- Per-user history for visitors who open it through a tunnel (guest mode, see Security)

**Player**
- YouTube-style seek bar, double-tap ±seek, speed control, sleep timer, screen lock
- Subtitles: external `.srt .vtt .ass .ssa`, embedded tracks, and optional offline AI subtitles (whisper.cpp)
- Audio track selection
- Video filters: presets (Anime Vivid, Cinema, Noir, Sharp HD and more), your own named custom filters, brightness / contrast / saturation / hue / warmth and a sharpness filter
- Equalizer: presets, 5 bands, reverb, bass boost and virtualizer
- Cast / TV link for a smart-TV browser

**10-bit / HEVC videos (live conversion)**
- Converted to H.264 on the fly with ffmpeg; the Quality tab (Auto, 4K, 2K, 1080p, 720p, 480p, 360p) appears for these videos and your choice is saved
- Hardware encoder (`h264_mediacodec` on Android) is tried first and falls back to software x264 automatically
- Seeks inside the already buffered part do not restart ffmpeg
- **Conversion cache:** the converted video is saved to disk while it plays
  - closing the tab, pausing, or a slow connection does **not** stop the conversion, so it can finish in the background
  - a finished conversion is replayed from disk with no re-encoding, starting at any position you pick
  - reopening the same stream while it is still converting re-attaches to it
  - the cache is size-limited and the oldest entries are removed first

## Requirements

- Node.js 18 or newer
- ffmpeg and ffprobe
- Optional: whisper.cpp for AI subtitles (the setup script can build it)

## Install

### One command (Termux, Linux, macOS, WSL, GitHub Codespaces)

```bash
curl -fsSL https://raw.githubusercontent.com/astracore0/astra-player/main/setup.sh | bash
```

On Termux run `pkg install -y curl git` first. Useful options:

```bash
bash setup.sh --no-whisper        # skip AI subtitles (much faster install)
bash setup.sh --media /path/to/anime
bash setup.sh --port 3000
bash setup.sh --dry-run           # show what it would do
bash setup.sh --help
```

### By hand

```bash
git clone https://github.com/astracore0/astra-player.git
cd astra-player
npm install
node server.js
```

Open `http://localhost:3000`. From another device on the same Wi-Fi use `http://<your-ip>:3000`.
Set the media folder in the app, or put `{ "mediaRoot": "/path/to/anime" }` in `config.json`.

## Settings you can change with environment variables

| Variable | Default | What it does |
|---|---|---|
| `PORT` | `3000` | Port to listen on |
| `HOST` | `0.0.0.0` | Address to listen on (`127.0.0.1` = this device only) |
| `ASTRA_TC_CACHE_MB` | `1536` | Size limit of the conversion cache in MB |
| `ASTRA_NO_TC_CACHE` | off | Set to `1` to turn the conversion cache off |
| `ASTRA_HW_ENCODER` | auto | Force an encoder name, or `off` to always use software x264 |
| `ASTRA_WHISPER_BIN` / `ASTRA_WHISPER_MODEL` / `ASTRA_WHISPER_VAD` | auto | Paths for whisper.cpp |
| `ASTRA_AI_CHUNK_SEC` | `120` | Length of audio pieces sent to the AI subtitle step |

Example: `ASTRA_TC_CACHE_MB=3000 PORT=8080 node server.js`

## Where things are stored

Everything lives next to `server.js` and is ignored by git:

| Path | Content |
|---|---|
| `config.json` | Media folder and settings |
| `history.json`, `profile.json`, `users/` | Watch history and profiles |
| `subtitles/` | Subtitles you saved or generated |
| `cache/` | Thumbnails and the conversion cache (`cache/transcode/`) |
| `app.log` | Server log |

To clear the conversion cache, stop the server and delete `cache/transcode/`.

## Troubleshooting

**Conversion is slow or the video keeps buffering**
- Open Settings, Quality and pick 480p or 360p. 4K, 2K and 1080p need a fast CPU.
- Set sharpness to Off and the equalizer to Off on a low-end phone: they use the same CPU as the video.
- The speed shown on the player is how fast converted video arrives; below `1.0x` the machine running the server cannot convert in real time. `GET /api/transcode/stats` shows ffmpeg's real speed.
- Hardware encoder misbehaving? Start with `ASTRA_HW_ENCODER=off node server.js`.

**A converted video does not start from the cache**
- The cache only holds conversions that ran to the end. If you left early, the server keeps converting in the background; give it a few minutes.
- The cache is per video file, audio track and quality. Changing any of them converts again.

**No AI subtitles**
- Run `bash setup.sh` again without `--no-whisper`, or point `ASTRA_WHISPER_BIN` and `ASTRA_WHISPER_MODEL` to your whisper.cpp files.

## Security

There is **no login**. Anyone who can open the address can watch your library.
Keep it on your own network. If you share it through a tunnel (for example Cloudflare Tunnel), visitors are treated as guests: they get their own watch history and cannot change owner-only settings (media folder, API keys, cache clearing). Still, do not expose it publicly with files you would not want others to see.

## Development

```bash
npm install
node -c server.js && node -c public/script.js    # syntax check
node server.js
```

The server is one file (`server.js`, Express) and the UI is plain HTML/CSS/JS in `public/` (no build step).
After changing `public/` files, raise the `?v=` number in `public/index.html` so phones do not keep the old cached files.

## License

MIT. See [LICENSE](LICENSE).
