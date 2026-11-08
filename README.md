# Astra Player

Astra Player is a lightweight, offline-first media server and web player designed specifically for Android (Termux) and low-resource environments. It indexes local video files and streams them directly to your browser using chunk-based media requests without putting heavy load on memory or CPU.

---

## Key Features

- **Low memory footprint:** idles between 30 MB and 45 MB of RAM, preventing background process termination on Android devices.
- **Partial content streaming:** native HTTP range requests (HTTP 206) with 4 MB chunks for fast seeking without buffering whole files.
- **Transcoding when needed:** 10-bit video, alternate audio tracks and formats the browser can't play go through ffmpeg. If native playback fails, the player automatically retries through the transcoder.
- **Text-driven studio UI:** responsive dark dashboard, no thumbnail generation or image APIs.
- **Watch progress:** resume points, per-episode "watched" marks, and series cards that continue where you left off.
- **Subtitles:** embedded tracks (SRT/ASS/WebVTT) and external `.srt/.vtt/.ass/.ssa` files, with correct top/bottom positioning, italics/bold, styling controls and a **sync delay** slider. Tracks are pre-extracted in the background and cached, and your subtitle language is remembered between episodes.
- **Audio:** track picker, preferred language, A/V sync offset, working Bass/Treble equalizer with presets.
- **Playback tools:** speed (0.75×–2×), **Skip intro (+85 s)**, 10 s double-tap seek, auto-play next episode, lock screen, screen filters and adaptive sharpening (WebGL), volume/speed memory, media notification controls.
- **Diagnostics:** live RAM/CPU telemetry (polled only while that page is open).

### Keyboard shortcuts (player page)

| Key | Action | Key | Action |
|-----|--------|-----|--------|
| Space / K | Play / pause | S | Skip intro (+85 s) |
| ← / J, → / L | Seek ∓10 s | `[` / `]` | Speed down / up |
| ↑ / ↓ | Volume | Z / X | Subtitle delay −/+ 0.1 s |
| M | Mute | N / P | Next / previous episode |
| F | Fullscreen | | |

---

## Prerequisites

Node.js, Git and ffmpeg (ffmpeg/ffprobe are needed for subtitles, audio-track switching and transcoding):

    pkg update && pkg install nodejs git ffmpeg -y
    termux-setup-storage

---

## Installation & Setup

1. Clone the repository:

       git clone https://github.com/<your-username>/astra-player.git
       cd astra-player

2. Install dependencies:

       npm install

3. Start the engine:

       npm start        # or: node server.js

4. Open `http://localhost:3000` in your browser.

Optional environment variables: `PORT` (default 3000) and `HOST` (default `0.0.0.0`; use `127.0.0.1` to keep the server private to the device).

---

## Storage Configuration

Astra Player scans directories in this order by default:
- `~/storage/shared/anime` (or `Anime`)
- `/sdcard/anime` (or `Anime`, `.anime`)
- `/sdcard`

To use a different folder, open **Folder Explorer**, navigate to it and tap **Set as Media Root**. Use **Rescan** on the dashboard after adding files.

---

## Security notes

The server only serves files with video (`.mp4 .mkv .webm .avi .mov .ts .m4v`) or subtitle extensions, and never builds shell commands from file names. It has no authentication, so on shared networks set `HOST=127.0.0.1`.

---

## Disclaimer

Astra Player is strictly a personal media server software engine. It does not distribute, host, scrape, or index copyrighted video files. Users are solely responsible for providing their own legally obtained media content.

---

## License

This project is open-source software licensed under the MIT License.
