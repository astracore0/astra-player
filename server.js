'use strict';

const express = require('express');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const { spawn, execFile } = require('child_process');

const app = express();
const PORT = parseInt(process.env.PORT, 10) || 3000;
const HOST = process.env.HOST || '0.0.0.0';

app.disable('x-powered-by');
app.use(express.json({ limit: '1mb' }));

/* ------------------------------------------------------------------ */
/* Logging (console + app.log, trimmed on start so it never balloons)  */
/* ------------------------------------------------------------------ */
const LOG_FILE = path.join(__dirname, 'app.log');
const MAX_LOG_BYTES = 512 * 1024;

function timestamp() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function log(tag, msg) {
  const line = `[${timestamp()}] [${tag}] ${msg}`;
  if (tag === 'ERROR') console.error(line); else console.log(line);
  fs.appendFile(LOG_FILE, line + '\n', () => {});
}

try {
  const st = fs.statSync(LOG_FILE);
  if (st.size > MAX_LOG_BYTES) {
    const tail = fs.readFileSync(LOG_FILE, 'utf-8').split('\n').slice(-500).join('\n');
    fs.writeFileSync(LOG_FILE, tail, 'utf-8');
  }
} catch (e) {}

/* ------------------------------------------------------------------ */
/* Config / storage root                                               */
/* ------------------------------------------------------------------ */
function isDir(p) {
  try { return fs.statSync(p).isDirectory(); } catch (e) { return false; }
}

const CONFIG_FILE = path.join(__dirname, 'config.json');
let savedConfig = {};
try {
  if (fs.existsSync(CONFIG_FILE)) {
    savedConfig = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8')) || {};
  }
} catch (e) {
  log('ERROR', `config.json unreadable, using defaults (${e.message})`);
}

const STORAGE_SHARED = path.join(os.homedir(), 'storage', 'shared');
const ROOT_CANDIDATES = [
  path.join(STORAGE_SHARED, 'anime'),
  path.join(STORAGE_SHARED, 'Anime'),
  '/sdcard/anime',
  '/sdcard/Anime',
  '/sdcard/.anime',
  '/sdcard'
];
const DEFAULT_ROOT = ROOT_CANDIDATES.find(isDir) || STORAGE_SHARED;

let MEDIA_ROOT = (savedConfig.mediaRoot && isDir(savedConfig.mediaRoot))
  ? savedConfig.mediaRoot
  : DEFAULT_ROOT;

const SUBTITLES_DIR = path.join(__dirname, 'subtitles');
const CACHE_DIR = path.join(__dirname, 'cache');
for (const dir of [SUBTITLES_DIR, CACHE_DIR]) {
  try { fs.mkdirSync(dir, { recursive: true }); } catch (e) {}
}

app.use(express.static(path.join(__dirname, 'public')));
app.use('/subs_static', express.static(SUBTITLES_DIR));

