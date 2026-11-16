# Changelog

## v1.19.0 (UI animation)
- Mute shows a speaker with a ✕ (sound waves fade out, ✕ draws in); the speaker pops on click.
- Play/Pause morph into each other; back/forward arrows nudge in their direction; buttons pulse on tap.
- Settings / Episodes / Chapters panels: tabs and cards fade in, smoother scrim; small screens show icon-only pills so the control bar never overflows.
- Watch history is one horizontal row, left to right: your episode, then NEXT, NEXT 2, NEXT 3, then your other shows.

## v1.18.0 (speed)
- Direct play (8-bit): 1 MB file reads, 8 MB range chunks, TCP no-delay and cache headers; the video element preloads fully.
- Web Audio (delay/EQ chain) is built only when you use audio delay or EQ, so plain playback has no extra audio processing.
- ffprobe results are cached (reopening an episode is instant) and the next episode is prepared 15 s into playback (probe + first MB).
- Transcoder: decoder and x264 use every CPU core (frame threads instead of slow slice threads), no lookahead/B-frames, CAVLC for cheap phone decoding, full source frame rate (60 fps stays 60), faster start (smaller probe, no mux delay, flush every packet).

## v1.17.1 (SRT styling)
- .srt files are read directly (ffmpeg used to merge cues that start together): <font face/size/color>, <b>/<i>/<u> and {\an7-9} now show as written in the file.
- Syllable-by-syllable subtitles (one tiny cue per letter/syllable) are joined into one line instead of a vertical column.
- Outline+fill duplicate layers show once; drawing code that leaked into SRT text is hidden; lines on the same spot stack instead of overlapping.

## v1.17.0 (subtitle engine)
- ASS subtitles now draw like a real player: all 9 screen positions (corners, top, middle, bottom) with the file's margins, \pos and \move paths, \fad/\fade fades, \t animation (rotate, scale, size, colour, blur, outline), karaoke (\k/\kf/\ko), rotation, outline/shadow/blur, fonts named in the file, bold/italic/underline/strike, and vector drawings (\p) rendered as SVG shapes.
- Animations stay locked to the video clock: they pause with the video and re-sync after a seek.
- Plain dialogue (no special tags) still uses your own subtitle size/colour settings.
- Subtitle cache is rebuilt once so old tracks pick up the new data.
- Not included: embedded font files from the MKV, \clip masks, 3D rotation (\frx/\fry).

## v1.16.1 (self-audit fixes)
- Timing snap no longer pulls a line onto the neighbouring speech stretch's edge.
- Loop cleanup is gentler on real dialogue ("No, no, no!" and a line said twice stay) and stronger on loops: a whole block of lines repeated straight after itself is dropped; wrong-script junk (Hangul/CJK/\ufffd) is removed from English/Latin-language subtitles.
- Language detection output is no longer cut off; an export name is only treated as taken if that file still exists.
- setup.sh applies the armv7 patch only if the whisper.cpp build fails, then rebuilds.

## v1.16.0
- Subtitle timing: lines that open/close next to a real speech edge are snapped onto it (`"whisper": {"snap": false}` turns it off).
- Unique subtitle names: another language/model/translation of the same episode gets its own file name instead of replacing the old one.
- Subtitles that land on the same spot are stacked (up/down) instead of printed over each other.
- setup.sh now does the full setup by default (whisper.cpp and models included; `--no-whisper` to skip) and verifies the result. The release zip now includes package.json, setup.sh and CHANGELOG.md.

## v1.15.2
- setup.sh: one-command setup for Termux, Linux, macOS, WSL and Codespaces (--whisper, --media, --dry-run).

## v1.15.1
- Automatic mode switching: a frozen picture (sound keeps playing) restarts the stream, or moves direct play to the compatibility transcoder.
- Sticky mode: an episode that once needed the transcoder stays on it (saved per episode, shared between devices).
- The 8-bit / 10-bit readout shows what the file really is.

## v1.15.0
- AI subtitles: voice-focused audio (centre channel on 5.1/7.1, band-pass + denoise in AI mode) and silence removal before transcription, with times mapped back to the real timeline (`"whisper": {"gate": false}` turns it off).
- Sync fix: the server clock decides, so a device with a wrong clock can no longer revert settings (pre-buffer etc.); changes made right before a reload are kept.
- Precise sliders: − / + buttons on every settings slider.

## v1.14.0
- Multi-device support: preferences, saved filters, subtitle look/delay and per-episode choices are kept on the server (`profile.json`) and shared by every device that opens the address.

## v1.13.x
- AI subtitles: repeat-loop cleanup, 3 s overlap at chunk edges, damaged-AAC retries, language detection, no translate on English audio, full audio window in AI mode.
- Elapsed timer stops when a task finishes; Quick and AI subtitles both stay in the subtitle list.
- Fixed doubled toggle knobs and truncated dropdowns in settings.

## v1.12
- ASS positioned subtitles (karaoke), readable subtitle names with SRT/VTT export, Quick vs AI modes, wake lock.
