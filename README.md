# Astra Player

A small, offline-first anime / video server and web player. It runs on your phone (Termux), a PC, or GitHub Codespaces, indexes the videos in one folder and plays them in any browser, on the same device or on others (Wi-Fi, tunnel). Light on RAM (30-45 MB idle), heavy lifting (10-bit HEVC, subtitles) is done by ffmpeg and whisper.cpp only when needed.

**Contents:** [Setup](#setup-step-by-step) · [First run](#first-run-5-minutes) · [Sharing with friends](#sharing-with-friends-cloudflare-tunnel) · [Configuration](#configuration-configjson) · [Update / problems](#updating-and-troubleshooting) · [How the key parts work (spoilers)](#how-the-key-parts-work) · [Features](#key-features) · [Reference](#player-guide)

---

## Setup step by step

Pick the line that matches your device. Every path ends the same way: the server runs on port **3000** and you open `http://localhost:3000`.

### A. One command (recommended)

```bash
# Termux (Android) only - once:  pkg install -y curl git
curl -fsSL https://raw.githubusercontent.com/astracore0/astra-player/main/setup.sh | bash
```
This clones https://github.com/astracore0/astra-player into `~/astra-player`, installs Node.js, ffmpeg and git, runs `npm install`, picks your media folder, builds whisper.cpp with its models (offline AI subtitles) and writes `start.sh`. It can take 10-20 minutes on a phone, mostly the whisper build. Safe to run again.

Then start it:
```bash
cd ~/astra-player && bash start.sh
```

Options (add after `bash` like `... | bash -s -- --no-whisper`, or `bash setup.sh --no-whisper` inside the folder):

| Option | What it does |
|---|---|
| `--no-whisper` | Skip whisper.cpp (no offline AI subtitles, setup is much faster) |
| `--model tiny\|base\|small` | Which AI model to download (bigger = more accurate, slower) |
| `--media /path` | Your video folder (otherwise it looks for `anime`, `.anime`, `/sdcard`...) |
| `--port N` | Port written into `start.sh` (default 3000) |
| `--dir PATH` | Where to clone (default `~/astra-player`) |
| `--branch NAME` | Branch to clone (default `main`) |
| `--update` | `git pull` first (run inside the folder) |
| `--dry-run` | Print what would happen, change nothing |

### B. Per device

<details><summary><b>Android - Termux</b></summary>

1. Install **Termux from F-Droid** (the Play Store version is outdated).
2. `pkg update && pkg install -y curl git`
3. Run the one-command line above. Allow the storage popup (setup runs `termux-setup-storage` for you). Your phone storage is then `~/storage/shared` (same as `/sdcard`).
4. `cd ~/astra-player && bash start.sh` (it holds the wake lock so Android does not kill the server).
5. Open `http://localhost:3000` in Chrome on the same phone.
6. Tip: Settings > Preferences > Low-memory mode (Auto) helps weak phones.
</details>

<details><summary><b>Linux (Debian/Ubuntu, Fedora, Arch, Alpine, openSUSE)</b></summary>

Run the one-command line. The script detects the package manager and uses `sudo` when needed. Videos: put them in `~/Videos/anime` or pass `--media /your/folder`.
</details>

<details><summary><b>macOS</b></summary>

Needs Homebrew (https://brew.sh). Then run the one-command line. whisper.cpp builds with cmake from brew.
</details>

<details><summary><b>Windows</b></summary>

Use WSL: in PowerShell `wsl --install`, restart, open **Ubuntu**, run the one-command line there. Your Windows drives are under `/mnt/c/...` (for example `--media /mnt/d/Anime`). Open `http://localhost:3000` in your Windows browser.
</details>

<details><summary><b>GitHub Codespaces</b></summary>

Open the repo in a Codespace, run `bash setup.sh`, start with `bash start.sh`, then in the **Ports** tab open port 3000. Put test videos in `/workspaces/media` (setup uses it when found).
</details>

<details><summary><b>Manual install (no script)</b></summary>

```bash
git clone https://github.com/astracore0/astra-player.git
cd astra-player
npm install --omit=dev
# ffmpeg + ffprobe must be installed (pkg/apt/brew install ffmpeg)
node server.js
```
Environment variables: `PORT` (3000), `HOST` (`0.0.0.0`; `127.0.0.1` keeps it private to this device), `ASTRA_WHISPER_BIN`, `ASTRA_WHISPER_MODEL`, `ASTRA_WHISPER_VAD` (whisper.cpp paths when not auto-found), `ASTRA_HW_ENCODER`, `ASTRA_AI_CHUNK_SEC`.
</details>

### What gets installed

| Part | Needed for | Required? |
|---|---|---|
| Node.js 18+ and `npm install` (only `express`) | the server | yes |
| ffmpeg + ffprobe | 10-bit/HEVC playback, audio tracks, subtitle extraction, thumbnails | yes |
| git | clone / update | yes |
| whisper.cpp + `ggml-*.bin` (+ silero VAD) | offline AI subtitles | optional (`--no-whisper`) |
| an API key (Groq / OpenAI) | online AI subtitles | optional, Settings |

---

## First run (5 minutes)

1. Start the server and open `http://localhost:3000`.
2. **Files** (menu) opens your library folder. Wrong folder? Go to the right one and press **Set Default Root**, then **Rescan** on the dashboard.
3. Folders become series: `Show/Season 1/Episode 01.mkv` shows as Show - Season 1. Files named `S01E02` or `Episode 2` are sorted automatically.
4. Press a series, pick an episode. Hold or hover any button for a description.
5. **Settings & Metrics** > Preferences: resolution, pre-buffer, animations, Network mode (online covers).
6. Subtitles: player gear > Subtitles. Embedded tracks appear by themselves; **Add Subtitle** adds a file; **Make subtitles** creates them with AI.

## Sharing with friends (Cloudflare tunnel)

On your phone/PC, with the server running:
```bash
# one-time install:  pkg install cloudflared   (Termux)   |   see developers.cloudflare.com/cloudflare-one/connections/connect-networks/downloads
cloudflared tunnel --url http://localhost:3000
```
It prints a `https://xxxx.trycloudflare.com` link. Send it to friends. Everyone who comes in through the tunnel is a **guest**: their own default settings and watch history (saved per browser in `users/`), no access to your library folder setting, API key, caches or tasks, and only files inside the shared library folder. You (localhost / your Wi-Fi) keep one shared owner profile. Stop `cloudflared` to stop sharing. Your upload speed limits how many people can watch (10-bit videos are converted live and need CPU, so keep Auto resolution on).

## Configuration (`config.json`)

Next to `server.js`. Most things are set from the app; edit the file when you need more. Restart the server after editing.

```json
{
  "mediaRoot": "/sdcard/.anime",
  "thumbnails": [
    { "path": "/sdcard/.anime/youtube/zzz by chiken", "thumbnail": "/sdcard/download/zzz.png" }
  ],
  "ai": { "base": "https://api.groq.com/openai/v1", "model": "whisper-large-v3-turbo", "key": "" },
  "whisper": { "model": "ggml-base.bin", "parallel": 2, "threads": 3 }
}
```
- `mediaRoot` - library folder (also set by **Set Default Root**).
- `thumbnails` - your own covers, see *Custom thumbnails* below. Android-style `/sdcard/...` paths work.
- `ai` - online AI subtitles (use the Settings card instead of typing the key here). Keep the file private: it holds the key.
- `whisper` - advanced: model file, number of parallel workers and threads, `gate`/`snap` (false = turn off silence cutting / snapping).

Other files the server creates: `history.json`, `profile.json` (owner settings), `users/` (guests), `cache/` (thumbnails, covers, converted subtitles), `subtitles/` (AI results).

## Updating and troubleshooting

- Update: `cd ~/astra-player && bash setup.sh --update` (or `git pull && npm install`).
- **Black screen / no sound on 10-bit video:** it is converted live; lower the resolution in Preferences or leave Auto. First start needs a few seconds head start (pre-buffer).
- **Library empty:** wrong folder. Files > open the right one > **Set Default Root** > Rescan. On Termux run `termux-setup-storage` and allow the permission.
- **AI subtitles button disabled:** no whisper.cpp / model and no API key. Run setup without `--no-whisper`, or add a key in Settings.
- **Android kills the server:** use `bash start.sh` (wake lock) and turn off battery optimisation for Termux.
- **Port busy:** `PORT=3001 node server.js` or `bash setup.sh --port 3001`.
- **Cannot reach it from another device:** use the phone's Wi-Fi IP (`http://192.168.x.x:3000`), same network, `HOST` must be `0.0.0.0`.

---

## How the key parts work

Each block below is closed. Click it to see **how it is built** and **why it exists**.

<details><summary><b>Streaming videos (HTTP range, /stream)</b></summary>

**How:** `server.js` answers `GET /stream?file=...` with HTTP 206 partial content. The browser asks for a byte range; the server reads just that part with a 1 MB read buffer and `setNoDelay`. An open-ended request (`bytes=N-`) is served up to 64 MB, so the browser can read far ahead; the browser still applies its own back-pressure.

**Why:** seeking must be instant and a phone must not load a whole 1 GB episode into RAM. Sending only what is asked keeps idle memory at 30-45 MB. A deep buffer ahead is what makes playback smooth on slow storage.
</details>

<details><summary><b>Live transcoding for 10-bit / HEVC and Auto resolution</b></summary>

**How:** `ffprobe` reads the codec and bit depth (cached in `metaCache`). Browsers cannot play 10-bit HEVC, so the server starts `ffmpeg` and streams a fragmented MP4 (8-bit H.264 + AAC) live. Quality presets (360p ... 720p+, and 1080p / 4K) set height, CRF and encoder speed. Auto mode watches ffmpeg's `speed=` and steps down 720p > 480p > 360p when it drops below real time. Software x264 is the default (most reliable); a hardware encoder is opt-in.

**Why:** most anime releases are 10-bit HEVC and phones' browsers refuse them. Converting only when needed keeps 8-bit files on the cheap direct path. Auto resolution exists because a phone that cannot keep up should lower quality by itself instead of stuttering.
</details>

<details><summary><b>Pre-buffer in MB and the 5 s head start</b></summary>

**How:** Settings let you give a memory size for 8-bit and for 10-bit videos separately. The player turns MB into seconds with the video's own data rate (`file size / duration`, or the converter's rate) and shows the result under the picker. A custom MB/GB keypad is built in. 8-bit never waits more than 20 s; a converted 10-bit video always keeps at least 5 s.

**Why:** you think in memory, not seconds, and 8-bit is light so it should start at once, while a live conversion needs a head start or it stutters in the first seconds. 1080p / 4K raise the 10-bit value automatically.
</details>

<details><summary><b>AI subtitles (offline, whisper.cpp)</b></summary>

**How:** the audio track is cut into 2-minute slices (`aiRun`). Each slice is extracted with ffmpeg (band-pass + level normaliser, no denoiser), silence is cut out so whisper cannot loop on gaps, whisper.cpp runs with a voice-activity model (falling back through simpler flag "tiers" for older builds) and timestamps are mapped back. Cues are cleaned (loops, junk, wrong script), merged across slices and cached per slice, so a stopped job resumes. Work starts at the playhead so lines are ready before you reach them. The *Include songs & music scenes* switch skips silence cutting, OP/ED skipping and the voice detector so lyrics and music scenes are read too. Results are cached under a key made from the file, track, language, mode and switches, and exported as readable `.srt/.vtt`.

**Why:** many releases have no subtitles in your language. Doing it on-device keeps it free and private. The chunked, resumable design exists because a phone may be slow or killed by Android mid-way. Songs became a switch because the old denoiser removed music-scene dialogue.
</details>

<details><summary><b>Online AI subtitles (optional)</b></summary>

**How:** the same slicing pipeline, but each slice is sent as audio to an OpenAI-compatible `/audio/transcriptions` (or `/translations` for English) endpoint and the returned segments become cues. Three slices run at once, 429/5xx are retried with back-off. The key lives only in `config.json`; the page can send a new key but can never read it back, and it is never logged. Guests cannot touch it.

**Why:** a phone may be too slow for whisper. A hosted model (Groq has a free tier) is fast and accurate. It is optional because it needs internet and sends audio out.
</details>

<details><summary><b>Styled subtitles (ASS / SRT engine)</b></summary>

**How:** the server turns ASS/SSA tags (position, move, fade, transforms, karaoke, rotation, outline, drawings) into markers inside the WebVTT; the browser decodes them and animates with the Web Animations API, locked to the video clock so seeking and pausing stay in sync. SRT files are read directly so overlapping lines and top-positioned lines survive. The subtitle look (font, size, border, background, height) is applied on top for plain dialogue and lifts above the control bar by itself.

**Why:** anime subtitles are often typeset (signs, songs, karaoke). Plain VTT loses all of that; ffmpeg's SRT conversion also merged simultaneous lines.
</details>

<details><summary><b>Thumbnails, covers and custom thumbnails</b></summary>

**How:** order of choice: your `thumbnails` entry in `config.json` > online cover (Network mode online: AniList, then Jikan, only when the title matches well; YouTube downloads use the video id in the file name) > `cover.jpg`/`folder.jpg`/`poster.jpg` in the folder > one video frame by ffmpeg. All are cached on disk, generated one at a time and never during a live conversion.

**Why:** a library of grey boxes is hard to use, but covers must not slow the phone or need internet by default, so online is opt-in and wrong matches are rejected.
</details>

<details><summary><b>Per-user profiles and guests</b></summary>

**How:** settings and history sync through `/api/profile` and `/api/history`. Requests that carry proxy headers (Cloudflare, `x-forwarded-for`) are guests: a random cookie id selects `users/<id>.json`, owner-only routes return 403 and file paths outside the library folder are refused. Everything else is the owner profile shared by your own devices.

**Why:** showing the player to friends through a tunnel must not give them your settings, your key or your phone's folders, and their watch history must not mix with yours.
</details>

<details><summary><b>Low-memory mode and animations off</b></summary>

**How:** Auto = on for devices reporting 2 GB RAM or less, or 4 cores or fewer. It empties the home / history pages while you watch and rebuilds them when you return, unloads a video that has been paused outside the player for 90 s (it reopens at the same second), turns blur/shadow/transitions off and halves the subtitle clock rate. The Animations switch uses the same "no effects" rules.

**Why:** weak phones lag from memory pressure and effects, not only from decoding.
</details>

<details><summary><b>Files page, Task Manager, deep links</b></summary>

**How:** Files browses folders through `/api/storage/explore` (with suggestions from `/api/storage/suggest`) and starts in your library folder. The Task Manager lists live conversions, AI jobs and online cover downloads with stop/clear. Episode links (`#player/series/season/episode`) reopen an episode on any device.

**Why:** you should be able to see what the phone is busy with, stop it, and pick your folder without typing paths blindly.
</details>

---

## Subtitle styling (v1.17)
ASS/SSA tracks are drawn with their own animation and placement: corners/top/middle/bottom, move, fades, \t transforms, karaoke, rotation, outline/shadow, named fonts and vector drawings (as SVG). Plain dialogue follows your subtitle settings. Embedded fonts and \clip are not supported yet.

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
- **Timing correction (v1.16):** the silence scan knows where speech really starts and stops, so a line that opens or closes next to a speech edge is moved onto it. Set `"whisper": {"snap": false}` in `config.json` to turn it off.
- **Names (v1.16):** a new subtitle never overwrites another one of the same episode. If `Name [S01 E05].srt` is taken, the next language/model becomes `Name [S01 E05] (ja).srt`, `(translated)`, `(en 2)`...
- **Timing correction (v1.16):** the silence scan knows where speech really starts and stops, so a line that opens or closes next to a speech edge is moved onto it. Set `"whisper": {"snap": false}` in `config.json` to turn it off.
- **Names (v1.16):** a new subtitle never overwrites another one of the same episode. If `Name [S01 E05].srt` is taken, the next language/model becomes `Name [S01 E05] (ja).srt`, `(translated)`, `(en 2)`...
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


## Custom thumbnails
Give a series folder your own cover in `config.json` (next to server.js). Paths can be written the Android way (`/sdcard/...`); on Termux they are found through `~/storage/shared`.

```json
{
  "thumbnails": [
    { "path": "/sdcard/.anime/youtube/zzz by chiken", "thumbnail": "/sdcard/download/playing zzz series.png" },
    { "path": "/sdcard/.anime/darling in franxx S01", "thumbnail": "/sdcard/download/darling in franxx S01 Thumbnail.png" }
  ]
}
```
A custom thumbnail always wins over the online cover and the video frame. png, jpg, webp, gif, avif up to 12 MB. Restart the server (or reload the library) after editing.