const JUNK_FOLDERS = ['whatsapp', 'instagram', 'telegram', 'android', 'cache', 'facebook', 'lost.dir', '.thumbnails'];
const VIDEO_EXTS = ['.mp4', '.mkv', '.webm', '.avi', '.mov', '.ts', '.m4v'];
const SUB_EXTS = ['.srt', '.vtt', '.ass', '.ssa'];
const BITMAP_SUB_CODECS = ['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'xsub'];
const MAX_SCAN_DEPTH = 10;

const collator = new Intl.Collator(undefined, { numeric: true, sensitivity: 'base' });
const byName = (a, b) => collator.compare(a.name, b.name);

/* Resolve a client supplied path, allowing only the given extensions.
   Stops the API being used to read arbitrary files (keys, configs, ...). */
function resolveFile(input, allowedExts) {
  if (typeof input !== 'string' || !input || input.includes('\0')) {
    return { status: 400, error: 'No file requested' };
  }
  const full = path.resolve(path.isAbsolute(input) ? input : path.join(MEDIA_ROOT, input));
  if (!allowedExts.includes(path.extname(full).toLowerCase())) {
    return { status: 403, error: 'Unsupported file type' };
  }
  let st;
  try { st = fs.statSync(full); } catch (e) { return { status: 404, error: 'Not found' }; }
  if (!st.isFile()) return { status: 404, error: 'Not found' };
  return { path: full, stat: st };
}

/* ------------------------------------------------------------------ */
/* Cache quota (extracted subtitles live here)                         */
/* ------------------------------------------------------------------ */
const MAX_CACHE_BYTES = 200 * 1024 * 1024;
function enforceCacheQuota(dir = CACHE_DIR, maxBytes = MAX_CACHE_BYTES) {
  try {
    const files = fs.readdirSync(dir).map((f) => {
      const p = path.join(dir, f);
      const stat = fs.statSync(p);
      return { path: p, size: stat.size, mtime: stat.mtimeMs };
    });
    let totalSize = files.reduce((acc, f) => acc + f.size, 0);
    if (totalSize > maxBytes) {
      files.sort((a, b) => a.mtime - b.mtime);
      while (totalSize > maxBytes * 0.7 && files.length > 0) {
        const oldest = files.shift();
        try {
          fs.unlinkSync(oldest.path);
          totalSize -= oldest.size;
        } catch (e) {}
      }
    }
  } catch (e) {}
}

/* ------------------------------------------------------------------ */
/* Library scanning                                                    */
/* ------------------------------------------------------------------ */
function scanCleanStorage(dirPath, relativeDir = '', depth = 0) {
  const results = {};
  if (depth > MAX_SCAN_DEPTH) return results;
  let items;
  try {
    items = fs.readdirSync(dirPath, { withFileTypes: true });
  } catch (err) {
    return results;
  }

  for (const item of items) {
    const lower = item.name.toLowerCase();
    const fullPath = path.join(dirPath, item.name);
    const relPath = path.join(relativeDir, item.name);

    if (item.isDirectory()) {
      if (JUNK_FOLDERS.some((junk) => lower === junk || lower.startsWith(junk))) continue;
      Object.assign(results, scanCleanStorage(fullPath, relPath, depth + 1));
    } else if (item.isFile()) {
      if (item.name.startsWith('._')) continue;
      const ext = path.extname(item.name).toLowerCase();
      if (!VIDEO_EXTS.includes(ext)) continue;

      const folderKey = relativeDir ? relativeDir.split(path.sep).join(' / ') : 'Anime Root';
      if (!results[folderKey]) results[folderKey] = [];
      let sizeStr = '0 MB';
      try {
        sizeStr = (fs.statSync(fullPath).size / (1024 * 1024)).toFixed(1) + ' MB';
      } catch (e) {}

      results[folderKey].push({
        name: item.name,
        relPath: relPath.split(path.sep).join('/'),
        fullPath,
        size: sizeStr
      });
    }
  }

  if (depth === 0) {
    // Natural order (Episode 2 before Episode 10); readdir order is arbitrary on Android.
    const sorted = {};
    Object.keys(results).sort((a, b) => collator.compare(a, b)).forEach((k) => {
      sorted[k] = results[k].sort(byName);
    });
    return sorted;
  }
  return results;
}

let libCache = null;
const LIB_TTL_MS = 30 * 1000;
function getLibrary(force = false) {
  if (!force && libCache && libCache.root === MEDIA_ROOT && Date.now() - libCache.at < LIB_TTL_MS) {
    return libCache.data;
  }
  const data = scanCleanStorage(MEDIA_ROOT);
  libCache = { root: MEDIA_ROOT, at: Date.now(), data };
  return data;
}

app.get('/api/library', (req, res) => {
  res.json({ root: MEDIA_ROOT, library: getLibrary(req.query.refresh === '1') });
});

app.get('/api/storage/explore', (req, res) => {
  const requested = typeof req.query.dir === 'string' ? req.query.dir : '';
  const safeDir = (requested && isDir(requested)) ? path.resolve(requested) : MEDIA_ROOT;

  try {
    const items = fs.readdirSync(safeDir, { withFileTypes: true });
    const folders = [];
    const files = [];

    items.forEach((it) => {
      const full = path.join(safeDir, it.name);
      if (it.isDirectory()) {
        folders.push({ name: it.name, fullPath: full });
      } else if (it.isFile()) {
        const ext = path.extname(it.name).toLowerCase();
        const isVideo = VIDEO_EXTS.includes(ext);
        const isSub = SUB_EXTS.includes(ext);
        if (isVideo || isSub) {
          files.push({
            name: it.name,
            fullPath: full,
            type: isVideo ? 'video' : 'sub',
            relPath: path.relative(MEDIA_ROOT, full).split(path.sep).join('/')
          });
        }
      }
    });

    folders.sort(byName);
    files.sort(byName);

    res.json({
      current: safeDir,
      parent: path.dirname(safeDir),
      folders,
      files
    });
  } catch (e) {
    res.status(500).json({ error: 'Cannot read folder' });
  }
});

app.post('/api/settings/root', (req, res) => {
  const newPath = (req.body || {}).newPath;
  if (typeof newPath !== 'string' || !newPath || !isDir(newPath)) {
    return res.status(400).json({ success: false, message: 'Directory does not exist' });
  }
  MEDIA_ROOT = path.resolve(newPath);
  libCache = null;
  savedConfig.mediaRoot = MEDIA_ROOT;
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(savedConfig, null, 2), 'utf-8');
  } catch (e) {
    log('ERROR', `Could not save config.json (${e.message})`);
  }
  log('STORAGE', `Root target set to: ${MEDIA_ROOT}`);
  res.json({ success: true, root: MEDIA_ROOT, library: getLibrary(true) });
});

