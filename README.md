# Astra Player

Astra Player is a lightweight, offline-first media server and web player designed specifically for Android (Termux) and low-resource environments. It indexes local video files and streams them directly to your browser using chunk-based media requests without putting heavy load on memory or CPU.

---

## Key Features

- **Low memory footprint:** idles between 30 MB and 45 MB of RAM, preventing background process termination on Android devices.
- **Partial content streaming:** native HTTP range requests (HTTP 206) with 4 MB chunks for fast seeking without buffering whole files.
- **Transcoding when needed:** HEVC/10-bit is decoded and re-encoded live to 8-bit H.264 (software x264, the v1.3 engine; a hardware encoder is opt-in in Settings). See *10-bit HEVC and Auto resolution* below.
- **Transcoding triggers:** 10-bit video, alternate audio tracks and formats the browser can't play go through ffmpeg. If native playback fails, the player automatically retries through the transcoder.
- **Thumbnails:** uses `cover.jpg`/`folder.jpg`/`poster.jpg` in a series folder when present, otherwise grabs one frame with ffmpeg. Generated lazily (one at a time, never during a live transcode), cached on disk, no internet.
- **Chapters:** embedded chapters appear as ticks on the seek bar, the current chapter name shows above it, a chapter list panel (**C**), a smart *Skip Opening/Next chapter* button and optional auto-skip of openings/endings.
- **Responsive UI:** one stylesheet for phone and PC. The settings, chapters and episodes panels are fixed-size (380 × 280) boxes that open inside the player, with no screen dimming.
- **Slow-device safeguards:** the *Auto* resolution mode watches the decoder speed and steps 720p → 480p → 360p when it drops below real time.
- **Preferences:** seek step, default resolution (Auto/360p/480p/720p/720p+), pre-buffer length, auto-skip, auto-next, thumbnails, sleep timer.
- **Watch progress:** resume points, per-episode "watched" marks, and series cards that continue where you left off.
- **Subtitles:** embedded tracks (SRT/ASS/WebVTT) and external `.srt/.vtt/.ass/.ssa` files, with correct top/bottom positioning, italics/bold, styling controls and a **sync delay** slider. Tracks are pre-extracted in the background and cached, and your subtitle language is remembered between episodes.
- **Audio:** track picker, preferred language, A/V sync offset, working Bass/Treble equalizer with presets.
- **Playback tools:** speed (0.75×–2×), configurable double-tap seek, auto-play next episode, lock screen, screen filters and adaptive sharpening (WebGL), volume/speed memory, media notification controls.
- **Diagnostics:** live RAM/CPU telemetry (polled only while that page is open).

### Keyboard shortcuts (player page)

| Key | Action | Key | Action |
|-----|--------|-----|--------|
| Space / K | Play / pause | `,` / `.` | Previous / next chapter |
| ← / J, → / L | Seek ∓ seek step | `[` / `]` | Speed down / up |
| ↑ / ↓ | Volume | Z / X | Subtitle delay −/+ 0.1 s |
| M | Mute | N / P | Next / previous episode |
| F | Fullscreen | C | Chapter list |

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

---

## Player guide

### Buttons
Player buttons are icon-only. **Hold a button (touch) or hover it (mouse)** to see its name in a small black tip with a blue underline. Releasing a long-press does not trigger the button.

### Top-right readout
`Quality: 720p` is the real output height of the picture. Under it:
- **8-bit · Direct / 8-bit · Transcode** (green): normal 8-bit video.
- **10-bit · Decoding** (red): the file is 10-bit and is being converted live.

### Settings panel (gear)
Tabs: **Filters**, **Subs**, **Speed**, **Audio**. The panel opens inside the player and tapping the video closes it.
- **Filters:** presets, sharpness/brightness/contrast/saturation/hue/warmth. Under *My filters* type a name and press **Save** to keep the current look; tap the chip to reuse it, tap × to delete it (stored in the browser, up to 12).
- **Subs:** track list, add a subtitle file, subtitle style (gear), **Generate with AI**, delay.
- **Speed:** playback speed and audio/video delay fix.
- **Audio:** track list, preferred language, Flat/Bass/Vocal/Cinema sound and bass/treble sliders.

### Episode names
File names are cleaned so you can tell episodes apart. Examples:

| File name | Shown as |
|---|---|
| `[AWI] Darling in the FranXX - S01E22 [720p] [Multi-Audio].mkv` | Darling in the FranXX · S01E22 |
| `The Eminence in Shadow [720p] [S01 E20] [Eng Dub].mp4` | The Eminence in Shadow · S01E20 |
| `[SubsPlease] Frieren - 07 (1080p).mkv` | Frieren · Ep 7 |
| `Naruto.Shippuden.E045.720p.mkv` | Naruto Shippuden · Ep 45 |

Recognised: `S01E22`, `S01 E22`, `1x05`, `Episode 3`, `Ep 3`, `E045` and a trailing ` - 07`. Bracketed groups and tags (`[720p]`, `[Eng Dub]`, `[Multi-Audio]`) are removed from the title.

## Several devices (v1.14)

