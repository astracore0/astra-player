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

  markInteractive(15000);
  const args = ['-v', 'quiet', '-analyzeduration', '5000000', '-probesize', '5000000', '-print_format', 'json', '-show_streams', '-show_format', '-show_chapters', r.path];
  execFile('ffprobe', args, { maxBuffer: 16 * 1024 * 1024, timeout: 30000 }, (err, stdout) => {
    if (err) {
      return res.json({
        audioTracks: [{ streamIndex: '0:a:0', title: 'Default Audio', lang: 'und', codec: 'aac' }],
        subtitleTracks: [],
        is10BitHevc: false,
        duration: 0,
        chapters: []
      });
    }
    try {
      const info = JSON.parse(stdout);
      const audioTracks = [];
      const subtitleTracks = [];
      let is10BitHevc = false;
      let duration = parseFloat(info.format && info.format.duration) || 0;
      const chapters = (info.chapters || []).map((c, i) => ({
        start: parseFloat(c.start_time) || 0,
        end: parseFloat(c.end_time) || 0,
        title: String((c.tags && (c.tags.title || c.tags.TITLE)) || `Chapter ${i + 1}`).slice(0, 80)
      })).filter((c) => c.end > c.start);

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

      res.json({ audioTracks, subtitleTracks, is10BitHevc, duration, chapters });
      prefetchSubtitles(r, subtitleTracks); // background, instant subtitles later
    } catch (e) {
      res.json({ audioTracks: [], subtitleTracks: [], is10BitHevc: false, duration: 0, chapters: [] });
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

/* ASS colour (&HAABBGGRR or &HBBGGRR&) -> 'rrggbb' */
function assColor(v) {
  const m = /&?H?([0-9a-f]{6,8})&?/i.exec(String(v || '').trim());
  if (!m) return '';
  const h = m[1].slice(-6);
  return h.slice(4, 6) + h.slice(2, 4) + h.slice(0, 2);
}

/* ---- ASS override-tag engine (v1.17): turns one Dialogue line into a compact JSON description
   that the player draws itself (positions, fades, moves, \t animation, karaoke, vector drawings). ---- */
const ASS_TAG_RE = /\\(?:(pos|move|org|fade|fad|clip|iclip)\(([^)]*)\)|(1c|2c|3c|4c|1a|2a|3a|4a|alpha|an|fscx|fscy|fsp|frz|frx|fry|fax|fay|fr|fs|fn|bord|xbord|ybord|shad|xshad|yshad|blur|be|kf|ko|kt|k|K|pbo|p|b|i|u|s|q|a|c|r|fe)([^\\}]*))/g;
const num = (v, d = 0) => { const n = parseFloat(v); return Number.isFinite(n) ? n : d; };
const alphaOf = (v) => { const m = /([0-9a-f]{2})/i.exec(String(v || '')); return m ? +(1 - parseInt(m[1], 16) / 255).toFixed(3) : 1; };

function assDrawing(src, scale) {
  const k = 1 / Math.pow(2, Math.max(1, scale) - 1);
  const tk = String(src).trim().split(/\s+/);
  let d = '', cmd = '', pts = [], cur = null, minX = 1e9, minY = 1e9, maxX = -1e9, maxY = -1e9;
  const P = (x, y) => { x *= k; y *= k; if (x < minX) minX = x; if (x > maxX) maxX = x; if (y < minY) minY = y; if (y > maxY) maxY = y; return [x, y]; };
  const f2 = (n) => +n.toFixed(2);
  const flush = () => {
    if (!pts.length) return;
    if (cmd === 'm' || cmd === 'n') { cur = pts[pts.length - 1]; d += `${d && cmd === 'm' ? 'Z ' : ''}M${f2(cur[0])} ${f2(cur[1])} `; }
    else if (cmd === 'l') { pts.forEach((p) => { d += `L${f2(p[0])} ${f2(p[1])} `; cur = p; }); }
    else if (cmd === 'b') { for (let i = 0; i + 2 < pts.length; i += 3) { d += `C${pts.slice(i, i + 3).map((p) => `${f2(p[0])} ${f2(p[1])}`).join(' ')} `; cur = pts[i + 2]; } }
    else if (cmd === 's' && cur) {
      const q = [cur, ...pts]; if (q.length >= 4) {
        for (let i = 0; i + 3 < q.length; i++) {
          const [a, b, c, e] = [q[i], q[i + 1], q[i + 2], q[i + 3]];
          for (let s = 1; s <= 6; s++) {
            const t = s / 6, t2 = t * t, t3 = t2 * t;
            const w0 = (1 - t) ** 3 / 6, w1 = (3 * t3 - 6 * t2 + 4) / 6, w2 = (-3 * t3 + 3 * t2 + 3 * t + 1) / 6, w3 = t3 / 6;
            d += `L${f2(w0 * a[0] + w1 * b[0] + w2 * c[0] + w3 * e[0])} ${f2(w0 * a[1] + w1 * b[1] + w2 * c[1] + w3 * e[1])} `;
          }
        }
      }
    }
    pts = [];
  };
  for (let i = 0; i < tk.length; i++) {
    const w = tk[i].toLowerCase();
    if (/^[mnlbspc]$/.test(w)) { flush(); cmd = w; continue; }
    if (/^-?[\d.]+$/.test(w) && /^-?[\d.]+$/.test(tk[i + 1] || '')) { pts.push(P(+w, +tk[i + 1])); i++; }
  }
  flush();
  if (!d || minX > maxX) return null;
  return { d: d.trim() + ' Z', x: f2(minX), y: f2(minY), w: f2(Math.max(0.5, maxX - minX)), h: f2(Math.max(0.5, maxY - minY)) };
}

/* returns null for a plain line (normal text rendering is fine) or {info, plain} for one that needs the engine */
function assCueInfo(text, st, ev, res, durMs) {
  const base = {
    fs: st.fs || 0, c1: st.c1 || 'ffffff', c2: st.c2 || '', c3: st.c3 || '000000', fn: st.fn || '',
    b: st.b ? 1 : 0, i: st.i ? 1 : 0, u: st.u ? 1 : 0, s: st.s ? 1 : 0,
    bord: st.bord == null ? 2 : st.bord, shad: st.shad || 0, blur: 0, sx: st.sx || 100, sy: st.sy || 100, frz: st.ang || 0, a: 1
  };
  let cur = { ...base };
  const g = { an: st.an || 2 };
  const tf = [];
  const runs = [];
  let special = false, drawing = null, pMode = 0, pbo = 0, kAcc = 0, kNext = null, kStarted = false;
  const diff = (c) => { const o = {}; for (const k of ['c1', 'fs', 'b', 'i', 'u', 's', 'fn', 'bord']) if (c[k] !== base[k]) o[k] = c[k]; return o; };
  const parts = text.split(/(\{[^}]*\})/);
  let first = true;

  for (const part of parts) {
    if (part.startsWith('{') && part.endsWith('}')) {
      const body = part.slice(1, -1);
      const apply = (o, tag, val) => {
        switch (tag) {
          case 'c': case '1c': o.c1 = assColor(val) || o.c1; break;
          case '2c': o.c2 = assColor(val) || o.c2; break;
          case '3c': o.c3 = assColor(val) || o.c3; break;
          case 'alpha': case '1a': o.a = alphaOf(val); break;
          case 'fs': o.fs = num(val, o.fs); break;
          case 'fscx': o.sx = num(val, 100); break;
          case 'fscy': o.sy = num(val, 100); break;
          case 'frz': case 'fr': o.frz = num(val); break;
          case 'bord': o.bord = num(val); break;
          case 'shad': o.shad = num(val); break;
          case 'blur': case 'be': o.blur = num(val); break;
          default: break;
        }
      };
      const noT = body.replace(/\\t\(((?:[^()]|\([^()]*\))*)\)/g, (m, inner) => {
        const a = inner.split(',');
        let t1 = 0, t2 = durMs, acc = 1, tags = inner;
        const nums = [];
        while (a.length && /^\s*-?[\d.]+\s*$/.test(a[0]) && nums.length < 3) nums.push(num(a.shift()));
        tags = a.join(',');
        if (nums.length === 1) acc = nums[0]; else if (nums.length === 2) { t1 = nums[0]; t2 = nums[1]; } else if (nums.length === 3) { t1 = nums[0]; t2 = nums[1]; acc = nums[2]; }
        const p = {}; let mm; const re = new RegExp(ASS_TAG_RE.source, 'g');
        while ((mm = re.exec(tags))) if (mm[3]) apply(p, mm[3], mm[4]);
        if (Object.keys(p).length) { tf.push({ t1, t2, acc, p }); special = true; }
        return '';
      });
      let m; const re = new RegExp(ASS_TAG_RE.source, 'g');
      while ((m = re.exec(noT))) {
        if (m[1]) {
          const a = m[2].split(',').map((x) => x.trim());
          if (m[1] === 'pos' && a.length >= 2) { g.pos = [num(a[0]), num(a[1])]; special = true; }
          else if (m[1] === 'move' && a.length >= 4) { g.mv = [num(a[0]), num(a[1]), num(a[2]), num(a[3]), a[4] != null ? num(a[4]) : 0, a[5] != null ? num(a[5]) : durMs]; special = true; }
          else if (m[1] === 'fad' && a.length >= 2) { const i1 = num(a[0]), o1 = num(a[1]); g.fd = [[0, 0], [i1, 1], [Math.max(i1, durMs - o1), 1], [durMs, 0]]; special = true; }
          else if (m[1] === 'fade' && a.length >= 7) {
            const [a1, a2, a3, t1, t2, t3, t4] = a.map((x) => num(x));
            const op = (x) => +(1 - x / 255).toFixed(3);
            g.fd = [[0, op(a1)], [t1, op(a1)], [t2, op(a2)], [t3, op(a2)], [t4, op(a3)], [durMs, op(a3)]]; special = true;
          } else if (m[1] === 'clip' || m[1] === 'iclip') { /* clip rectangles are not drawn */ }
          continue;
        }
        const tag = m[3], val = m[4];
        if (tag === 'an') { g.an = Math.min(9, Math.max(1, num(val, 2))); }
        else if (tag === 'a') { const v = num(val, 2); g.an = ({ 1: 1, 2: 2, 3: 3, 5: 7, 6: 8, 7: 9, 9: 4, 10: 5, 11: 6 })[v] || 2; }
        else if (tag === 'b') { cur.b = num(val, 0) ? 1 : 0; if (/^[1-9]\d\d/.test(val)) cur.b = parseInt(val, 10) >= 600 ? 1 : 0; }
        else if (tag === 'i') cur.i = num(val, 0) ? 1 : 0;
        else if (tag === 'u') cur.u = num(val, 0) ? 1 : 0;
        else if (tag === 's') cur.s = num(val, 0) ? 1 : 0;
        else if (tag === 'fn') { cur.fn = val.trim(); special = true; }
        else if (tag === 'r') { cur = { ...base }; if (val && /^\S/.test(val)) { /* named style reset not resolved */ } }
        else if (tag === 'p') { pMode = num(val, 0); if (pMode > 0) special = true; }
        else if (tag === 'pbo') pbo = num(val);
        else if (tag === 'k' || tag === 'K' || tag === 'kf' || tag === 'ko') { kNext = { d: num(val) * 10, type: tag === 'k' ? 'k' : tag === 'ko' ? 'k' : 'f' }; special = true; }
        else if (tag === 'kt') kAcc = num(val) * 10;
        else if (/^(c|1c|2c|3c|alpha|1a|fs|fscx|fscy|frz|fr|bord|shad|blur|be)$/.test(tag)) {
          apply(cur, tag, val);
          if (tag === 'c' || tag === '1c' || tag === 'fs') special = true;
          if (/^(fscx|fscy|frz|fr|blur|be)$/.test(tag)) special = true;
        }
        else if (/^(frx|fry|fax|fay)$/.test(tag)) special = true;
      }
      if (first && !runs.length) Object.assign(base, { c1: cur.c1, c2: cur.c2, c3: cur.c3, fs: cur.fs, fn: cur.fn, b: cur.b, i: cur.i, u: cur.u, s: cur.s, bord: cur.bord, shad: cur.shad, blur: cur.blur, sx: cur.sx, sy: cur.sy, frz: cur.frz, a: cur.a });
      continue;
    }
    if (!part) continue;
    first = false;
    if (pMode > 0) { const dr = assDrawing(part, pMode); if (dr) { dr.pbo = pbo; dr.c = cur.c1; dr.o = cur.c3; dr.bord = cur.bord; drawing = dr; } continue; }
    const t = part.replace(/\\[Nn]/g, '\n').replace(/\\h/g, ' ');
    if (!t) continue;
    const run = { t, ...diff(cur) };
    if (kNext) { run.k = [kAcc, kNext.d, kNext.type]; kAcc += kNext.d; kNext = null; kStarted = true; }
    else if (kStarted) run.k = [kAcc, 0, 'k'];
    runs.push(run);
  }
  if (g.an !== 2 && g.an !== 8) special = true;
  if (!special) return null;
  const plain = runs.map((r) => r.t).join('').replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
  if (!plain && !drawing) return null;
  const mr = [ev.ml || st.ml || 0, ev.mr || st.mr || 0, ev.mv || st.mv || 0];
  const info = { r: res, an: g.an, base, mr };
  if (st.bs === 3) info.box = 1;
  if (g.pos) info.pos = g.pos;
  if (g.mv) info.mv = g.mv;
  if (g.fd) info.fd = g.fd;
  if (tf.length) info.tf = tf;
  if (drawing) info.dr = drawing;
  else info.runs = runs;
  return { info, plain };
}