/* ------------------------------------------------------------------ */
/* Metadata (ffprobe)                                                  */
/* ------------------------------------------------------------------ */
app.get('/api/video/metadata', (req, res) => {
  const r = resolveFile(req.query.file, VIDEO_EXTS);
  if (r.error) return res.status(r.status).json({ error: r.error });

  const args = ['-v', 'quiet', '-print_format', 'json', '-show_streams', '-show_format', r.path];
  execFile('ffprobe', args, { maxBuffer: 16 * 1024 * 1024, timeout: 30000 }, (err, stdout) => {
    if (err) {
      return res.json({
        audioTracks: [{ streamIndex: '0:a:0', title: 'Default Audio', lang: 'und', codec: 'aac' }],
        subtitleTracks: [],
        is10BitHevc: false,
        duration: 0
      });
    }
    try {
      const info = JSON.parse(stdout);
      const audioTracks = [];
      const subtitleTracks = [];
      let is10BitHevc = false;
      let duration = parseFloat(info.format && info.format.duration) || 0;

      (info.streams || []).forEach((s) => {
        const tags = s.tags || {};
        const lang = (tags.language || tags.LANGUAGE || 'und').toLowerCase();
        let title = tags.title || tags.TITLE || '';

        if (s.codec_type === 'video') {
          if (s.disposition && s.disposition.attached_pic) return; // cover art
          if (!duration && s.duration) duration = parseFloat(s.duration) || 0;
          const pix = s.pix_fmt || '';
          if (pix.includes('10le') || pix.includes('10be') || pix.includes('yuv420p10')) {
            is10BitHevc = true;
          }
        } else if (s.codec_type === 'audio') {
          if (!title) {
            title = lang !== 'und' ? `${lang.toUpperCase()} Audio` : `Audio #${s.index}`;
          } else if (lang !== 'und' && !title.toLowerCase().includes(lang)) {
            title = `${title} (${lang.toUpperCase()})`;
          }
          audioTracks.push({ streamIndex: `0:${s.index}`, title, lang, codec: s.codec_name || 'aac' });
        } else if (s.codec_type === 'subtitle') {
          // Picture based subtitles (PGS/VobSub) cannot be converted to WebVTT.
          if (BITMAP_SUB_CODECS.includes(s.codec_name)) return;
          if (!title) {
            title = lang !== 'und' ? `${lang.toUpperCase()} Sub` : `Sub #${s.index}`;
          } else if (lang !== 'und' && !title.toLowerCase().includes(lang)) {
            title = `${title} (${lang.toUpperCase()})`;
          }
          subtitleTracks.push({ streamIndex: s.index, title, lang, codec: s.codec_name || 'vtt' });
        }
      });

      res.json({ audioTracks, subtitleTracks, is10BitHevc, duration });
      prefetchSubtitles(r, subtitleTracks); // background, instant subtitles later
    } catch (e) {
      res.json({ audioTracks: [], subtitleTracks: [], is10BitHevc: false, duration: 0 });
    }
  });
});

/* ------------------------------------------------------------------ */
/* Subtitles                                                           */
/* ------------------------------------------------------------------ */
function cleanAndDedupeVTT(rawVtt) {
  const lines = String(rawVtt).replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const result = ['WEBVTT', ''];
  const seenCues = new Set();
  let cue = null;

  const pushCue = () => {
    if (!cue) return;
    const text = cue.text.trim();
    if (text) {
      const key = `${cue.time}_${text}`;
      if (!seenCues.has(key)) {
        seenCues.add(key);
        result.push(cue.time, text, '');
      }
    }
    cue = null;
  };

  for (const rawLine of lines) {
    const line = rawLine.trim();
    if (!line) { pushCue(); continue; }           // blank line ends a cue
    if (line.includes('-->')) {                   // timing line starts a cue
      pushCue();
      cue = { time: line, text: '' };
      continue;
    }
    if (!cue) continue;                           // header, cue id, NOTE/STYLE blocks

    const cleanText = line
      .replace(/\{\\an8\}/gi, '<position:top>')
      .replace(/\{\\an[1-9]\}/gi, '')
      .replace(/\{[^}]*\}/g, '')
      .replace(/\\[Nn]/g, ' ')
      .replace(/\\h/g, ' ')
      .trim();

    if (cleanText) cue.text += (cue.text ? ' ' : '') + cleanText;
  }
  pushCue();

  return result.join('\n');
}