Open the same address (for example `http://<phone-ip>:3000`) from any phone, tablet or PC and they all share one profile, kept on the server in `profile.json`:

- player preferences (seek step, resolution, pre-buffer, auto-skip, fullscreen options...),
- saved named filters, subtitle look and delay, the subtitle chosen per episode,
- watch progress and history (already server-side in `history.json`).

Storage is server-side too: the media folder, thumbnails and every generated subtitle live on the machine running Astra, so all devices see the same library and the same subtitles.

How it works: each setting change is sent to the server after about half a second; when a device opens (or comes back to the tab) it takes whatever is newer. The most recent change wins per setting, and a toast tells you when settings arrived from another device. Device-only things (the exact playback position of the open tab) are not synced. There is no login: anyone who can reach the address shares the profile, so keep it on your own network or behind a tunnel you trust. Delete `profile.json` to reset all devices.

**Sliders:** every settings slider has − / + buttons (hold to repeat) for exact values.

## Links, saved settings and tasks

### Episode links
Every episode has its own address, written into the browser bar while you watch:

`http://localhost:3000/#player/anime+name/season-1/episode-1`

- Opening that address starts that episode (resume point included). Spaces can be written as `+`, `_` or `-`; the episode number is the one parsed from the file name (see *Episode names*), or the position in the folder.
- Opening just `http://localhost:3000/` always goes to **Home**. It no longer jumps to the last anime.
- If the address does not match anything in the library you get a message and land on Home.

### What is remembered
Saved in the browser, restored on every visit:
- **Global:** filters and the active filter chip, saved filters, sharpness, subtitle style, audio delay, sound preset/bass/treble, preferred audio language, speed, volume, AI language/translate choice, all Settings-page options.
- **Per episode:** resume position, watched mark, subtitle delay, chosen external subtitle file, audio track.
- **AI subtitles:** stored on the server (`subtitles/ai/`) with an index, so an episode finds its generated subtitle again and selects it automatically, whatever language/track options are selected now. A generated subtitle is only reused for the same file (same size and modification time).

### Task manager
Drawer menu → **Tasks** (a badge shows how many are running). It lists everything running in the background with live progress:
- **AI subtitles:** state, percent, part x of y, time left, last sentence heard, errors. **Stop** cancels a job (finished parts are kept, so it resumes later).
- **Live video conversion:** the current transcode, its resolution and decode speed. **Stop** ends it.
- **Thumbnails:** how many are left. **Stop** empties the queue.
- **Stop all** and **Clear finished** buttons (clearing never deletes subtitle files).

## 10-bit HEVC and Auto resolution

Browsers on phones usually cannot play 10-bit HEVC, so the server decodes it and re-encodes to 8-bit H.264 on the fly (`-threads 2`, x264 `ultrafast`/`zerolatency`, same as v1.3).

- **Head start:** 10-bit playback always waits for **5 seconds** of video to be ready before it starts (and again if it stalls). You can raise this in Settings → Pre-buffer.
- **Default resolution** (Settings page):
  - **Auto** (default): starts at 720p. The server reports the live decode speed (`/api/transcode/stats`). If it stays under 0.95x while the buffer runs low, the player drops to 480p, then 360p, and tells you. It never goes back up by itself during an episode.
  - **Low 360p / Fast 480p / Balanced 720p / Quality 720p+:** fixed levels.
- **Lowest level (360p)** also skips the HEVC loop filter for a cheaper decode.
- Measured on a 2-core test machine with a synthetic 20 Mbps 10-bit 720p clip: 1.8x realtime at 720p, 2.2x at 480p, 2.5x at 360p. A phone will be slower; Auto exists for that.

### Automatic mode switching (v1.15.1)
- If the picture freezes while the sound keeps playing, Astra restarts the stream by itself (up to 3 times in 2 minutes). If it freezes in direct play, it moves to the compatibility transcoder.
- **Sticky mode:** once an episode has needed the transcoder it stays on it, saved per episode (and shared between devices), so it does not drop back to direct play and flip between 8-bit and 10-bit.
- The 8-bit / 10-bit readout now shows what the file really is, not what the transcoder does.

## Subtitles

### Styled and positioned subtitles (ASS/SSA)
Karaoke lyrics, signs and typeset text keep their exact screen position (`\pos`, `\move` start, `\an`), size (`\fs`) and colours (`\1c`, `\3c`) as in MX Player, so song syllables sit on one line instead of stacking. Top lines (songs, second speaker) now show together with the bottom line. Not supported: per-syllable animation/highlight, rotation, clipping, blur and drawings.

### Readable names
Generated subtitles are named like a player expects: `Anime Name [S01 E22].srt` and `.vtt` (`Anime Name [E07]` when there is no season; quick ones end with ` (quick)`). Copies are written to `subtitles/export/` and can be downloaded from the subtitle card (SRT / VTT buttons) with the same name. The cache files in `subtitles/` and `subtitles/ai/` keep technical hash names on purpose; do not rename them.

## AI subtitles (speech to text, offline)

Uses **whisper.cpp**; nothing is uploaded and no API key is needed. Open Settings → Subs → *Make subtitles* and pick a mode:

- **Quick:** the smallest model (`tiny`), speech-only, shortest audio window. Fastest, rough: it can mishear or miss words (like automatic captions).
- **AI:** the best installed model that is practical on a phone (`base`, else `small`/`tiny`). Slower, much more accurate.

The two modes are stored separately, so you can make a quick one now and an accurate one later. If the audio track says its language (for example `jpn`), whisper is told directly and skips language detection.

**Speed, honestly:** speed is set by the phone's CPU and RAM. A phone with more cores and RAM runs more parallel workers and a bigger model faster. Nothing can be overclocked from an app. What helps in practice: keep the phone charging, keep the screen on or the Termux wake lock held (Astra takes `termux-wake-lock` automatically while subtitles are generated and releases it afterwards), and install the speech-detection model below.

How it works:
- The episode is cut into 2-minute parts. Each finished part is saved, so a crash or Android killing Termux does not lose work: starting again resumes.
- **It starts at the point you are watching** and keeps following you if you seek, so subtitles stay ahead of the playhead. Parts behind you are filled in afterwards.
- Chapters titled Opening, Ending, OP, ED, Intro, Outro or Credits are skipped (music only).
- Subtitles appear in the player after the first part and update as more are done.
- The box shows the real progress (parts done, time left, time elapsed, the last sentence heard). Errors are shown in red with the cause (for example Android killed whisper because of low memory).
- **Voice detection (big speed-up):** if a Silero VAD model is installed, whisper only decodes real speech and skips music and silence. Install it once: `cd ~/whisper.cpp && sh ./models/download-vad-model.sh silero-v5.1.2` (file `ggml-silero-v5.1.2.bin` in `~/whisper.cpp/models`, found automatically; or set `"whisper": {"vad": "/path/file.bin"}`).
- **Two workers:** on phones with 6 or more cores two whisper processes work on different parts at the same time (set `"whisper": {"parallel": 1}` to turn it off, or `"threads": N` for threads per worker).
- Speed settings used: greedy decoding (`-bs 1 -bo 1`), no previous-text context (`-mc 0`), shorter audio context (`-ac 768` quick / `1024` AI). Temperature fallback stays **on** (it is what breaks repeat loops). If your whisper build rejects a flag the server retries with simpler settings by itself.

**Accuracy fixes (v1.13):**
- *Repeat loops* ("you, you, you...", "No." 40 times, "a film of a film of..."): quiet/music parts no longer trap the tiny model, because suppression flags (`-et -lpt -nth -sns`) and a tuned voice detector are used, and every line is cleaned afterwards: stutters and repeated phrases are collapsed, duplicate and overlapping lines are merged, and a short line can no longer stay on screen for 40 seconds.
- *Missing scenes at part edges:* each part is read 3 s early and 3 s late, and a part keeps the lines that *start* inside it, so a sentence is never cut at a boundary. If a long part comes back almost empty, it is checked again without voice detection.
- *Damaged audio* (`Terminating thread with return code ...`): extraction retries by skipping corrupt AAC frames, then with a slow exact seek. If a slice still cannot be decoded it is skipped with a note in the log instead of stopping the whole episode.
- **Voice-focused audio (v1.15):** on 5.1/7.1 files the dialogue (centre) channel is used; AI mode also band-passes and denoises the speech range. Real stem separation (Demucs-style) needs far more RAM/CPU than a phone has, so this is a lightweight version of the same idea.
- **Silence removed before listening (v1.15):** each part is scanned for silence, the silent stretches are cut out, whisper hears only speech, and every line's time is mapped back to the real timeline. Set `"whisper": {"gate": false}` in `config.json` to turn it off.
- Old v1.12 results are not reused (they are regenerated with the fixes). Opening/ending chapters are skipped by design, so a gap of about 90 s near the start is normal.

Speed on a weak phone: transcription speed depends on the CPU. `ggml-tiny.bin` is used first because it is about twice as fast as base. For a faster file you can use a quantised model (for example `ggml-tiny-q5_1.bin`) if you have one. To prefer `ggml-base.bin` set `"whisper": {"model": "/full/path/ggml-base.bin", "threads": 4}` in `config.json`. Use **All episodes** and let it run while charging for a whole season.

Build (Termux), one command at a time:
```
pkg install git cmake clang make
git clone https://github.com/ggml-org/whisper.cpp ~/whisper.cpp
cd ~/whisper.cpp
sh ./models/download-ggml-model.sh tiny
cmake -B build
cmake --build build -j2 --target whisper-cli
```
Binary: `~/whisper.cpp/build/bin/whisper-cli`. Models are found in `./models`, `~/whisper.cpp/models` or `~/models`. Environment overrides: `ASTRA_WHISPER_BIN`, `ASTRA_WHISPER_MODEL`.

32-bit ARM (armv7): if the build fails with `redefinition of 'vcvtnq_s32_f32'`, run
`sed -i '/inline static int32x4_t vcvtnq_s32_f32/,/^}/d' ggml/src/ggml-cpu/ggml-cpu-impl.h` and build again.

Generated subtitles are cached in `subtitles/ai/` (delete the file to regenerate).