function assToVtt(raw) {
  const lines = String(raw).replace(/^﻿/, '').split(/\r\n|\r|\n/);
  const styles = new Map();
  let section = '';
  let styleFmt = [];
  let evFmt = [];
  let resX = 0, resY = 0;
  const cues = [];

  for (const line of lines) {
    const sec = /^\[(.+)\]\s*$/.exec(line.trim());
    if (sec) { section = sec[1].toLowerCase(); continue; }

    if (section === 'script info') {
      const m = /^PlayRes([XY])\s*:\s*(\d+)/i.exec(line.trim());
      if (m) { if (m[1].toUpperCase() === 'X') resX = Number(m[2]); else resY = Number(m[2]); }
    } else if (section.includes('styles')) {
      if (/^format:/i.test(line)) {
        styleFmt = line.slice(7).split(',').map((x) => x.trim().toLowerCase());
      } else if (/^style:/i.test(line) && styleFmt.length) {
        const f = line.slice(6).split(',');
        const name = (f[styleFmt.indexOf('name')] || '').trim();
        const align = parseInt(f[styleFmt.indexOf('alignment')], 10);
        if (name) {
          const g = (k) => f[styleFmt.indexOf(k)];
          styles.set(name, {
            top: align >= 7 && align <= 9, an: align || 2,
            fs: parseFloat(g('fontsize')) || 0, fn: (g('fontname') || '').trim(),
            c1: assColor(g('primarycolour')), c2: assColor(g('secondarycolour')), c3: assColor(g('outlinecolour')),
            b: parseInt(g('bold'), 10) !== 0 && g('bold') != null && String(g('bold')).trim() !== '0', i: String(g('italic')).trim() !== '0' && g('italic') != null,
            u: String(g('underline')).trim() !== '0' && g('underline') != null, s: String(g('strikeout')).trim() !== '0' && g('strikeout') != null,
            sx: parseFloat(g('scalex')) || 100, sy: parseFloat(g('scaley')) || 100, ang: parseFloat(g('angle')) || 0,
            bs: parseInt(g('borderstyle'), 10) || 1, bord: parseFloat(g('outline')), shad: parseFloat(g('shadow')) || 0,
            ml: parseInt(g('marginl'), 10) || 0, mr: parseInt(g('marginr'), 10) || 0, mv: parseInt(g('marginv'), 10) || 0
          });
        }
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
        if (!start || !end) continue;

        const styleName = (parts[evFmt.indexOf('style')] || '').trim().replace(/^\*/, '');
        const st = styles.get(styleName) || {};
        const anMatch = /\{[^}]*\\an([1-9])/.exec(text);
        const an = anMatch ? Number(anMatch[1]) : (st.an || 2);
        const top = anMatch ? Number(anMatch[1]) >= 7 : !!st.top;

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

        const toMs = (v) => { const m = /^(\d+):(\d\d):(\d\d)\.(\d+)/.exec(v); return m ? ((+m[1] * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4] : 0; };
        const evx = { ml: parseInt(parts[evFmt.indexOf('marginl')], 10) || 0, mr: parseInt(parts[evFmt.indexOf('marginr')], 10) || 0, mv: parseInt(parts[evFmt.indexOf('marginv')], 10) || 0 };
        let ci = null;
        try { ci = assCueInfo(text, st, evx, [resX || 384, resY || 288], Math.max(1, toMs(end) - toMs(start))); } catch (_) { ci = null; }
        if (ci) {
          const b64 = Buffer.from(JSON.stringify(ci.info)).toString('base64url');
          cues.push({ start, end, text: '<ass:' + b64 + '>' + (ci.plain || '\u200b') });
          continue;
        }
        if (!clean) continue;
        cues.push({ start, end, text: (top ? '<position:top>' : '') + clean });
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
    .update(`${r.path}|${r.stat.size}|${r.stat.mtimeMs}|${trackIndex}|a117`)
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

/* Hardware H.264 encoder (e.g. h264_mediacodec on Android/Termux). Detected once; the transcoder
   uses it when asked to ("auto") and silently falls back to software x264 if it fails to start.
   Override with ASTRA_HW_ENCODER=<encoder name> or ASTRA_HW_ENCODER=off. */
let HW_ENCODER = null;
let hwDisabled = false;
const HW_FLAG = path.join(CACHE_DIR, 'hw_disabled');
try { hwDisabled = fs.existsSync(HW_FLAG); } catch (e) {}
function disableHwEncoder() {
  HW_ENCODER = null; hwDisabled = true;
  try { fs.writeFileSync(HW_FLAG, String(Date.now())); } catch (e) {}
}
const numCoresEarly = (() => { try { return os.cpus().length || 1; } catch (e) { return 1; } })();
(function detectHwEncoder() {
  const forced = process.env.ASTRA_HW_ENCODER;
  if (forced === 'off' || (hwDisabled && !forced)) return;
  if (forced) { HW_ENCODER = forced; log('SYSTEM', `Hardware encoder (forced): ${forced}`); return; }
  execFile('ffmpeg', ['-hide_banner', '-encoders'], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
    if (!err && /\bh264_mediacodec\b/.test(out)) {
      HW_ENCODER = 'h264_mediacodec';
      log('SYSTEM', 'Hardware encoder available: h264_mediacodec');
    }
  });
})();

app.get('/api/system/capabilities', (req, res) => {
  res.json({ hwEncoder: HW_ENCODER, hwDisabled, cores: numCoresEarly, lowEnd: false });
});
app.post('/api/system/hw-reset', (req, res) => {
  hwDisabled = false;
  try { fs.unlinkSync(HW_FLAG); } catch (e) {}
  execFile('ffmpeg', ['-hide_banner', '-encoders'], { timeout: 15000, maxBuffer: 4 * 1024 * 1024 }, (err, out) => {
    if (!err && /\bh264_mediacodec\b/.test(out)) HW_ENCODER = 'h264_mediacodec';
    res.json({ hwEncoder: HW_ENCODER, hwDisabled });
  });
});

// Software quality presets. "fast" trades picture quality for speed on weak phones.
const QUALITY = {
  low:      { height: 360, crf: 33, preset: 'ultrafast', hwBitrate: '900k', skipLoop: true },
  fast:     { height: 480, crf: 31, preset: 'ultrafast', hwBitrate: '1500k' },
  balanced: { height: 720, crf: 28, preset: 'ultrafast', hwBitrate: '3000k' },
  quality:  { height: 720, crf: 23, preset: 'veryfast',  hwBitrate: '5000k' }
};

function buildFfmpegArgs({ file, seekSec, audioTrack, transcodeVideo, quality, hw, legacy }) {
  const q = QUALITY[quality] || QUALITY.balanced;
  // The decoder is the main cost for HEVC: give it real threads, keep some CPU for the encoder.
  const decodeThreads = Math.max(2, Math.min(4, numCoresEarly));
  // legacy = plain, conservative input flags (the original behaviour) used as a retry if the fast-start flags fail.
  const a = legacy
    ? ['-v', 'error', '-nostdin']
    : ['-v', 'error', '-nostdin', '-threads', '2'];   // identical to the v1.3 decoder setup
  a.push('-progress', 'pipe:3', '-nostats');          // live speed= readout (used by the Auto resolution mode)
  if (transcodeVideo && q.skipLoop) a.push('-skip_loop_filter', 'all');   // cheaper HEVC decode at the lowest level
  if (seekSec > 0) a.push('-ss', seekSec.toString());
  a.push('-i', file, '-map', '0:v:0', '-map', audioTrack);

  if (transcodeVideo) {
    const scale = `scale=-2:min(ih\\,${q.height}):flags=fast_bilinear`;
    if (hw) {
      a.push('-vf', `${scale},format=nv12`, '-c:v', hw, '-b:v', q.hwBitrate, '-g', '30');
    } else {
      a.push('-vf', scale, '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', q.preset,
        '-tune', 'zerolatency', '-crf', String(q.crf), '-g', '30');
    }
  } else {
    a.push('-c:v', 'copy', '-avoid_negative_ts', 'make_zero');
  }

  a.push('-c:a', 'aac', '-b:a', '128k', '-ac', '2', '-ar', '44100',
    '-max_muxing_queue_size', '1024',
    '-f', 'mp4', '-movflags', 'frag_keyframe+empty_moov+default_base_moof', '-');
  return a;
}

let transcodeJobId = 0;
let transcodeStats = { speed: 0, fps: 0, at: 0, job: 0, quality: '', height: 0 };
app.get('/api/transcode/stats', (req, res) => res.json({ ...transcodeStats, active: !!activeTranscodeProc, frozen: isTranscodeFrozen, age: transcodeStats.at ? Date.now() - transcodeStats.at : null }));

// Robust Transcoder: handles Opus, AAC, FLAC, AC3 without audio pipe freeze
app.get('/stream/transcode', (req, res) => {
  const r = resolveFile(req.query.file, VIDEO_EXTS);
  if (r.error) return res.status(r.status).send(r.error);

  const audioTrack = String(req.query.audioTrack || '0:a:0');
  if (!/^0:(a:)?\d+$/.test(audioTrack)) return res.status(400).send('Bad audio track');
  const transcodeVideo = req.query.is10Bit === '1';
  const seekSec = Math.max(0, parseFloat(req.query.startTime) || 0);
  const quality = QUALITY[req.query.q] ? req.query.q : 'balanced';
  const hwWanted = transcodeVideo && !!HW_ENCODER && req.query.enc === 'hw';

  markInteractive(20000);
  killTranscode();
  const jobId = ++transcodeJobId;
  activeTranscodeFile = req.query.file ? String(req.query.file) : '';

  res.writeHead(200, {
    'Content-Type': 'video/mp4',
    'Cache-Control': 'no-cache',
    'Connection': 'keep-alive'
  });
  res.on('error', () => {});

  let bytesOut = 0;

  const launch = (hw, legacy) => {
    const args = buildFfmpegArgs({ file: r.path, seekSec, audioTrack, transcodeVideo, quality, hw, legacy });
    // stderr MUST be drained: an unread pipe fills up (~64 KB) and freezes ffmpeg.
    const ffmpeg = spawn('ffmpeg', args, { stdio: ['ignore', 'pipe', 'pipe', 'pipe'] });
    activeTranscodeProc = ffmpeg;
    transcodeStats = { speed: 0, fps: 0, at: 0, job: jobId, quality, height: QUALITY[quality].height };
    if (ffmpeg.stdio[3]) {
      ffmpeg.stdio[3].on('error', () => {});
      ffmpeg.stdio[3].on('data', (c) => {
        const t = c.toString();
        const sp = [...t.matchAll(/speed=\s*([\d.]+)x/g)].pop();
        const fp = [...t.matchAll(/fps=\s*([\d.]+)/g)].pop();
        if (sp) { transcodeStats.speed = parseFloat(sp[1]); transcodeStats.at = Date.now(); }
        if (fp) transcodeStats.fps = parseFloat(fp[1]);
      });
    }
    isTranscodeFrozen = false;

    let superseded = false;
    let hwWatch = null;
    if (hw) {
      // A hardware encoder that hangs (no error, no output) must not freeze playback: give up after 7 s.
      hwWatch = setTimeout(function check() {
        if (superseded || bytesOut > 0 || ffmpeg !== activeTranscodeProc || res.destroyed) return;
        if (isTranscodeFrozen) { hwWatch = setTimeout(check, 3000); return; }
        log('SYSTEM', `Hardware encoder ${hw} produced no output, disabling it and using software x264`);
        disableHwEncoder();
        superseded = true;
        try { ffmpeg.kill('SIGKILL'); } catch (e) {}
        launch(null, legacy);
      }, 7000);
    }

    let errTail = '';
    ffmpeg.stderr.on('data', (c) => { errTail = (errTail + c.toString()).slice(-600); });
    ffmpeg.stdout.on('error', () => {});
    ffmpeg.stdout.on('data', (c) => { bytesOut += c.length; });
    ffmpeg.stdout.pipe(res, { end: false });

    ffmpeg.on('error', (e) => {
      log('ERROR', `ffmpeg failed to start: ${e.message}`);
      if (ffmpeg === activeTranscodeProc) activeTranscodeProc = null;
      res.end();
    });

    ffmpeg.on('close', (code, signal) => {
      clearTimeout(hwWatch);
      if (superseded) return;
      const failedEarly = code && !signal && bytesOut === 0;
      if (failedEarly && hw && ffmpeg === activeTranscodeProc && !res.destroyed) {
        log('SYSTEM', `Hardware encoder ${hw} failed to start, falling back to software x264`);
        disableHwEncoder();
        return launch(null, legacy);
      }
      if (failedEarly && !hw && !legacy && ffmpeg === activeTranscodeProc && !res.destroyed) {
        log('SYSTEM', `ffmpeg fast-start failed (${errTail.trim().split('\n').pop() || 'exit ' + code}), retrying with plain arguments`);
        return launch(null, true);
      }
      if (code && !signal && errTail.trim()) {
        log('ERROR', `ffmpeg exited ${code} (${path.basename(r.path)}): ${errTail.trim().split('\n').pop()}`);
      }
      if (ffmpeg === activeTranscodeProc) {
        activeTranscodeProc = null;
        isTranscodeFrozen = false;
      }
      res.end();
    });
  };

  launch(hwWanted ? HW_ENCODER : null);

  // Client went away: keep the process briefly (a seek may reconnect), then reap it.
  // A paused (frozen) stream is kept longer, but never forever.
  res.on('close', () => {
    if (res.writableFinished) return;
    const reap = () => {
      if (jobId !== transcodeJobId) return;
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
/* AI subtitles: speech-to-text with whisper.cpp (runs fully offline)  */
/* ------------------------------------------------------------------ */
const AI_DIR = path.join(SUBTITLES_DIR, 'ai');
try { fs.mkdirSync(AI_DIR, { recursive: true }); } catch (e) {}
const HOME_DIR = os.homedir();
const WHISPER_CANDIDATE_DIRS = [
  ...String(process.env.PATH || '').split(path.delimiter),
  path.join(HOME_DIR, 'whisper.cpp', 'build', 'bin'),
  path.join(HOME_DIR, 'whisper.cpp'),
  '/data/data/com.termux/files/usr/bin'
];
const WHISPER_MODEL_DIRS = [
  path.join(__dirname, 'models'),
  path.join(HOME_DIR, 'whisper.cpp', 'models'),
  path.join(HOME_DIR, 'models')
];
// Preference order: fastest multilingual first (tiny ~2x faster than base on a phone). Put ggml-base.bin first via config whisper.model.
const WHISPER_MODEL_ORDER = ['ggml-tiny.bin', 'ggml-base.bin', 'ggml-small.bin', 'ggml-base.en.bin', 'ggml-tiny.en.bin', 'ggml-small.en.bin'];

function findWhisperBin() {
  const wanted = process.env.ASTRA_WHISPER_BIN || (savedConfig.whisper && savedConfig.whisper.bin);
  if (wanted) return fs.existsSync(wanted) ? wanted : null;
  for (const dir of WHISPER_CANDIDATE_DIRS) {
    for (const name of ['whisper-cli', 'whisper-cpp']) {
      const p = path.join(dir, name);
      try { fs.accessSync(p, fs.constants.X_OK); return p; } catch (e) {}
    }
  }
  return null;
}
function listWhisperModels() {
  const found = new Map();
  const extra = process.env.ASTRA_WHISPER_MODEL || (savedConfig.whisper && savedConfig.whisper.model);
  if (extra && fs.existsSync(extra)) found.set(path.basename(extra), extra);
  for (const dir of WHISPER_MODEL_DIRS) {
    try {
      fs.readdirSync(dir).forEach((f) => { if (/^ggml-.*\.bin$/.test(f) && !/silero|vad/i.test(f) && !found.has(f)) found.set(f, path.join(dir, f)); });
    } catch (e) {}
  }
  const names = [...found.keys()].sort((a, b) => {
    const ia = WHISPER_MODEL_ORDER.indexOf(a), ib = WHISPER_MODEL_ORDER.indexOf(b);
    return (ia < 0 ? 99 : ia) - (ib < 0 ? 99 : ib);
  });
  return { names, paths: found };
}

/* Optional voice-activity-detection model (ggml-silero-*.bin): whisper then only decodes real speech. */
function findVadModel() {
  const extra = process.env.ASTRA_WHISPER_VAD || (savedConfig.whisper && savedConfig.whisper.vad);
  if (extra && fs.existsSync(extra)) return extra;
  for (const dir of WHISPER_MODEL_DIRS) {
    try { const f = fs.readdirSync(dir).find((n) => /^ggml-.*silero.*\.bin$/i.test(n)); if (f) return path.join(dir, f); } catch (e) {}
  }
  return '';
}
function aiKillJob(job) { (job.procs || []).forEach((p) => { try { p.kill('SIGKILL'); } catch (e) {} }); if (job.proc) { try { job.proc.kill('SIGKILL'); } catch (e) {} } }

const aiJobs = new Map();      // key -> job
const aiQueue = [];            // keys waiting
let aiRunning = null;          // running job
// Index of finished subtitles, so an episode finds its subtitle again whatever options/model are selected now.
const AI_INDEX_FILE = path.join(AI_DIR, 'index.json');
let aiIndex = {};
try { aiIndex = JSON.parse(fs.readFileSync(AI_INDEX_FILE, 'utf-8')) || {}; } catch (e) { aiIndex = {}; }
function aiIndexSave() { try { fs.writeFileSync(AI_INDEX_FILE, JSON.stringify(aiIndex)); } catch (e) {} }

/* ---- readable names: "Anime Name [S01 E22]" ---------------------------------------- */
function parseMediaName(fileName) {
  const base = String(fileName || '').replace(/\.[a-z0-9]{2,4}$/i, '');
  let s = base.replace(/[._]+/g, ' ');
  let season = null, ep = null, m;
  if ((m = /(?:^|[\s\[(])S(\d{1,2})\s*[ .\-]?E(?:P)?\s?(\d{1,4})(?=$|[\s\])\-])/i.exec(s)) || (m = /(?:^|[\s\[(])(\d{1,2})x(\d{2,4})(?=$|[\s\])])/i.exec(s))) {
    season = +m[1]; ep = +m[2]; s = s.replace(m[0], ' ');
  } else if ((m = /(?:^|[\s\[(\-])(?:episode|ep|e)\s*\.?\s*(\d{1,4})(?=$|[\s\])\-])/i.exec(s))) {
    ep = +m[1]; s = s.replace(m[0], ' ');
  } else if ((m = /\s-\s(\d{1,4})(?:v\d)?(?=\s|\[|\(|$)/.exec(s))) {
    ep = +m[1]; s = s.replace(m[0], ' ');
  }
  let title = s.replace(/\[.*?\]|\(.*?\)/g, ' ')
    .replace(/(\b1080p|\b720p|\b480p|AMZN|WEB-DL|\bAAC\b|H264|H\.264|x264|HEVC|x265|Multi Audio|Multimovies).*/i, '')
    .replace(/[\[\]()]/g, ' ').replace(/\s[-–:]\s/g, ' ').replace(/[\s\-–:]+$/g, '').replace(/^[\s\-–:]+/g, '').replace(/\s+/g, ' ').trim();
  if (!title) title = base.replace(/[\[\]()._]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { title, season, ep };
}
function niceSubName(relPath, mode) {
  const m = parseMediaName(path.basename(String(relPath || '')));
  const pad = (n) => String(n).padStart(2, '0');
  const tag = m.ep == null ? '' : m.season != null ? ` [S${pad(m.season)} E${pad(m.ep)}]` : ` [E${pad(m.ep)}]`;
  return (m.title + tag + (mode === 'quick' ? ' (quick)' : '')).replace(/[\\/:*?"<>|]+/g, ' ').replace(/\s+/g, ' ').trim();
}
function vttToSrt(vtt) {
  let n = 0;
  return String(vtt).replace(/\r/g, '').split(/\n\n+/).map((b) => {
    const lines = b.split('\n'); const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) return '';
    const t = lines[ti].replace(/\./g, ',');
    const text = lines.slice(ti + 1).join('\n').trim();
    return text ? `${++n}\n${t}\n${text}\n` : '';
  }).filter(Boolean).join('\n');
}
const AI_EXPORT_DIR = path.join(AI_DIR, '..', 'export');
function aiExport(job, vtt) {
  const base = niceSubName(job.relPath, job.mode);
  try {
    fs.mkdirSync(AI_EXPORT_DIR, { recursive: true });
    // never overwrite a different subtitle of the same episode: another language / model / translation gets its own name
    const taken = (n) => Object.keys(aiIndex).some((k) => k !== job.key && aiIndex[k] && aiIndex[k].name === n) && fs.existsSync(path.join(AI_EXPORT_DIR, `${n}.srt`));
    let name = base;
    if (taken(name)) {
      const tag = job.translate ? 'translated' : (job.langUsed || (job.lang && job.lang !== 'auto' ? job.lang : '') || 'auto');
      name = `${base} (${tag})`;
      for (let n = 2; taken(name) && n < 50; n++) name = `${base} (${tag} ${n})`;
    }
    fs.writeFileSync(path.join(AI_EXPORT_DIR, `${name}.vtt`), vtt, 'utf-8');
    fs.writeFileSync(path.join(AI_EXPORT_DIR, `${name}.srt`), vttToSrt(vtt), 'utf-8');
    return name;
  } catch (e) { return base; }
}
const LANG3 = { jpn: 'ja', eng: 'en', hin: 'hi', kor: 'ko', zho: 'zh', chi: 'zh', spa: 'es', fra: 'fr', fre: 'fr', deu: 'de', ger: 'de', rus: 'ru', ara: 'ar', ita: 'it', por: 'pt', tha: 'th', ind: 'id', tam: 'ta', tel: 'te' };
/* The audio track usually says what language it is: then whisper does not waste time detecting it. */
function aiTrackLang(file, track) {
  return new Promise((resolve) => {
    const sel = /^0:a:(\d+)$/.test(track) ? `a:${track.split(':')[2]}` : String(track).split(':')[1];
    execFile('ffprobe', ['-v', 'error', '-select_streams', sel, '-show_entries', 'stream_tags=language', '-of', 'csv=p=0', file], { timeout: 10000 }, (err, out) => {
      const l = LANG3[String(out || '').trim().toLowerCase().split(/\s/)[0]];
      resolve(err || !l ? '' : l);
    });
  });
}
/* Android slows or suspends background CPU: hold a Termux wake lock while subtitles are being made. */
let wakeHeld = false;
function wakeLock(on) {
  if (on === wakeHeld) return;
  wakeHeld = on;
  try { execFile(on ? 'termux-wake-lock' : 'termux-wake-unlock', [], () => {}); } catch (e) {}
}

function aiKeyFor(r, audioTrack, lang, translate, model) {
  return crypto.createHash('sha1')
    .update(`${r.path}|${r.stat.size}|${r.stat.mtimeMs}|${audioTrack}|${lang}|${translate ? 1 : 0}|${model}|v13`)
    .digest('hex');
}
const aiCacheFile = (key) => path.join(AI_DIR, `${key}.vtt`);

/* Whisper emits "[BLANK_AUDIO]", "(music)", "♪" ... as text: those are not speech. */
function stripNonSpeechCues(vtt) {
  const blocks = String(vtt).replace(/\r/g, '').split(/\n\n+/);
  const out = ['WEBVTT', ''];
  blocks.forEach((b) => {
    const lines = b.split('\n');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) return;
    const text = lines.slice(ti + 1).join(' ').trim();
    const plain = text.replace(/[\[\(].*?[\]\)]/g, '').replace(/[♪♫\s]/g, '');
    if (!plain) return;
    out.push(lines[ti], lines.slice(ti + 1).join('\n').trim(), '');
  });
  return out.join('\n');
}

function aiPublic(job) {
  if (!job) return null;
  const now = Date.now();
  const finished = ['done', 'error', 'cancelled'].includes(job.state);
  const elapsed = job.startedAt ? Math.round(((finished && job.endedAt ? job.endedAt : now) - job.startedAt) / 1000) : 0;
  let eta = null;
  if (job.state === 'transcribing' && job.doneSec > 0 && job.duration > 0) {
    const rate = (now - job.startedAt) / 1000 / job.doneSec;          // wall seconds per audio second
    eta = Math.max(0, Math.round(((job.totalSec || job.duration) - job.doneSec) * rate));
  }
  return { key: job.key, state: job.state, pct: Math.round(job.pct * 10) / 10, msg: job.msg || '', file: job.relPath, queued: aiQueue.length,
    mode: job.mode || 'ai', name: niceSubName(job.relPath, job.mode), workers: job.workers || 0, vad: !!job.vad, langUsed: job.langUsed || '', chunk: job.chunk || 0, chunks: job.chunks || 0, elapsed, eta, cues: job.cues ? job.cues.length : 0, last: job.last || '', partial: !!(job.cues && job.cues.length) };
}

function aiFinish(job, state, msg) {
  job.endedAt = Date.now();                       // the elapsed timer stops here
  job.state = state; job.msg = msg || ''; job.proc = null;
  if (state === 'done') {
    job.pct = 100;
    aiIndex[job.key] = { name: job.exportName || niceSubName(job.relPath, job.mode), mode: job.mode || 'ai', path: job.path, size: job.sig && job.sig.size, mtimeMs: job.sig && job.sig.mtimeMs, audioTrack: job.audioTrack, lang: job.lang, translate: !!job.translate, model: job.model, lines: job.cues ? job.cues.length : 0, created: Date.now() };
    aiIndexSave();
  }
  try { if (job.wav) fs.unlinkSync(job.wav); } catch (e) {}
  if (state === 'done' || state === 'cancelled') { try { fs.rmSync(job.workDir, { recursive: true, force: true }); } catch (e) {} }
  if (aiRunning === job) aiRunning = null;
  setImmediate(() => { aiPump(); if (!aiRunning) wakeLock(false); });
}

function aiPump() {
  if (aiRunning) return;
  while (aiQueue.length) {
    const job = aiJobs.get(aiQueue.shift());
    if (job && job.state === 'queued') { aiRunning = job; wakeLock(true); return aiRun(job); }
  }
}

/* "00:01:02.500" / "01:02.500" -> seconds */
function vttTime(s) {
  const p = s.replace(',', '.').split(':').map(Number);
  while (p.length < 3) p.unshift(0);
  return p[0] * 3600 + p[1] * 60 + p[2];
}
function fmtVttTime(t) {
  t = Math.max(0, t);
  const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t - h * 3600 - m * 60;
  const pad = (n, w) => String(n).padStart(w, '0');
  return `${pad(h, 2)}:${pad(m, 2)}:${pad(Math.floor(s), 2)}.${pad(Math.round((s % 1) * 1000) % 1000, 3)}`;
}
/* Parse whisper's VTT into cues; long cues are split at word boundaries (replaces -ml/-sow). */
function parseWhisperVtt(raw, offset) {
  const cues = [];
  String(raw).replace(/\r/g, '').split(/\n\n+/).forEach((b) => {
    const lines = b.split('\n');
    const ti = lines.findIndex((l) => l.includes('-->'));
    if (ti < 0) return;
    const m = /([\d:.,]+)\s*-->\s*([\d:.,]+)/.exec(lines[ti]);
    if (!m) return;
    const text = lines.slice(ti + 1).join(' ').replace(/\s+/g, ' ').trim();
    if (!text) return;
    const s = vttTime(m[1]) + offset, e = vttTime(m[2]) + offset;
    if (text.length <= 60 || e - s < 2) return cues.push({ s, e, text });
    const words = text.split(' '), parts = [];
    let cur = '';
    words.forEach((w) => { if (cur && (cur + ' ' + w).length > 48) { parts.push(cur); cur = w; } else cur = cur ? cur + ' ' + w : w; });
    if (cur) parts.push(cur);
    const total = parts.reduce((a, p) => a + p.length, 0);
    let t = s;
    parts.forEach((p) => { const d = (e - s) * (p.length / total); cues.push({ s: t, e: t + d, text: p }); t += d; });
  });
  return cues;
}
function cuesToVtt(cues) {
  const out = ['WEBVTT', ''];
  cues.forEach((c) => {
    const plain = c.text.replace(/[\[\(].*?[\]\)]/g, '').replace(/[♪♫\s]/g, '');
    if (!plain) return;                                   // [BLANK_AUDIO], (music) ...
    out.push(`${fmtVttTime(c.s)} --> ${fmtVttTime(c.e)}`, c.text, '');
  });
  return out.join('\n');
}

/* ---- v1.13 cue clean-up: whisper (esp. tiny) loops on music/silence and stutters; fix it in JS ---- */
const normTxt = (t) => String(t).toLowerCase().replace(/[^\p{L}\p{N}\s']/gu, ' ').replace(/\s+/g, ' ').trim();
const normTok = (w) => w.toLowerCase().replace(/[^\p{L}\p{N}']/gu, '');
function collapseRepeats(text) {
  let t = String(text).replace(/\s+/g, ' ').trim();
  t = t.replace(/(^|[\s"'(])(\p{L}+)(?:-\2){2,}(?=$|[\s.,!?"')])/giu, '$1$2');           // I-I-I-I  ->  I
  let w = t.split(' ').filter((x) => x.length <= 25 && !/(\p{L}{2,})\1{4,}/iu.test(x));    // "ononoonoon..." junk tokens
  for (let n = 1; n <= 12; n++) {
    for (let i = 0; i + 2 * n <= w.length; i++) {
      const base = w.slice(i, i + n).map(normTok).join(' ');
      if (!base.trim()) continue;
      let reps = 1;
      while (i + (reps + 1) * n <= w.length && w.slice(i + reps * n, i + (reps + 1) * n).map(normTok).join(' ') === base) reps++;
      if (reps >= (n === 1 ? 5 : 3)) w.splice(i + n, (reps - 1) * n);      // 'No, no, no!' stays; 'you, you, you, ...' and phrase loops go                                       // "still still still" / "a film of a film of ..." -> once
    }
  }
  return w.join(' ').replace(/\s+([,.!?])/g, '$1').trim();
}
const tokSet = (t) => new Set(normTxt(t).split(' ').filter(Boolean));
function similar(a, b) {
  const A = tokSet(a), B = tokSet(b);
  if (!A.size || !B.size) return false;
  let hit = 0; A.forEach((x) => { if (B.has(x)) hit++; });
  return hit / Math.min(A.size, B.size) >= 0.8;
}
function cleanCues(cues) {
  const out = [];
  cues.slice().sort((a, b) => a.s - b.s || a.e - b.e).forEach((c) => {
    const n0 = c.text.split(/\s+/).length;
    let text = collapseRepeats(c.text);
    const n1 = text ? text.split(/\s+/).length : 0;
    if (n0 >= 8 && n1 <= 3 && n1 / n0 < 0.35) return;                  // nothing but a loop ("you, you, you, ...")
    if (text.length > 200) text = text.slice(0, 200).replace(/\s+\S*$/, '');
    const nt = normTxt(text);
    if (!nt) return;
    const s = c.s, maxOf = (t) => Math.min(8, 1.8 + t.length * 0.09);   // a 20-character line is not on screen for 40 s
    const e = Math.min(Math.max(c.e, s + 0.4), s + maxOf(text));
    const words = nt.split(' ').length;
    // a decoding loop / chunk-edge duplicate: touching or overlapping repeat of the same line, or the 3rd+ identical line within 10 s
    let dup = null, same = 0;
    for (let k = out.length - 1; k >= 0 && k >= out.length - 3 && !dup; k--) {
      const q = out[k], gap = s - (q.raw || q.e);
      if (gap > 10) break;
      const qn = normTxt(q.text);
      if (qn === nt) { same++; if (gap < 1.5 || same >= 2) dup = q; }
      else if (text.length >= 12 && words >= 3 && gap < 0.5 && similar(q.text, text)) dup = q;
    }
    if (dup) {
      if (nt.length > normTxt(dup.text).length && s < dup.e + 0.5) dup.text = text;
      dup.raw = Math.max(dup.raw || 0, c.e);
      dup.e = Math.min(Math.max(dup.e, e), dup.s + maxOf(dup.text));
      return;
    }
    const p = out[out.length - 1];
    if (p && s < p.e) p.e = Math.max(p.s + 0.3, s);                    // never overlap the previous line
    out.push({ s, e, text, raw: c.e });
  });
  // a whole run of lines repeated straight after itself (A B C D A B C D) is a loop too: keep the first copy
  for (let m = 8; m >= 2; m--) {
    for (let i = m; i + m <= out.length; ) {
      let same = true;
      for (let k = 0; k < m && same; k++) same = normTxt(out[i - m + k].text) === normTxt(out[i + k].text);
      if (same) out.splice(i, m); else i++;
    }
  }
  return out.map((c) => ({ s: c.s, e: c.e, text: c.text }));
}

/* ---- v1.15 speech gating: cut silence out of a chunk, transcribe only the speech, map times back ---- */
function wavRead(file) {
  const b = fs.readFileSync(file);
  if (b.toString('ascii', 0, 4) !== 'RIFF') return null;
  let p = 12, rate = 16000;
  while (p + 8 <= b.length) {
    const id = b.toString('ascii', p, p + 4), n = b.readUInt32LE(p + 4);
    if (id === 'fmt ') rate = b.readUInt32LE(p + 12);
    if (id === 'data') return { rate, pcm: b.subarray(p + 8, Math.min(b.length, p + 8 + n)) };
    p += 8 + n + (n & 1);
  }
  return null;
}
function wavWrite(file, pcm, rate) {
  const h = Buffer.alloc(44);
  h.write('RIFF', 0); h.writeUInt32LE(36 + pcm.length, 4); h.write('WAVEfmt ', 8); h.writeUInt32LE(16, 16); h.writeUInt16LE(1, 20); h.writeUInt16LE(1, 22);
  h.writeUInt32LE(rate, 24); h.writeUInt32LE(rate * 2, 28); h.writeUInt16LE(2, 32); h.writeUInt16LE(16, 34); h.write('data', 36); h.writeUInt32LE(pcm.length, 40);
  fs.writeFileSync(file, Buffer.concat([h, pcm]));
}
/* silences -> speech segments [a,b] (seconds), padded and merged */
function speechFromSilences(silences, total) {
  const PAD = 0.2, MINSP = 0.25, MERGE = 0.45;
  const segs = []; let cur = 0;
  silences.concat([[total, total + 1]]).forEach(([a, b]) => { if (a - cur > 0.05) segs.push([cur, Math.min(a, total)]); cur = Math.max(cur, b); });
  const padded = segs.filter(([a, b]) => b - a >= MINSP).map(([a, b]) => [Math.max(0, a - PAD), Math.min(total, b + PAD)]);
  const out = [];
  padded.forEach((sg) => { const l = out[out.length - 1]; if (l && sg[0] - l[1] < MERGE) l[1] = Math.max(l[1], sg[1]); else out.push(sg.slice()); });
  return out;
}
/* builds the gated wav; returns { map(t, 's'|'e') } or null when gating would not help */
function buildGated(wavFile, outFile, segs, total) {
  const w = wavRead(wavFile); if (!w) return null;
  const GAP = 0.5, rate = w.rate, bps = 2;
  const spoken = segs.reduce((n, [a, b]) => n + (b - a), 0);
  if (!segs.length || spoken > total * 0.92) return null;
  const parts = [], map = []; let cs = 0;
  segs.forEach(([a, b], i) => {
    const i0 = Math.floor(a * rate) * bps, i1 = Math.min(w.pcm.length, Math.floor(b * rate) * bps);
    if (i1 <= i0) return;
    const piece = w.pcm.subarray(i0, i1); parts.push(piece);
    const len = piece.length / bps / rate; map.push({ cs, ce: cs + len, os: a });
    cs += len;
    if (i < segs.length - 1) { parts.push(Buffer.alloc(Math.floor(GAP * rate) * bps)); cs += GAP; }
  });
  if (!map.length) return null;
  wavWrite(outFile, Buffer.concat(parts), rate);
  return {
    seconds: cs,
    segs,
    map(t, edge) {
      for (const m of map) if (t >= m.cs && t <= m.ce) return m.os + (t - m.cs);
      for (let i = 0; i < map.length; i++) {                      // inside a gap: start snaps forward, end snaps back
        if (t < map[i].cs) return edge === 'e' ? (i ? map[i - 1].os + (map[i - 1].ce - map[i - 1].cs) : map[0].os) : map[i].os;
      }
      const l = map[map.length - 1]; return l.os + (l.ce - l.cs);
    },
  };
}
/* Whisper's own times drift a little either way. The silence scan knows where speech really starts and stops,
   so a line that opens/closes next to a speech edge is moved onto that edge. */
function snapToSpeech(cues, segs, ss) {
  const EDGE = 0.2, TOL = 1.5, out = cues.map((c) => ({ ...c }));
  const inner = segs.map(([a0, b0]) => [a0 + ss + EDGE, b0 + ss - EDGE]).filter(([a, b]) => b - a >= 0.3);
  const inside = (t, k) => inner.some(([a, b], j) => j !== k && t > a + 0.15 && t < b - 0.15);      // t lies in the middle of ANOTHER speech stretch
  inner.forEach(([a, b], k) => {
    let first = null, last = null;
    out.forEach((c) => {
      if (c.s >= a - TOL && c.s <= b && !inside(c.s, k) && (!first || c.s < first.s)) first = c;
      if (c.e >= a && c.e <= b + TOL && !inside(c.e, k) && (!last || c.e > last.e)) last = c;
    });
    if (first && Math.abs(first.s - a) <= TOL) first.s = Math.max(0, a);
    if (last && Math.abs(last.e - b) <= TOL && b - last.s >= 0.4) last.e = b;
  });
  for (let i = 0; i < out.length; i++) {
    if (out[i].e < out[i].s + 0.4) out[i].e = out[i].s + 0.4;
    if (out[i + 1] && out[i].e > out[i + 1].s) out[i].e = Math.max(out[i].s + 0.3, out[i + 1].s);
  }
  return out;
}
function aiSilences(file) {
  return new Promise((resolve) => {
    const p = spawn('ffmpeg', ['-v', 'info', '-nostdin', '-i', file, '-af', 'silencedetect=noise=-38dB:d=0.5', '-f', 'null', '-'], { stdio: ['ignore', 'ignore', 'pipe'] });
    let err = ''; p.stderr.on('data', (c) => { if (err.length < 400000) err += c.toString(); });
    p.on('error', () => resolve(null));
    p.on('close', (code) => {
      if (code !== 0) return resolve(null);
      const out = []; let st = null;
      err.split('\n').forEach((l) => {
        let m = /silence_start:\s*(-?[\d.]+)/.exec(l); if (m) st = Math.max(0, parseFloat(m[1]));
        m = /silence_end:\s*([\d.]+)/.exec(l); if (m && st !== null) { out.push([st, parseFloat(m[1])]); st = null; }
      });
      if (st !== null) out.push([st, 1e9]);
      resolve(out);
    });
  });
}
function aiChannels(file, track) {
  return new Promise((resolve) => {
    const sel = /^0:a:(\d+)$/.test(track) ? `a:${track.split(':')[2]}` : String(track).split(':')[1];
    execFile('ffprobe', ['-v', 'error', '-select_streams', sel, '-show_entries', 'stream=channels', '-of', 'csv=p=0', file], { timeout: 10000 }, (err, out) => resolve(err ? 2 : (parseInt(out, 10) || 2)));
  });
}
const aiPartFile = (key) => path.join(AI_DIR, `${key}.part.vtt`);

function aiSpawnWait(job, cmd, args, tailRef) {
  return new Promise((resolve) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    job.proc = p; (job.procs = job.procs || new Set()).add(p); p.on('close', () => job.procs.delete(p));
    try { os.setPriority(p.pid, 0); } catch (e) {}
    const grab = (c) => { tailRef.t = (tailRef.t + c.toString()).slice(-(tailRef.max || 600)); };
    p.stdout.on('data', grab); p.stderr.on('data', grab);
    p.on('error', (e) => resolve({ code: -1, signal: null, err: e.message }));
    p.on('close', (code, signal) => resolve({ code, signal }));
  });
}

function aiSkipRanges(file) {
  return new Promise((resolve) => {
    execFile('ffprobe', ['-v', 'error', '-show_chapters', '-print_format', 'json', file], { maxBuffer: 4 * 1024 * 1024, timeout: 15000 }, (err, out) => {
      if (err) return resolve([]);
      try {
        const ch = (JSON.parse(out).chapters || []).map((c) => ({ a: parseFloat(c.start_time), b: parseFloat(c.end_time), t: (c.tags && (c.tags.title || '')) || '' }));
        resolve(ch.filter((c) => /^(op|ed|ncop|nced)\b|opening|ending|credits|outro|\bintro\b/i.test(c.t.trim()) && c.b - c.a < 330).map((c) => [c.a, c.b]));
      } catch (e) { resolve([]); }
    });
  });
}
async function aiRun(job) {
  const bin = findWhisperBin();
  const modelPath = listWhisperModels().paths.get(job.model);
  if (!bin || !modelPath) return aiFinish(job, 'error', 'whisper.cpp or its model was not found');

  // Language: track tag first; if the file has none, let whisper listen to 30 s from the middle of the episode instead of guessing per chunk.
  if (job.lang === 'auto' && !job.langUsed && !/\.en\b/.test(job.model) && job.duration > 60) {
    try {
      job.msg = 'Detecting language';
      const lw = path.join(job.workDir || AI_DIR, `lang-${job.key}.wav`);
      try { fs.mkdirSync(path.dirname(lw), { recursive: true }); } catch (e) {}
      const ex = await aiSpawnWait(job, 'ffmpeg', ['-v', 'error', '-nostdin', '-y', '-ss', String(Math.floor(job.duration * 0.3)), '-i', job.path, '-map', job.audioTrack, '-t', '30', '-vn', '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', lw], { t: '' });
      if (ex.code === 0) {
        const tail = { t: '' };
        tail.max = 6000; await aiSpawnWait(job, bin, ['-m', modelPath, '-f', lw, '-dl', '-t', '2'], tail);
        const m = /auto-detected language:\s*([a-z]{2,3})/i.exec(tail.t);
        if (m) job.langUsed = m[1].toLowerCase();
      }
      try { fs.unlinkSync(lw); } catch (e) {}
    } catch (e) {}
  }
  const channels = await aiChannels(job.path, job.audioTrack);
  job.centre = channels >= 5;                     // 5.1 / 7.1: dialogue lives on the centre channel
  const GATE = !(savedConfig.whisper && savedConfig.whisper.gate === false);
  const CH = Math.max(20, Number(process.env.ASTRA_AI_CHUNK_SEC) || 120);
  // Chunk list: whole episode minus opening/ending/credits chapters (music, nothing to transcribe).
  const skip = await aiSkipRanges(job.path);
  const list = [];
  if (job.duration > 0) {
    let cursor = 0;
    const segs = [];
    skip.concat([[job.duration + 1, job.duration + 2]]).forEach(([a, b]) => { if (a > cursor) segs.push([cursor, Math.min(a, job.duration)]); cursor = Math.max(cursor, b); });
    segs.forEach(([a, b]) => { for (let t = a; t < b - 3; t += CH) list.push({ start: t, len: Math.min(CH, b - t) }); });
    job.skipped = skip.reduce((n, [a, b]) => n + Math.max(0, Math.min(b, job.duration) - a), 0);
  } else list.push({ start: 0, len: 0 });
  job.chunks = list.length;
  job.workDir = path.join(AI_DIR, `${job.key}.work`);
  try { fs.mkdirSync(job.workDir, { recursive: true }); } catch (e) {}
  job.cues = []; job.chunk = 1; job.doneSec = 0; job.totalSec = list.reduce((n, c) => n + c.len, 0); job.startedAt = Date.now(); job.state = 'transcribing'; job.pct = 0.5;
  const alive = () => job.state !== 'cancelled';
  const publishPartial = () => { try { fs.writeFileSync(aiPartFile(job.key), cuesToVtt(job.cues), 'utf-8'); } catch (e) {} };

  const doneSet = new Set(), claimed = new Set();
  // Work starts at the playhead (job.from, updated while you watch/seek) so subtitles are always ahead of you.
  const pickNext = () => {
    const f = Math.max(0, list.findIndex((c) => c.start + c.len > (job.from || 0)));
    for (let k = f; k < list.length; k++) if (!claimed.has(k)) return k;
    for (let k = 0; k < f; k++) if (!claimed.has(k)) return k;
    return -1;
  };
  // Two whisper workers on 6+ core phones (each with its own threads), one otherwise or when RAM is tight.
  const cores = os.cpus().length;
  const bigModel = !/tiny/i.test(job.model);
  let workers = Number(savedConfig.whisper && savedConfig.whisper.parallel) || (cores >= 6 && !(bigModel && os.totalmem() < 3e9) ? 2 : 1);
  workers = Math.max(1, Math.min(3, workers, list.length));
  const threadsEach = Math.max(1, Math.min(4, Number(savedConfig.whisper && savedConfig.whisper.threads) || Math.floor(cores / workers)));
  const vadModel = findVadModel();
  job.tier = vadModel ? 0 : 2;               // 0 tuned voice detection, 1 basic, 2 fast flags only, 3 plain
  job.workers = workers; job.vad = !!vadModel;
  let fatal = null;
  const inflight = new Map();                // worker -> { t0 }
  const tick = setInterval(() => {
    const per = job.partMs || (CH * 1000 * 1.5);
    let frac = 0; inflight.forEach((w) => { frac += Math.min(0.95, (Date.now() - w.t0) / per); });
    job.pct = Math.max(job.pct, ((doneSet.size + frac) / job.chunks) * 99.5);
  }, 700);

  const HP = 3, TP = 3;                      // v1.13: each slice is read 3 s early and 3 s late so no sentence is cut at a chunk edge
  const processChunk = async (i, wid) => {
    const start = list[i].start, len = list[i].len;
    const cacheJson = path.join(job.workDir, `${i}.v13.json`);
    let cues = null;
    try { cues = JSON.parse(fs.readFileSync(cacheJson, 'utf-8')); } catch (e) {}      // resume
    if (!cues) {
      job.msg = `Listening · ${doneSet.size + 1} of ${job.chunks}`;
      const wav = path.join(job.workDir, `${i}.wav`);
      const ss = Math.max(0, start - HP);
      const sliceLen = len > 0 ? (start - ss) + len + TP : 0;
      // Audio extraction, three attempts: normal -> skip corrupt AAC frames -> slow exact seek. A bad file never kills the job.
      const extract = async (mode) => {
        try { fs.unlinkSync(wav); } catch (e) {}
        const a = ['-v', 'error', '-nostdin', '-y'];
        if (mode >= 1) a.push('-err_detect', 'ignore_err', '-fflags', '+discardcorrupt+genpts');
        if (mode < 2) a.push('-ss', String(ss));
        a.push('-i', job.path, '-map', job.audioTrack);
        if (mode >= 2) a.push('-ss', String(ss));
        if (sliceLen > 0) a.push('-t', String(sliceLen));
        // voice-focused audio: dialogue centre channel on 5.1, band-pass + denoise in AI mode (plain downmix for the fallbacks)
        const down = job.centre ? 'pan=mono|c0=0.85*FC+0.15*FL+0.15*FR' : 'pan=mono|c0=0.5*c0+0.5*c1';
        const chain = [];
        if (mode === 0 && (job.centre || channels >= 2)) chain.push(down);
        if (mode === 0 && job.mode !== 'quick') chain.push('highpass=f=90', 'lowpass=f=7600', 'afftdn=nf=-30');
        else if (mode === 0) chain.push('highpass=f=80');
        chain.push('aresample=async=1:first_pts=0');
        a.push('-vn', '-af', chain.join(','), '-ac', '1', '-ar', '16000', '-c:a', 'pcm_s16le', wav);
        const tail = { t: '' };
        const r = await aiSpawnWait(job, 'ffmpeg', a, tail);
        let size = 0; try { size = fs.statSync(wav).size; } catch (e) {}
        return { r, size, tail: tail.t };
      };
      let ex = await extract(0);
      for (let mode = 1; mode <= 2 && alive() && !fatal && ex.r.code !== 0 && ex.size < Math.max(1000, sliceLen * 32000 * 0.9); mode++) {
        job.msg = 'Audio has damaged frames · retrying'; ex = await extract(mode);
      }
      if (!alive() || fatal) return null;
      const size = ex.size;
      if (ex.r.code !== 0 && size < 1000) {
        job.badChunks = (job.badChunks || 0) + 1;
        log('WARN', `AI subtitles: audio slice ${i + 1} could not be decoded (${(ex.tail.trim().split('\n').pop() || ex.r.err || ex.r.code)}); skipped`);
        cues = [];
      } else if (size < 1000) cues = [];                  // silent / past-the-end slice
      else {
        const prefix = path.join(job.workDir, `${i}`);
        const quick = job.mode === 'quick';
        // cut silence out: whisper hears only speech and cannot loop on gaps; times are mapped back afterwards
        let gate = null, wavIn = wav;
        if (GATE) {
          try {
            const sil = await aiSilences(wav);
            if (!alive() || fatal) return null;
            const total = ex.size > 44 ? (ex.size - 44) / 32000 : 0;
            if (sil && total > 5) {
              gate = buildGated(wav, prefix + '.gate.wav', speechFromSilences(sil, total), total);
              if (gate) wavIn = prefix + '.gate.wav';
            }
          } catch (e) { gate = null; wavIn = wav; }
        }
        const toAbs = (cs) => cs.map((c) => (gate ? { s: gate.map(c.s, 's') + ss, e: Math.max(gate.map(c.s, 's'), gate.map(c.e, 'e')) + ss, text: c.text } : { s: c.s + ss, e: c.e + ss, text: c.text }));
        // tier 0 = fast flags + tuned VAD, 1 = fast flags + basic VAD, 2 = fast flags, 3 = plain
        const run = (threads, tier) => {
          const args = ['-m', modelPath, '-f', wavIn, '-t', String(threads), '-l', job.langUsed || job.lang, '-ovtt', '-of', prefix];
          if (tier <= 2) args.push('-bs', '1', '-bo', '1', '-mc', '0',
            ...(quick ? ['-ac', '768'] : []),                    // AI mode keeps the full audio window: shortened windows shift timestamps   // temperature fallback stays ON: it is what breaks decoding loops
            '-et', '2.4', '-lpt', '-1.0', '-nth', '0.6');
          if (tier <= 1) args.push('-sns');                                         // suppress music/sound-effect tokens (newer builds, same ones that have VAD)
          if (tier === 0) args.push('--vad', '-vm', vadModel, '-vt', '0.35', '-vsd', '250', '-vmsd', '20', '-vp', '200');
          else if (tier === 1) args.push('--vad', '-vm', vadModel);
          if (job.translate && job.langUsed !== 'en') args.push('-tr');          // English audio: nothing to translate (and -tr hurts timing)
          const tail = { t: '' }, t0 = Date.now();
          inflight.set(wid, { t0 });
          return aiSpawnWait(job, bin, args, tail).then((r) => { inflight.delete(wid); job.partMs = Date.now() - t0; r.tail = tail.t; return r; });
        };
        const transcribe = async (firstTier) => {
          let tier = Math.max(firstTier, job.tier), r = await run(threadsEach, tier);
          // older whisper builds reject some flags: step down one tier (and remember it for the whole job)
          while (alive() && !fatal && r.code !== 0 && !r.signal && tier < 3) {
            if (job.tier === tier) job.tier = tier + 1;
            tier = Math.max(tier + 1, job.tier); job.msg = 'Retrying with simpler settings';
            r = await run(threadsEach, tier);
          }
          if (alive() && !fatal && r.code !== 0 && threadsEach > 2) { job.msg = 'Retrying with fewer threads'; r = await run(2, 3); }
          if (!alive() || fatal) return null;
          if (r.code !== 0) {
            throw new Error(r.signal ? `whisper was killed (${r.signal}) - Android probably ran out of memory. Close other apps or use ggml-tiny.bin`
              : `whisper failed (exit ${r.code}): ${(r.tail || r.err || '').trim().split('\n').filter(Boolean).pop() || 'no output'}`);
          }
          let raw = '';
          try { raw = fs.readFileSync(prefix + '.vtt', 'utf-8'); fs.unlinkSync(prefix + '.vtt'); } catch (e) {}
          return { tier, cues: toAbs(parseWhisperVtt(raw, 0)) };
        };
        let res = await transcribe(job.tier);
        if (res === null) return null;
        // Voice detection can swallow quiet dialogue: if a long slice came back nearly empty, retry once without it and keep the better result.
        const covered = (cs) => cs.reduce((n, c) => n + Math.max(0, Math.min(c.e, start + len) - Math.max(c.s, start)), 0);
        if (res.tier <= 1 && len >= 60 && covered(res.cues) < len * 0.12) {
          job.msg = 'Few lines found · checking again';
          const alt = await transcribe(2);
          if (alt === null) return null;
          if (covered(cleanCues(alt.cues)) > covered(cleanCues(res.cues))) res = alt;
        }
        cues = res.cues.filter((c) => c.s >= start - 0.01 && (i === list.length - 1 || c.s < start + len));    // each chunk owns the cues that START inside it
        cues = cleanCues(cues);
        if (job.translate || ['en', 'es', 'fr', 'de', 'it', 'pt', 'id'].includes(job.langUsed)) {             // wrong-script junk ("\ufffd", Hangul in English audio)
          cues = cues.map((c) => ({ ...c, text: c.text.replace(/[\u3040-\u30ff\u3400-\u9fff\uac00-\ud7af\ufffd]+/g, '').replace(/\s{2,}/g, ' ').trim() })).filter((c) => /[\p{L}\p{N}]/u.test(c.text));
        }
        if (gate && !(savedConfig.whisper && savedConfig.whisper.snap === false)) cues = snapToSpeech(cues, gate.segs, ss);
      }
      try { fs.unlinkSync(wav); } catch (e) {}
      try { fs.unlinkSync(path.join(job.workDir, `${i}.gate.wav`)); } catch (e) {}
      try { fs.writeFileSync(cacheJson, JSON.stringify(cues)); } catch (e) {}
    }
    return cues;
  };
  const worker = async (wid) => {
    for (let i = pickNext(); i >= 0 && alive() && !fatal; i = pickNext()) {
      claimed.add(i);
      let cues;
      try { cues = await processChunk(i, wid); } catch (e) { fatal = e.message; aiKillJob(job); return; }
      if (cues === null) return;
      job.cues.push(...cues);
      doneSet.add(i); job.chunk = Math.min(doneSet.size + 1, job.chunks);
      job.doneSec = list.reduce((n, c, k) => n + (doneSet.has(k) ? c.len : 0), 0);
      job.pct = Math.max(job.pct, (doneSet.size / job.chunks) * 99);
      job.cues.sort((a, b) => a.s - b.s);
      const lastCue = [...cues].reverse().find((c) => /[^\s\[\]\(\)\u266a\u266b]/.test(c.text.replace(/[\[\(].*?[\]\)]/g, '')));
      if (lastCue) job.last = lastCue.text;
      publishPartial();
    }
  };
  await Promise.all(Array.from({ length: workers }, (_, w) => worker(w)));
  clearInterval(tick);
  if (!alive()) return aiFinish(job, 'cancelled', 'Cancelled');
  if (fatal) { log('ERROR', `AI subtitles: ${fatal}`); return aiFinish(job, 'error', fatal); }

  job.cues = cleanCues(job.cues);                // cross-chunk duplicates and overlaps
  const vtt = cuesToVtt(job.cues);
  if (vtt.length < 20) return aiFinish(job, 'error', 'No speech was detected in this audio track');
  try { fs.writeFileSync(aiCacheFile(job.key), vtt, 'utf-8'); fs.unlinkSync(aiPartFile(job.key)); } catch (e) {}
  job.exportName = aiExport(job, vtt);
  if (!fs.existsSync(aiCacheFile(job.key))) return aiFinish(job, 'error', 'Could not save subtitles');
  log('SYSTEM', `AI subtitles ready: ${path.basename(job.path)} (${job.model}, ${job.lang}${job.translate ? '→en' : ''}, ${job.cues.length} lines)`);
  aiFinish(job, 'done', 'Subtitles ready');
}

function aiParams(src) {
  const r = resolveFile(src.file, VIDEO_EXTS);
  if (r.error) return { error: r.error, status: r.status };
  const audioTrack = String(src.audioTrack || '0:a:0');
  if (!/^0:(a:)?\d+$/.test(audioTrack)) return { error: 'Bad audio track', status: 400 };
  const lang = /^[a-z]{2,3}$|^auto$/.test(String(src.lang || 'auto')) ? String(src.lang || 'auto') : 'auto';
  const translate = src.translate === true || src.translate === '1' || src.translate === 'true';
  const models = listWhisperModels();
  const mode = String(src.mode) === 'quick' ? 'quick' : 'ai';
  // quick = smallest model (fast, rough); ai = the most accurate model that is installed and still practical on a phone
  const model = models.names.includes(String(src.model || '')) ? String(src.model)
    : mode === 'quick' ? (models.names.find((n) => /tiny/.test(n)) || models.names[models.names.length - 1] || '')
      : (models.names.find((n) => /base/.test(n)) || models.names.find((n) => /small/.test(n)) || models.names[0] || '');
  return { r, audioTrack, lang, translate, model, mode, key: aiKeyFor(r, audioTrack, lang, translate, model + (mode === 'quick' ? '|quick' : '')) };
}

app.get('/api/ai/capabilities', (req, res) => {
  const bin = findWhisperBin();
  const models = listWhisperModels();
  res.json({ available: !!bin && models.names.length > 0, bin: !!bin, vad: !!findVadModel(), models: models.names, running: aiPublic(aiRunning), queued: aiQueue.length });
});

app.get('/api/ai/subs', (req, res) => {
  const p = aiParams(req.query);
  if (p.error) return res.status(p.status).json({ error: p.error });
  const job = aiJobs.get(p.key);
  if (job && ['queued', 'extracting', 'transcribing'].includes(job.state)) { const f = parseFloat(req.query.from); if (Number.isFinite(f)) job.from = f; return res.json({ ...aiPublic(job), model: p.model, skipped: Math.round(job.skipped || 0) }); }
  if (fs.existsSync(aiCacheFile(p.key))) return res.json({ key: p.key, state: 'done', pct: 100, msg: 'Subtitles ready', model: p.model, mode: p.mode, name: (aiIndex[p.key] && aiIndex[p.key].name) || niceSubName(String(req.query.file), p.mode), queued: aiQueue.length });
  const st = job && job.state !== 'done' ? job.state : 'none';   // 'done' without a cache file means it was cleared
  res.json({ key: p.key, state: st, pct: 0, msg: job && st !== 'none' ? job.msg : '', model: p.model, queued: aiQueue.length });
});

app.post('/api/ai/subs', (req, res) => {
  if (!findWhisperBin() || !listWhisperModels().names.length) return res.status(501).json({ error: 'whisper.cpp / model not installed (see README)' });
  const p = aiParams(req.body || {});
  if (p.error) return res.status(p.status).json({ error: p.error });
  if (fs.existsSync(aiCacheFile(p.key))) return res.json({ key: p.key, state: 'done', pct: 100 });
  const existing = aiJobs.get(p.key);
  if (existing && ['queued', 'extracting', 'transcribing'].includes(existing.state)) {
    if (req.body && req.body.priority && existing.state === 'queued') { // the episode being watched jumps the queue
      const i = aiQueue.indexOf(p.key); if (i > 0) { aiQueue.splice(i, 1); aiQueue.unshift(p.key); }
    }
    return res.json(aiPublic(existing));
  }
  const job = { from: Math.max(0, parseFloat(req.body.from) || 0), key: p.key, path: p.r.path, relPath: String(req.body.file), audioTrack: p.audioTrack, lang: p.lang, translate: p.translate, mode: p.mode,
    model: p.model, sig: { size: p.r.stat.size, mtimeMs: p.r.stat.mtimeMs }, createdAt: Date.now(), state: 'queued', pct: 0, msg: 'Waiting in queue', duration: 0, proc: null };
  aiJobs.set(p.key, job);
  if (req.body && req.body.priority) aiQueue.unshift(p.key); else aiQueue.push(p.key);
  execFile('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', p.r.path], { timeout: 15000 }, (err, out) => {
    if (!err) job.duration = parseFloat(out) || 0;
    (p.lang === 'auto' ? aiTrackLang(p.r.path, p.audioTrack) : Promise.resolve('')).then((l) => { job.langUsed = l; aiPump(); });
  });
  res.json(aiPublic(job));
});

app.get('/api/ai/subs/vtt', (req, res) => {
  const key = String(req.query.key || '');
  if (!/^[0-9a-f]{40}$/.test(key)) return res.status(400).send('Bad key');
  try {
    res.set('Content-Type', 'text/vtt; charset=utf-8');
    res.set('Cache-Control', 'no-store');
    let body, partial = false;
    try { body = fs.readFileSync(aiCacheFile(key), 'utf-8'); }
    catch (e) { body = fs.readFileSync(aiPartFile(key), 'utf-8'); partial = true; }
    res.set('X-Partial', partial ? '1' : '0');
    res.send(body);
  } catch (e) { res.status(404).send('Not generated yet'); }
});

app.get('/api/ai/subs/download', (req, res) => {
  const key = String(req.query.key || '');
  if (!/^[0-9a-f]{40}$/.test(key)) return res.status(400).send('Bad key');
  const e = aiIndex[key];
  let vtt;
  try { vtt = fs.readFileSync(aiCacheFile(key), 'utf-8'); } catch (err) { return res.status(404).send('Not generated yet'); }
  const fmt = String(req.query.fmt) === 'vtt' ? 'vtt' : 'srt';
  const name = (e && e.name) || key.slice(0, 8);
  res.set('Content-Type', fmt === 'vtt' ? 'text/vtt; charset=utf-8' : 'application/x-subrip; charset=utf-8');
  const ascii = name.replace(/[^\x20-\x7e]/g, '_').replace(/"/g, "'");
  res.set('Content-Disposition', `attachment; filename="${ascii}.${fmt}"; filename*=UTF-8''${encodeURIComponent(name)}.${fmt}`);
  res.send(fmt === 'vtt' ? vtt : vttToSrt(vtt));
});

app.post('/api/ai/subs/cancel', (req, res) => {
  const key = String((req.body && req.body.key) || '');
  const job = aiJobs.get(key);
  if (!job) return res.json({ ok: true });
  if (job.state === 'queued') { aiQueue.splice(aiQueue.indexOf(key), 1); job.state = 'cancelled'; job.msg = 'Cancelled'; }
  else if (job.proc) { job.state = 'cancelled'; aiKillJob(job); }
  res.json({ ok: true });
});

/* All finished/running subtitles for one file, whatever options they were made with. */
app.get('/api/ai/subs/for', (req, res) => {
  const r = resolveFile(String(req.query.file || ''), VIDEO_EXTS);
  if (r.error) return res.status(r.status).json({ error: r.error });
  const items = new Map();
  Object.entries(aiIndex).forEach(([key, e]) => {
    if (e.path === r.path && e.size === r.stat.size && e.mtimeMs === r.stat.mtimeMs && fs.existsSync(aiCacheFile(key))) items.set(key, { key, state: 'done', ...e });
  });
  // legacy files (made before the index existed): recompute the keys of the usual option combinations
  const models = listWhisperModels().names;
  const legacyModels = Array.from(new Set(models.concat(['ggml-base.bin', 'ggml-tiny.bin', 'ggml-small.bin'])));
  ['0:1', '0:2', '0:3', '0:4', '0:a:0', '0:a:1', '0:a:2'].forEach((trk) => ['auto', 'ja', 'en', 'hi', 'ko', 'zh'].forEach((lang) => [false, true].forEach((tr) => legacyModels.forEach((model) => {
    const key = aiKeyFor(r, trk, lang, tr, model);
    if (!items.has(key) && fs.existsSync(aiCacheFile(key))) {
      const e = { path: r.path, size: r.stat.size, mtimeMs: r.stat.mtimeMs, audioTrack: trk, lang, translate: tr, model, lines: 0, created: (fs.statSync(aiCacheFile(key)).mtimeMs) };
      aiIndex[key] = e; items.set(key, { key, state: 'done', ...e });
    }
  }))));
  aiJobs.forEach((j) => { if (j.path === r.path && ['queued', 'extracting', 'transcribing'].includes(j.state)) items.set(j.key, { key: j.key, state: j.state, lang: j.lang, translate: j.translate, model: j.model, audioTrack: j.audioTrack, created: j.createdAt }); });
  res.json({ items: Array.from(items.values()).sort((a, b) => (b.created || 0) - (a.created || 0)) });
});

/* ------------------------------------------------------------------ */
/* Task manager: one list of everything running in the background      */
/* ------------------------------------------------------------------ */
let activeTranscodeFile = '';
function dropThumbQueue() {
  thumbQueue.splice(0).forEach((j) => { (thumbPending.get(j.out) || []).forEach((cb) => { try { cb(new Error('stopped')); } catch (e) {} }); thumbPending.delete(j.out); });
}
app.get('/api/tasks', (req, res) => {
  const tasks = [];
  aiJobs.forEach((j) => {
    const pub = aiPublic(j);
    const live = ['queued', 'extracting', 'transcribing'].includes(j.state);
    tasks.push({ id: 'ai:' + j.key, type: 'ai', title: niceSubName(j.relPath || j.path || '', ''), file: j.relPath, label: j.mode === 'quick' ? 'Quick subtitles' : 'AI subtitles',
      state: j.state, pct: pub.pct, detail: j.state === 'transcribing' ? `Part ${pub.chunk} of ${pub.chunks}${pub.eta != null ? ` \u00b7 ~${Math.max(1, Math.round(pub.eta / 60))} min left` : ''}` : (j.state === 'queued' ? 'Waiting in queue' : (j.msg || '')),
      elapsed: pub.elapsed, eta: pub.eta, last: pub.last, opts: { audioTrack: j.audioTrack, lang: j.lang, translate: !!j.translate }, msg: j.state === 'error' ? j.msg : '', canStop: live, canClear: !live, meta: `${j.model || ''} \u00b7 ${j.lang || 'auto'}${j.translate ? ' \u2192 en' : ''}`, created: j.createdAt || 0 });
  });
  if (activeTranscodeProc) {
    tasks.push({ id: 'transcode', type: 'transcode', title: path.basename(activeTranscodeFile).replace(/\.[^.]+$/, ''), file: activeTranscodeFile, label: 'Live video conversion',
      state: isTranscodeFrozen ? 'paused' : 'running', pct: null, detail: `${transcodeStats.height || ''}p \u00b7 speed ${transcodeStats.speed ? transcodeStats.speed.toFixed(2) + 'x' : '\u2026'}`,
      canStop: true, canClear: false, meta: transcodeStats.quality || '', created: Date.now() });
  }
  if (thumbQueue.length || thumbRunning) {
    tasks.push({ id: 'thumbs', type: 'thumbs', title: 'Thumbnails', label: 'Thumbnail generation', state: 'running', pct: null, detail: `${thumbQueue.length + (thumbRunning ? 1 : 0)} left`, canStop: true, canClear: false, meta: '', created: Date.now() });
  }
  tasks.sort((a, b) => (b.created || 0) - (a.created || 0));
  res.json({ tasks, activeCount: tasks.filter((t) => t.canStop).length });
});
function aiStopKey(key) {
  const job = aiJobs.get(key);
  if (!job) return false;
  if (job.state === 'queued') { const i = aiQueue.indexOf(key); if (i >= 0) aiQueue.splice(i, 1); job.state = 'cancelled'; job.msg = 'Stopped'; return true; }
  if (['extracting', 'transcribing'].includes(job.state)) { job.state = 'cancelled'; job.msg = 'Stopped'; aiKillJob(job); return true; }
  return false;
}
function stopTask(id) {
  if (id === 'transcode') { killTranscode(); return true; }
  if (id === 'thumbs') { dropThumbQueue(); return true; }
  if (id.startsWith('ai:')) return aiStopKey(id.slice(3));
  return false;
}
app.post('/api/tasks/stop', (req, res) => {
  const id = String((req.body && req.body.id) || '');
  if (id === 'all') {
    Array.from(aiJobs.keys()).forEach(aiStopKey); killTranscode(); dropThumbQueue();
    return res.json({ ok: true });
  }
  res.json({ ok: stopTask(id) });
});
app.post('/api/tasks/clear', (req, res) => {          // remove finished entries (keeps the subtitle files)
  Array.from(aiJobs.entries()).forEach(([k, j]) => { if (!['queued', 'extracting', 'transcribing'].includes(j.state)) aiJobs.delete(k); });
  res.json({ ok: true });
});
process.on('exit', () => { try { if (aiRunning) aiKillJob(aiRunning); } catch (e) {} });

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

  markInteractive(8000);
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


/* ---- v1.14 multi-device profile: settings live on the server, every phone/PC that opens this address shares them ---- */
const PROFILE_FILE = path.join(__dirname, 'profile.json');
const PROFILE_KEYS = new Set(['astra_prefs', 'astra_saved_filters', 'astra_video_prefs', 'astra_user_settings']);
let profileData = {};                          // key -> { v: "<json string>", t: ms }
try { profileData = JSON.parse(fs.readFileSync(PROFILE_FILE, 'utf-8')) || {}; } catch (e) { profileData = {}; }
let profileTimer = null;
function profileSave() {
  clearTimeout(profileTimer);
  profileTimer = setTimeout(() => {
    const tmp = PROFILE_FILE + '.tmp';
    fs.writeFile(tmp, JSON.stringify(profileData), 'utf-8', (err) => {
      if (err) return log('ERROR', `Profile save failed (${err.message})`);
      fs.rename(tmp, PROFILE_FILE, (e2) => { if (e2) log('ERROR', `Profile save failed (${e2.message})`); });
    });
  }, 300);
}
app.get('/api/profile', (req, res) => { res.set('Cache-Control', 'no-store'); res.json({ keys: profileData, now: Date.now() }); });
app.post('/api/profile', (req, res) => {
  const ch = (req.body && req.body.changes) || {};
  let n = 0;
  Object.keys(ch).forEach((k) => {
    const c = ch[k];
    if (!PROFILE_KEYS.has(k) || !c || typeof c.v !== 'string' || c.v.length > 512 * 1024) return;
    if (profileData[k] && profileData[k].v === c.v) return;            // nothing new
    profileData[k] = { v: c.v, t: Date.now() };                          // the SERVER clock decides, so a phone with a wrong clock can never lose
    n++;
  });
  if (n) profileSave();
  res.json({ ok: true, updated: n, keys: profileData });
});

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
/* Thumbnails: local cover image if present, else one video frame.     */
/* No internet. Generated one at a time, cached as ~15 KB JPEGs, and   */
/* never generated while a transcode is using the CPU.                 */
/* ------------------------------------------------------------------ */
/* Anything the viewer is waiting on (metadata, playback) outranks background thumbnails. */
let interactiveUntil = 0;
let thumbProc = null;
let thumbAborted = false;
function markInteractive(ms = 10000) {
  interactiveUntil = Date.now() + ms;
  if (thumbProc) { thumbAborted = true; try { thumbProc.kill('SIGKILL'); } catch (e) {} }
}
const THUMB_DIR = path.join(CACHE_DIR, 'thumbs');
try { fs.mkdirSync(THUMB_DIR, { recursive: true }); } catch (e) {}
const THUMB_MAX_BYTES = 80 * 1024 * 1024;
const COVER_NAMES = ['cover', 'poster', 'folder', 'thumb', 'thumbnail', 'front', 'banner', 'art'];
const IMG_EXTS = ['.jpg', '.jpeg', '.png', '.webp'];

function findLocalCover(dir) {
  try {
    const items = fs.readdirSync(dir);
    for (const base of COVER_NAMES) {
      for (const it of items) {
        const ext = path.extname(it).toLowerCase();
        if (IMG_EXTS.includes(ext) && path.basename(it, path.extname(it)).toLowerCase() === base) {
          return path.join(dir, it);
        }
      }
    }
  } catch (e) {}
  return null;
}

function coverFor(videoPath) {
  const dir = path.dirname(videoPath);
  const root = path.resolve(MEDIA_ROOT);
  if (path.resolve(dir) === root) return null;           // loose files: a root cover isn't theirs
  const own = findLocalCover(dir);
  if (own) return own;
  const parent = path.dirname(dir);                      // season folder -> series folder
  return path.resolve(parent) !== root ? findLocalCover(parent) : null;
}

function thumbFileFor(r, kind) {
  const cover = kind === 'series' ? coverFor(r.path) : null;
  let coverSig = '';
  if (cover) { try { const st = fs.statSync(cover); coverSig = `${cover}|${st.size}|${st.mtimeMs}`; } catch (e) {} }
  const key = crypto.createHash('sha1')
    .update(`v3|${kind}|${r.path}|${r.stat.size}|${r.stat.mtimeMs}|${coverSig}`)
    .digest('hex');
  return path.join(THUMB_DIR, `${key}.jpg`);
}

function makeThumb(r, kind, outFile, cb) {
  const tmp = `${outFile}.tmp.jpg`;
  const attempts = [];
  if (kind === 'series') {
    const cover = coverFor(r.path);
    if (cover) attempts.push(['-i', cover]);
  }
  [90, 5].forEach((t) => attempts.push(['-skip_frame', 'nokey', '-ss', String(t), '-i', r.path]));

  let i = 0;
  const next = () => {
    if (i >= attempts.length) return cb(new Error('no frame'));
    const input = attempts[i++];
    thumbProc = execFile('ffmpeg', ['-v', 'error', '-nostdin', '-y', '-threads', '1', ...input,
      '-frames:v', '1', '-an', '-sn',
      '-vf', 'scale=256:144:force_original_aspect_ratio=increase,crop=256:144', '-q:v', '10', tmp],
    { timeout: 20000 }, (err) => {
      thumbProc = null;
      if (thumbAborted) { try { fs.unlinkSync(tmp); } catch (e) {} return cb(new Error('aborted')); }
      let ok = false;
      try { ok = fs.statSync(tmp).size > 800; } catch (e) {}
      if (!err && ok) return fs.rename(tmp, outFile, (e) => cb(e || null));
      try { fs.unlinkSync(tmp); } catch (e) {}
      next();
    });
  };
  next();
}

const thumbQueue = [];
const thumbPending = new Map();
const thumbFailed = new Map();
let thumbRunning = false;

function requestThumb(r, kind, cb) {
  const out = thumbFileFor(r, kind);
  if (fs.existsSync(out)) return cb(null, out);
  const failedAt = thumbFailed.get(out);
  if (failedAt && Date.now() - failedAt < 10 * 60 * 1000) return cb(new Error('previously failed'));
  if (thumbPending.has(out)) { thumbPending.get(out).push(cb); return; }
  if (thumbQueue.length > 300) return cb(new Error('queue full'));
  thumbPending.set(out, [cb]);
  thumbQueue.push({ r, kind, out });
  runThumbs();
}

function runThumbs() {
  if (thumbRunning || thumbQueue.length === 0) return;
  if (transcodeIsLive() || Date.now() < interactiveUntil) { setTimeout(runThumbs, 2500).unref(); return; }
  thumbRunning = true;
  thumbAborted = false;
  const job = thumbQueue.shift();
  makeThumb(job.r, job.kind, job.out, (err) => {
    if (thumbAborted) {                       // yielded to playback: retry later, not a failure
      thumbAborted = false; thumbQueue.unshift(job); thumbRunning = false;
      setTimeout(runThumbs, 2500).unref(); return;
    }
    const waiters = thumbPending.get(job.out) || [];
    thumbPending.delete(job.out);
    if (err) thumbFailed.set(job.out, Date.now());
    else enforceCacheQuota(THUMB_DIR, THUMB_MAX_BYTES);
    waiters.forEach((w) => w(err, err ? null : job.out));
    thumbRunning = false;
    setTimeout(runThumbs, 50).unref();
  });
}

app.get('/api/thumb', (req, res) => {
  const r = resolveFile(req.query.file, VIDEO_EXTS);
  if (r.error) return res.status(r.status).end();
  const kind = req.query.kind === 'series' ? 'series' : 'video';

  // Don't compete with a live transcode, and don't leave browser connections hanging.
  if ((transcodeIsLive() || Date.now() < interactiveUntil) && !fs.existsSync(thumbFileFor(r, kind))) return res.status(204).end();

  requestThumb(r, kind, (err, file) => {
    if (err) return res.status(404).end();
    res.setHeader('Content-Type', 'image/jpeg');
    res.setHeader('Cache-Control', 'public, max-age=604800');
    fs.createReadStream(file).on('error', () => res.end()).pipe(res);
  });
});

app.post('/api/thumbs/clear', (req, res) => {
  let n = 0;
  try {
    fs.readdirSync(THUMB_DIR).forEach((f) => { try { fs.unlinkSync(path.join(THUMB_DIR, f)); n++; } catch (e) {} });
  } catch (e) {}
  thumbFailed.clear();
  res.json({ status: 'cleared', removed: n });
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