/* Runs ffmpeg and returns WebVTT text. Output is collected as Buffers so
   multi-byte characters (Hindi, Japanese, ...) are never split mid-character,
   and stderr is drained so ffmpeg can never block on a full pipe. */
function ffmpegToVtt(inputArgs, onDone, format = 'webvtt') {
  let finished = false;
  const finish = (err, vtt) => {
    if (finished) return;
    finished = true;
    onDone(err, vtt);
  };

  const outArgs = format === 'ass' ? ['-c:s', 'ass', '-f', 'ass', '-'] : ['-f', 'webvtt', '-'];
  const proc = spawn('ffmpeg', ['-v', 'error', '-nostdin', ...inputArgs, ...outArgs], {
    stdio: ['ignore', 'pipe', 'pipe']
  });
  const out = [];
  proc.stdout.on('data', (c) => out.push(c));
  proc.stderr.on('data', () => {});
  proc.on('error', (e) => finish(e));
  proc.on('close', (code) => {
    const text = Buffer.concat(out).toString('utf8');
    if (!text.trim()) finish(new Error(`ffmpeg exited with code ${code}`));
    else finish(null, text);
  });
  return proc;
}

/* ffmpeg's own WebVTT output drops ASS/SRT alignment tags ({\an8}), so top-positioned lines
   (signs, second speaker) would pile up at the bottom. Extracting as ASS and converting here
   keeps the position (as the <position:top> marker the player understands), italics and bold. */
function assTimeToVtt(t) {
  const m = /^(\d+):(\d{2}):(\d{2})[.,](\d{1,3})/.exec(String(t).trim());
  if (!m) return null;
  return `${m[1].padStart(2, '0')}:${m[2]}:${m[3]}.${m[4].padEnd(3, '0')}`;
}

function assToVtt(raw) {
  const lines = String(raw).replace(/^\uFEFF/, '').split(/\r\n|\r|\n/);
  const styleTop = new Map();
  let section = '';
  let styleFmt = [];
  let evFmt = [];
  const cues = [];

  for (const line of lines) {
    const sec = /^\[(.+)\]\s*$/.exec(line.trim());
    if (sec) { section = sec[1].toLowerCase(); continue; }

    if (section.includes('styles')) {
      if (/^format:/i.test(line)) {
        styleFmt = line.slice(7).split(',').map((x) => x.trim().toLowerCase());
      } else if (/^style:/i.test(line) && styleFmt.length) {
        const f = line.slice(6).split(',');
        const name = (f[styleFmt.indexOf('name')] || '').trim();
        const align = parseInt(f[styleFmt.indexOf('alignment')], 10);
        if (name) styleTop.set(name, align >= 7 && align <= 9);
      }
    } else if (section === 'events') {
      if (/^format:/i.test(line)) {
        evFmt = line.slice(7).split(',').map((x) => x.trim().toLowerCase());
      } else if (/^dialogue:/i.test(line) && evFmt.length) {
        const parts = line.slice(9).split(',');
        const textIdx = evFmt.indexOf('text');
        if (textIdx === -1 || parts.length <= textIdx) continue;
        const text = parts.slice(textIdx).join(',');
        const start = assTimeToVtt(parts[evFmt.indexOf('start')]);
        const end = assTimeToVtt(parts[evFmt.indexOf('end')]);
        if (!start || !end || /\{[^}]*\\p[1-9]/.test(text)) continue; // skip vector drawings

        const styleName = (parts[evFmt.indexOf('style')] || '').trim().replace(/^\*/, '');
        const anMatch = /\{[^}]*\\an([1-9])/.exec(text);
        const top = anMatch ? Number(anMatch[1]) >= 7 : !!styleTop.get(styleName);

        const clean = text
          .replace(/\{[^}]*\\i1[^}]*\}/g, '<i>')
          .replace(/\{[^}]*\\i0[^}]*\}/g, '</i>')
          .replace(/\{[^}]*\\b1[^}]*\}/g, '<b>')
          .replace(/\{[^}]*\\b0[^}]*\}/g, '</b>')
          .replace(/\{[^}]*\\u1[^}]*\}/g, '<u>')
          .replace(/\{[^}]*\\u0[^}]*\}/g, '</u>')
          .replace(/\{[^}]*\}/g, '')
          .replace(/\\[Nn]/g, ' ')
          .replace(/\\h/g, ' ')
          .replace(/\s+/g, ' ')
          .trim();
        if (clean) cues.push({ start, end, text: (top ? '<position:top>' : '') + clean });
      }
    }
  }

  cues.sort((a, b) => (a.start < b.start ? -1 : a.start > b.start ? 1 : 0));
  return 'WEBVTT\n\n' + cues.map((c) => `${c.start} --> ${c.end}\n${c.text}\n`).join('\n');
}

// Prefer the ASS route (keeps positioning); fall back to ffmpeg's plain WebVTT conversion.
function extractSubtitleVtt(inputArgs, onDone) {
  ffmpegToVtt(inputArgs, (err, raw) => {
    if (!err) {
      const vtt = assToVtt(raw);
      if (vtt.includes('-->')) return onDone(null, vtt);
    }
    ffmpegToVtt(inputArgs, onDone, 'webvtt');
  }, 'ass');
}

function sendVtt(res, vtt) {
  res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
  res.send(vtt);
}

/* Extracted subtitle tracks are cached in subtitles/ (keyed by path + size + mtime + track,
   so different episodes can never share a cache entry). Concurrent requests for the same
   track share one ffmpeg run. */
const SUB_CACHE_MAX_BYTES = 50 * 1024 * 1024;
const subInFlight = new Map();

function subCacheFile(r, trackIndex) {
  const key = crypto.createHash('sha1')
    .update(`${r.path}|${r.stat.size}|${r.stat.mtimeMs}|${trackIndex}`)
    .digest('hex');
  return path.join(SUBTITLES_DIR, `${key}.vtt`);
}

function readCachedSub(cacheFile) {
  try {
    const st = fs.statSync(cacheFile);
    if (st.size <= 20) return null;
    const text = fs.readFileSync(cacheFile, 'utf-8');
    const now = new Date();
    fs.utimes(cacheFile, now, now, () => {});
    return text;
  } catch (e) { return null; }
}

function getSubtitleVtt(r, trackIndex, cb) {
  const cacheFile = subCacheFile(r, trackIndex);
  const cached = readCachedSub(cacheFile);
  if (cached) return cb(null, cached);

  if (subInFlight.has(cacheFile)) { subInFlight.get(cacheFile).push(cb); return; }
  const waiters = [cb];
  subInFlight.set(cacheFile, waiters);

  extractSubtitleVtt(['-i', r.path, '-map', `0:${trackIndex}`], (err, raw) => {
    subInFlight.delete(cacheFile);
    let vtt = null;
    if (!err) {
      vtt = cleanAndDedupeVTT(raw);
      fs.writeFile(cacheFile, vtt, 'utf-8', () => enforceCacheQuota(SUBTITLES_DIR, SUB_CACHE_MAX_BYTES));
    } else {
      log('ERROR', `Subtitle extraction failed (${path.basename(r.path)} track ${trackIndex}): ${err.message}`);
    }
    waiters.forEach((w) => w(err, vtt));
  });
}

// Background pre-extraction: one track at a time, and never while a transcode needs the CPU,
// so tapping a subtitle track is instant without hammering a phone.
const prefetchQueue = [];
let prefetchRunning = false;

function prefetchSubtitles(r, tracks) {
  (tracks || []).forEach((t) => {
    if (!readCachedSub(subCacheFile(r, t.streamIndex))) {
      prefetchQueue.push({ r, trackIndex: t.streamIndex });
    }
  });
  runPrefetch();
}

function runPrefetch() {
  if (prefetchRunning || prefetchQueue.length === 0) return;
  if (transcodeIsLive()) { setTimeout(runPrefetch, 5000).unref(); return; }
  prefetchRunning = true;
  const job = prefetchQueue.shift();
  getSubtitleVtt(job.r, job.trackIndex, () => {
    prefetchRunning = false;
    setTimeout(runPrefetch, 300).unref();
  });
}

app.get('/api/subs/stream', (req, res) => {
  const { file, trackIndex } = req.query;
  if (!file || trackIndex === undefined) return res.status(400).send('Missing parameters');
  if (!/^\d+$/.test(String(trackIndex))) return res.status(400).send('Bad track index');
  const r = resolveFile(file, VIDEO_EXTS);
  if (r.error) return res.status(r.status).send(r.error);

  res.setHeader('Access-Control-Allow-Origin', '*');
  getSubtitleVtt(r, trackIndex, (err, vtt) => {
    if (err) {
      if (!res.headersSent) res.status(500).send('Subtitle extraction failed');
      return;
    }
    if (!res.headersSent) sendVtt(res, vtt);
  });
});

app.get('/api/subs/file', (req, res) => {
  const r = resolveFile(req.query.path, SUB_EXTS);
  if (r.error) return res.status(r.status).send(r.error);

  if (path.extname(r.path).toLowerCase() === '.vtt') {
    return fs.readFile(r.path, 'utf-8', (err, data) => {
      if (err) return res.status(500).send('Cannot read subtitle');
      sendVtt(res, cleanAndDedupeVTT(data));
    });
  }

  extractSubtitleVtt(['-i', r.path], (err, raw) => {
    if (err) {
      log('ERROR', `Subtitle conversion failed (${path.basename(r.path)}): ${err.message}`);
      if (!res.headersSent) res.status(500).send('Subtitle conversion failed');
      return;
    }
    if (!res.headersSent) sendVtt(res, cleanAndDedupeVTT(raw));
  });
});

/* ------------------------------------------------------------------ */
/* Transcoding                                                         */
/* ------------------------------------------------------------------ */
let activeTranscodeProc = null;
let isTranscodeFrozen = false;
let frozenSince = 0;

function killTranscode() {
  if (activeTranscodeProc) {
    try { activeTranscodeProc.kill('SIGKILL'); } catch (e) {}
  }
  activeTranscodeProc = null;
  isTranscodeFrozen = false;
}

function transcodeIsLive() {
  // NB: ChildProcess.killed turns true after ANY kill() (even SIGSTOP), so it can't be used here.
  return !!activeTranscodeProc && activeTranscodeProc.exitCode === null && activeTranscodeProc.signalCode === null;
}

app.post('/api/stream/pause', (req, res) => {
  if (transcodeIsLive() && !isTranscodeFrozen) {
    try {
      activeTranscodeProc.kill('SIGSTOP');
      isTranscodeFrozen = true;
      frozenSince = Date.now();
    } catch (e) {}
  }
  res.json({ status: 'paused' });
});

app.post('/api/stream/resume', (req, res) => {
  if (transcodeIsLive() && isTranscodeFrozen) {
    try {
      activeTranscodeProc.kill('SIGCONT');
      isTranscodeFrozen = false;
    } catch (e) {}
  }
  res.json({ status: 'resumed' });
});

/* Copy-mode video can only start on a keyframe. Starting audio at the exact time but video at an
   earlier keyframe makes them drift apart, so find the keyframe at/before t and start BOTH there. */
app.get('/api/video/keyframe', (req, res) => {
  const r = resolveFile(req.query.file, VIDEO_EXTS);
  if (r.error) return res.status(r.status).json({ error: r.error });
  const t = Math.max(0, parseFloat(req.query.t) || 0);
  if (t === 0) return res.json({ time: 0 });

  const probe = (windowSec, cb) => {
    const from = Math.max(0, t - windowSec);
    execFile('ffprobe', ['-v', 'error', '-select_streams', 'v:0', '-skip_frame', 'nokey',
      '-show_entries', 'frame=pts_time,pkt_pts_time', '-of', 'csv=p=0',
      '-read_intervals', `${from}%${t + 0.05}`, r.path],
    { maxBuffer: 4 * 1024 * 1024, timeout: 20000 }, (err, out) => {
      const times = String(out || '').split('\n')
        .map((l) => parseFloat(l.split(',').find((x) => x !== '' && !isNaN(parseFloat(x)))))
        .filter((x) => Number.isFinite(x) && x <= t + 0.05);
      cb(times.length ? Math.max(...times) : null);
    });
  };
  probe(60, (k) => {
    if (k !== null) return res.json({ time: k });
    probe(600, (k2) => res.json({ time: k2 !== null ? k2 : 0 }));
  });
});

// Robust Transcoder: handles Opus, AAC, FLAC, AC3 without audio pipe freeze
app.get('/stream/transcode', (req, res) => {
  const r = resolveFile(req.query.file, VIDEO_EXTS);
  if (r.error) return res.status(r.status).send(r.error);

  const audioTrack = String(req.query.audioTrack || '0:a:0');
  if (!/^0:(a:)?\d+$/.test(audioTrack)) return res.status(400).send('Bad audio track');
  const is10Bit = req.query.is10Bit === '1';
  const seekSec = Math.max(0, parseFloat(req.query.startTime) || 0);

  killTranscode();
  enforceCacheQuota();

  const ffmpegArgs = ['-v', 'error', '-nostdin', '-threads', '2'];
  if (seekSec > 0) ffmpegArgs.push('-ss', seekSec.toString());

  ffmpegArgs.push('-i', r.path, '-map', '0:v:0', '-map', audioTrack);

  if (is10Bit) {
    ffmpegArgs.push(
      '-vf', 'scale=-2:min(ih\\,720)',
      '-c:v', 'libx264',
      '-pix_fmt', 'yuv420p',
      '-preset', 'ultrafast',
      '-tune', 'zerolatency',
      '-crf', '28',
      '-g', '30'
    );
  } else {
    ffmpegArgs.push('-c:v', 'copy', '-avoid_negative_ts', 'make_zero');
  }

  // Universal Audio Resample to AAC stereo with safe timestamps (fixes Opus/AC3 stall)
  ffmpegArgs.push(
    '-c:a', 'aac',
    '-b:a', '128k',
    '-ac', '2',
    '-ar', '44100',
    '-max_muxing_queue_size', '1024',
    '-f', 'mp4',
    '-movflags', 'frag_keyframe+empty_moov+default_base_moof',
    '-'
  );

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });

  // stderr MUST be drained: an unread pipe fills up (~64 KB) and freezes ffmpeg.
  const ffmpeg = spawn('ffmpeg', ffmpegArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
  activeTranscodeProc = ffmpeg;
  isTranscodeFrozen = false;

  let errTail = '';
  ffmpeg.stderr.on('data', (c) => { errTail = (errTail + c.toString()).slice(-600); });
  ffmpeg.stdout.on('error', () => {});
  res.on('error', () => {});

  ffmpeg.stdout.pipe(res);

  ffmpeg.on('error', (e) => {
    log('ERROR', `ffmpeg failed to start: ${e.message}`);
    res.end();
  });
  ffmpeg.on('close', (code, signal) => {
    if (code && !signal && errTail.trim()) {
      log('ERROR', `ffmpeg exited ${code} (${path.basename(r.path)}): ${errTail.trim().split('\n').pop()}`);
    }
    if (ffmpeg === activeTranscodeProc) {
      activeTranscodeProc = null;
      isTranscodeFrozen = false;
    }
  });

  // Client went away: keep the process briefly (a seek may reconnect), then reap it.
  // A paused (frozen) stream is kept longer, but never forever.
  res.on('close', () => {
    if (res.writableFinished) return;
    const reap = () => {
      if (ffmpeg !== activeTranscodeProc) return;
      if (isTranscodeFrozen && Date.now() - frozenSince < 10 * 60 * 1000) {
        setTimeout(reap, 60 * 1000);
        return;
      }
      killTranscode();
    };
    setTimeout(reap, 12000);
  });
});

/* ------------------------------------------------------------------ */
/* Direct streaming (HTTP 206)                                         */
/* ------------------------------------------------------------------ */
const CONTENT_TYPES = {
  '.mp4': 'video/mp4',
  '.m4v': 'video/mp4',
  '.mov': 'video/quicktime',
  '.webm': 'video/webm',
  '.mkv': 'video/webm',
  '.ts': 'video/mp2t',
  '.avi': 'video/x-msvideo'
};

app.get('/stream', (req, res) => {
  const r = resolveFile(req.query.file, VIDEO_EXTS);
  if (r.error) return res.status(r.status).send(r.error);

  const fileSize = r.stat.size;
  const contentType = CONTENT_TYPES[path.extname(r.path).toLowerCase()] || 'video/mp4';
  const CHUNK_SIZE = 1024 * 1024 * 4;
  const range = req.headers.range;

  const pipeFile = (opts) => {
    const stream = fs.createReadStream(r.path, opts);
    stream.on('error', () => res.destroy());
    res.on('close', () => stream.destroy());
    stream.pipe(res);
  };

  if (range) {
    const m = /^bytes=(\d*)-(\d*)$/.exec(range.trim());
    if (!m || (m[1] === '' && m[2] === '')) {
      return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
    }

    let start;
    let end;
    if (m[1] === '') {                              // suffix range: last N bytes
      start = Math.max(0, fileSize - parseInt(m[2], 10));
      end = fileSize - 1;
    } else {
      start = parseInt(m[1], 10);
      end = m[2]
        ? Math.min(parseInt(m[2], 10), fileSize - 1)
        : Math.min(start + CHUNK_SIZE - 1, fileSize - 1);
    }

    if (start >= fileSize || start > end) {
      return res.status(416).set('Content-Range', `bytes */${fileSize}`).end();
    }

    res.writeHead(206, {
      'Content-Range': `bytes ${start}-${end}/${fileSize}`,
      'Accept-Ranges': 'bytes',
      'Content-Length': end - start + 1,
      'Content-Type': contentType
    });
    pipeFile({ start, end });
  } else {
    res.writeHead(200, {
      'Content-Length': fileSize,
      'Accept-Ranges': 'bytes',
      'Content-Type': contentType
    });
    pipeFile({});
  }
});

/* ------------------------------------------------------------------ */
/* System telemetry                                                    */
/* ------------------------------------------------------------------ */
let prevProcCpuTime = process.cpuUsage();
let prevProcHrTime = process.hrtime.bigint();
let lastCalculatedCpu = 5;
const numCores = (() => { try { return os.cpus().length || 1; } catch (e) { return 1; } })();

function updateProcCpu() {
  const curCpu = process.cpuUsage(prevProcCpuTime);
  const curHr = process.hrtime.bigint();
  const elapsedMicroseconds = Number(curHr - prevProcHrTime) / 1000;

  if (elapsedMicroseconds > 0) {
    const totalCpuTime = curCpu.user + curCpu.system;
    const pct = Math.round((totalCpuTime / elapsedMicroseconds) * 100 / numCores);
    lastCalculatedCpu = Math.max(1, Math.min(100, pct));
  }
  prevProcCpuTime = process.cpuUsage();
  prevProcHrTime = curHr;
}
setInterval(updateProcCpu, 500).unref();

app.get('/api/system/status', (req, res) => {
  const mem = process.memoryUsage();
  const totalMem = os.totalmem();
  const freeMem = os.freemem();
  res.json({
    uptime: Math.floor(process.uptime()),
    ramUsedMB: (mem.rss / (1024 * 1024)).toFixed(1),
    heapUsedMB: (mem.heapUsed / (1024 * 1024)).toFixed(1),
    totalSysMemMB: (totalMem / (1024 * 1024)).toFixed(0),
    usedSysMemMB: ((totalMem - freeMem) / (1024 * 1024)).toFixed(0),
    cpuPercent: lastCalculatedCpu
  });
});

/* ------------------------------------------------------------------ */
/* Watch history (kept in memory, written atomically)                  */
/* ------------------------------------------------------------------ */
const HISTORY_FILE = path.join(__dirname, 'history.json');
const MAX_HISTORY_ENTRIES = 300;

let historyData = {};
try {
  if (fs.existsSync(HISTORY_FILE)) {
    historyData = JSON.parse(fs.readFileSync(HISTORY_FILE, 'utf-8')) || {};
  } else {
    fs.writeFileSync(HISTORY_FILE, JSON.stringify({}), 'utf-8');
  }
} catch (e) {
  log('ERROR', `history.json unreadable, starting empty (${e.message})`);
  historyData = {};
}

let historyWriting = false;
let historyDirty = false;
function persistHistory() {
  historyDirty = true;
  if (historyWriting) return;
  historyWriting = true;
  historyDirty = false;
  const tmp = HISTORY_FILE + '.tmp';
  fs.writeFile(tmp, JSON.stringify(historyData, null, 2), 'utf-8', (err) => {
    const done = () => {
      historyWriting = false;
      if (historyDirty) persistHistory();
    };
    if (err) { log('ERROR', `History save failed (${err.message})`); return done(); }
    fs.rename(tmp, HISTORY_FILE, (renameErr) => {
      if (renameErr) log('ERROR', `History save failed (${renameErr.message})`);
      done();
    });
  });
}

app.get('/api/history', (req, res) => {
  res.json(historyData);
});

app.post('/api/history', (req, res) => {
  const { relPath, name, time, dur } = req.body || {};
  if (!name && !relPath) return res.status(400).send('Missing payload');

  const key = String(relPath || name).slice(0, 1024);
  const t = Number.isFinite(Number(time)) ? Math.max(0, Number(time)) : 0;
  const d = Number.isFinite(Number(dur)) && Number(dur) > 0 ? Number(dur) : 0;
  const percent = d > 0 ? Math.max(0, Math.min(100, Math.floor((t / d) * 100))) : 0;

  historyData[key] = {
    name: String(name || path.basename(key)).slice(0, 512),
    relPath: key,
    time: Math.floor(t),
    dur: Math.floor(d),
    percent,
    updated: Date.now()
  };

  const keys = Object.keys(historyData);
  if (keys.length > MAX_HISTORY_ENTRIES) {
    keys.sort((a, b) => (historyData[b].updated || 0) - (historyData[a].updated || 0))
      .slice(MAX_HISTORY_ENTRIES)
      .forEach((k) => { delete historyData[k]; });
  }

  persistHistory();
  res.json({ status: 'saved' });
});

app.post('/api/history/clear', (req, res) => {
  historyData = {};
  persistHistory();
  res.json({ status: 'cleared' });
});

/* ------------------------------------------------------------------ */
/* Lifecycle                                                           */
/* ------------------------------------------------------------------ */
function shutdown() {
  killTranscode();
  process.exit(0);
}
process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
process.on('exit', killTranscode);
process.on('uncaughtException', (e) => log('ERROR', `Uncaught exception: ${e && e.stack ? e.stack : e}`));
process.on('unhandledRejection', (e) => log('ERROR', `Unhandled rejection: ${e && e.stack ? e.stack : e}`));

const server = app.listen(PORT, HOST, () => {
  log('SYSTEM', `Astra Pro Engine listening on ${PORT}`);
  log('STORAGE', `Root target set to: ${MEDIA_ROOT}`);
});
server.on('error', (e) => {
  log('ERROR', e.code === 'EADDRINUSE'
    ? `Port ${PORT} is already in use. Stop the other instance or start with PORT=<number>.`
    : `Server error: ${e.message}`);
  process.exit(1);
});
