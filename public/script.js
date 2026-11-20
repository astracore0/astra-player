
function formatPlayerTitle(title, epInfo) {
  return `<span style="color: #ffffff;">${title}</span> <span style="color: #9ca3af;">•</span> <span style="color: #3b82f6;">${epInfo}</span>`;
}

'use strict';

/* ---- v1.14 multi-device sync: settings are kept on the server and shared by every device ---- */
const SYNC_KEYS = ['astra_prefs', 'astra_saved_filters', 'astra_video_prefs', 'astra_user_settings'];
const syncStamps = (() => { try { return JSON.parse(localStorage.getItem('astra_sync_t') || '{}') || {}; } catch (e) { return {}; } })();
const rawSet = Storage.prototype.setItem;
function syncStampSave() { try { rawSet.call(localStorage, 'astra_sync_t', JSON.stringify(syncStamps)); } catch (e) {} }
let syncPending = {}, syncTimer = null, syncApplying = false;
const syncDirty = (() => { try { return JSON.parse(localStorage.getItem('astra_sync_d') || '{}') || {}; } catch (e) { return {}; } })();   // changed here, not yet confirmed by the server
function syncDirtySave() { try { rawSet.call(localStorage, 'astra_sync_d', JSON.stringify(syncDirty)); } catch (e) {} }
function syncPush() {
  syncTimer = null;
  const changes = syncPending; syncPending = {};
  if (!Object.keys(changes).length) return;
  fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes }), keepalive: true })
    .then((r) => r.json()).then((d) => { Object.keys(changes).forEach((k) => { if (d.keys && d.keys[k] && d.keys[k].v === changes[k].v) syncStamps[k] = d.keys[k].t; delete syncDirty[k]; }); syncStampSave(); syncDirtySave(); })
    .catch(() => {
    Object.keys(changes).forEach((k) => { if (!syncPending[k]) syncPending[k] = changes[k]; });       // retry with the next change
  });
}
Storage.prototype.setItem = function (k, v) {
  rawSet.call(this, k, v);
  if (this === localStorage && !syncApplying && SYNC_KEYS.includes(k)) {
    syncPending[k] = { v: String(v) }; syncDirty[k] = 1; syncDirtySave();
    clearTimeout(syncTimer); syncTimer = setTimeout(syncPush, 600);
  }
};
// Adopt whatever is newer on the server; send up whatever this device has that is newer. Returns true if local data changed.
function syncMerge(keys) {
  let changed = false; const up = {};
  syncApplying = true;
  SYNC_KEYS.forEach((k) => {
    const sv = keys[k], lt = syncStamps[k] || 0, lv = localStorage.getItem(k);
    if (sv && sv.t > lt && !syncDirty[k]) { if (lv !== sv.v) { rawSet.call(localStorage, k, sv.v); changed = true; } syncStamps[k] = sv.t; }
    else if (lv !== null && (!sv || sv.v !== lv)) up[k] = { v: lv };
    else if (sv && sv.v === lv) delete syncDirty[k];
  });
  syncApplying = false; syncStampSave();
  if (Object.keys(up).length) fetch('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ changes: up }) })
    .then((r) => r.json()).then((d) => { Object.keys(up).forEach((k) => { if (d.keys && d.keys[k]) syncStamps[k] = d.keys[k].t; delete syncDirty[k]; }); syncStampSave(); syncDirtySave(); }).catch(() => {});
  return changed;
}
window.addEventListener('pagehide', () => { if (Object.keys(syncPending).length) syncPush(); });
window.syncFlush = () => { if (Object.keys(syncPending).length) syncPush(); };
(function syncStart() {                       // blocking on purpose: settings must be in place before the page reads them
  try {
    const x = new XMLHttpRequest(); x.open('GET', '/api/profile', false); x.send();
    if (x.status === 200) syncMerge(JSON.parse(x.responseText).keys || {});
  } catch (e) {}
})();

const $ = (id) => document.getElementById(id);

const video = $('videoElement');
const glCanvas = $('glCanvas');
const playerWrapper = $('playerWrapper');
const topOverlay = $('topOverlay');
const bottomOverlay = $('bottomOverlay');
const timelineSlider = $('timelineSlider');
const trackPlayed = $('trackPlayed');
const trackBuffer = $('trackBuffer');
const timeLabel = $('timeLabel');
const playBtn = $('playBtn');
const playIconSvg = $('playIconSvg');
const volBtn = $('volBtn');
const volIconSvg = $('volIconSvg');
const rwBtn = $('rwBtn');
const ffBtn = $('ffBtn');
const fsBtn = $('fsBtn');
const lockBtn = $('lockBtn');
const playerCurrentTitle = $('playerCurrentTitle');
const playerCurrentFolder = $('playerCurrentFolder');
const playerResBadge = $('playerResBadge');
const streamModeBadge = $('streamModeBadge');
const sourceModePill = $('sourceModePill');
const playerDurationBadge = $('playerDurationBadge');
const settingsBtn = $('settingsBtn');
const settingsModal = $('settingsModal');
const manualCenterPlay = $('manualCenterPlay');
const bigPlayBtn = $('bigPlayBtn');
const mainTrack = $('mainTrack');
const playerBufferingIndicator = $('playerBufferingIndicator');
const probeLoadingText = $('probeLoadingText');
const subDisplayBox = $('subDisplayBox');

const heroTitle = $('heroTitle');
const heroSynopsis = $('heroSynopsis');
const heroProgressPill = $('heroProgressPill');
const heroResumeBtn = $('heroResumeBtn');
const heroResumeLabel = $('heroResumeLabel');

const audioTrackList = $('audioTrackList');
const subTrackList = $('subTrackList');
const ramGraphCanvas = $('ramGraphCanvas');
const ramStatsText = $('ramStatsText');

const playerEpisodesDrawer = $('playerEpisodesDrawer');
const floatingEpisodesBtn = $('floatingEpisodesBtn');
const closeEpisodesDrawerBtn = $('closeEpisodesDrawerBtn');
const episodesDrawerList = $('episodesDrawerList');
const epDrawerFolderName = $('epDrawerFolderName');
const playerInlinePlaylist = $('playerInlinePlaylist');
const playerShelfTitle = $('playerShelfTitle');

const seriesCardsGrid = $('seriesCardsGrid');
const historyGrid = $('historyGrid');
const homeQuickSearch = $('homeQuickSearch');

const storagePathInputField = $('storagePathInputField');
const btnGoPathInput = $('btnGoPathInput');
const subPickerPathInputField = $('subPickerPathInputField');
const btnGoSubPickerInput = $('btnGoSubPickerInput');

const rngSubDelay = $('rngSubDelay');
const eqBassSlider = $('eqBass');
const eqTrebleSlider = $('eqTreble');

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */
let fullLibrary = {};
let libraryRoot = '';
let currentPathTokens = [];
let currentVideoList = [];
let activeVideoPath = '';
let historyCache = {};
let currentExplicitDuration = 0;
let currentVideoFps = 0;
let lastRecordedTime = 0;
let currentBrowsingDir = '';
let currentParentDir = '';
let activeAudioStreamIndex = '0:a:0';
let isTranscodingMode = false;
const TC_SID = Math.random().toString(36).slice(2, 10);   // identifies THIS page's stream to the server
let transcodeBaseOffset = 0;
let isCurrentFile10Bit = false;   // true = the transcoder must re-encode the picture (real 10-bit, or compatibility mode)
let sourceIs10Bit = false;        // what the FILE really is (used for the 8-bit/10-bit readout)
let compatMode = false;
let nativeFallbackTried = false;
let preferredDefaultLang = 'auto';
let preferredSubLang = '';
let isScreenLocked = false;
let isScrubbing = false;
let currentView = '';
let playToken = 0;
let sessionRestoreDone = false;
let subsOn = false;
let subDelay = 0;          // seconds; + = subtitles appear later
let playbackSpeed = 1;
const PREF_DEFAULTS = { v: 4, networkMode: "offline", thumbQuality: "360p", seekStep: 10, quality: 'auto', lite: 'auto', anim: true, preBuffer: 0, preBufMB8: 0, preBufMB10: 0, autoPlay: true, autoSkip: false, autoNext: true, thumbs: true, fsRotate: true, fsFill: false, hwEnc: 'off' };
const prefs = Object.assign({}, PREF_DEFAULTS);
try {
  const saved = JSON.parse(localStorage.getItem('astra_prefs') || '{}');
  // v3: back to the v1.3 transcoder defaults (720p software x264, no pre-buffer wait) once.
  if (saved.v !== 4) { delete saved.quality; delete saved.preBuffer; delete saved.hwEnc; }
  Object.assign(prefs, saved);
} catch (e) {}
// v2: fullscreen always goes landscape by default (the old default was off)
if (prefs.v !== 2 && prefs.v !== 4) { prefs.fsRotate = true; prefs.v = 2; try { localStorage.setItem('astra_prefs', JSON.stringify(prefs)); } catch (e) {} }
function savePrefs() { try { localStorage.setItem('astra_prefs', JSON.stringify(prefs)); } catch (e) {} }
let internalPause = false;
let qualityOverride = null;
// Auto resolution mode: start at 720p, step down when the phone cannot decode in real time.
const AUTO_LEVELS = ['balanced', 'fast', 'low'];
let autoLevel = 0;
function effectiveQuality() { return qualityOverride || (prefs.quality === 'auto' ? AUTO_LEVELS[autoLevel] : prefs.quality); }
// 10-bit HEVC is re-encoded live: always keep a 5 s head start so playback does not stutter right away.
// Pre-buffer is set in memory (MB); the player turns it into seconds using this video's own data rate.
let currentFileBytes = 0;
const TC_BYTES_PER_SEC = { low: 90e3, fast: 150e3, balanced: 250e3, quality: 500e3, fhd: 1e6, qhd: 1.6e6, uhd: 2.3e6 };
function estBytesPerSec() {
  const tc = isTranscodingMode && isCurrentFile10Bit;
  if (tc) return TC_BYTES_PER_SEC[effectiveQuality()] || 250e3;
  const d = getDuration && getDuration();
  return currentFileBytes > 0 && d > 0 ? currentFileBytes / d : 450e3;            // typical 720p anime when no file is open
}
function bufSeconds(mb, tc) {
  const bps = tc ? (TC_BYTES_PER_SEC[effectiveQuality()] || 250e3) : estBytesPerSec();
  return mb > 0 ? Math.min(600, (mb * 1048576) / bps) : 0;
}
function needBuf() {
  const tc = isTranscodingMode && isCurrentFile10Bit;
  const sec = bufSeconds(tc ? prefs.preBufMB10 : prefs.preBufMB8, tc);
  return tc ? Math.max(5, sec) : Math.min(sec, 20);            // 8-bit is light: never hold playback back for long
}
let startWatch = null;
let sleepTimerId = null;
let sleepAtEnd = false;

let audioCtx = null, audioSrcNode = null, delayNode = null, bassFilter = null, trebleFilter = null;
let currentAudioOffset = 0.0;
let eqOn = true, eqBands = [0, 0, 0, 0, 0], eqBoost = 0, eqVirt = 0, eqReverb = 'none', eqPreset = 'flat';
let eqNodes = [], eqBoostNode = null, fxSplit = null, fxMerge = null, fxGain = {}, fxDry = null, fxWet = null, fxMaster = null, fxConv = null, fxConvWired = false;

/* ------------------------------------------------------------------ */
/* Small helpers                                                       */
/* ------------------------------------------------------------------ */
function escapeHtml(str) {
  return String(str == null ? '' : str).replace(/[&<>"']/g, (c) => (
    { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]
  ));
}

function lsGet(key) {
  try { return localStorage.getItem(key); } catch (e) { return null; }
}
function lsSet(key, value) {
  try { localStorage.setItem(key, value); } catch (e) { /* storage full / blocked */ }
}
function lsRemove(key) {
  try { localStorage.removeItem(key); } catch (e) {}
}

/* Per-episode memory: chosen subtitle and subtitle delay, kept for the last 300 episodes */
const VP_KEY = 'astra_video_prefs';
function vpAll() { try { return JSON.parse(lsGet(VP_KEY) || '{}') || {}; } catch (e) { return {}; } }
function vpGet(p) { return (p && vpAll()[p]) || {}; }
function vpSet(p, patch) {
  if (!p) return;
  const all = vpAll();
  all[p] = Object.assign({}, all[p], patch, { t: Date.now() });
  const keys = Object.keys(all);
  if (keys.length > 300) keys.sort((a, b) => (all[a].t || 0) - (all[b].t || 0)).slice(0, keys.length - 300).forEach((k) => delete all[k]);
  lsSet(VP_KEY, JSON.stringify(all));
}

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

let toastTimer = null;
/* toast colours v2 */
// ok = green (done), warn = yellow (careful / nothing happened), err = red (failed), info = theme blue (working / neutral)
function toastKind(msg) {
  const m = String(msg).toLowerCase();
  if (/online mode|offline mode/.test(m)) return 'info';
  if (/built-in tracks|nothing to remove|pick a subtitle|froze|ended early|no subtitle|last episode|first episode|switching to|drag the/.test(m)) return 'warn';
  if (/fail|error|could not|couldn.t|cannot|can.t|not found|not reachable|unreachable|rejected|denied|refused|no space|no video data|crash|went wrong/.test(m)) return 'err';
  if (/warn|slow|retry|retrying|busy|waiting|missing|needs|please|not set|cleared|removed|deleted|cancel|stopp|paused|heavy|no internet|offline|animations off|key removed|\boff\b/.test(m)) return 'warn';
  if (/saved|copied|generated|attached|added|rescanned|root set|found|queued|animations on|synchron|updated|applied|enabled|done|ready|complete|success|\bon\b/.test(m)) return 'ok';
  return 'info';
}

function formatOldEnglishNotice(rawMsg) {
  const s = String(rawMsg || '').trim();
  const low = s.toLowerCase();

  const rules = [
    [/subtitle could not be loaded/i, 'Failed to load the subtitle', 'The requested subtitle scroll could not be retrieved.'],
    [/loading subtitle/i, 'Summoning the subtitle scroll', 'Preparing text synchronization for this chapter.'],
    [/subtitle saved/i, 'Subtitle scroll inscribed', 'Saved safely unto thy local storage (.srt).'],
    [/subtitle removed/i, 'Subtitle scroll banished', 'Removed from the active reel.'],
    [/subtitle attached/i, 'Subtitle scroll bound', 'External text track linked to this motion picture.'],
    [/subtitles generated/i, 'Transcription hath concluded', 'All spoken lines have been inscribed successfully.'],
    [/subtitle generation failed/i, 'Failed to transcribe speech', 'The scribe encountered an error whilst listening.'],
    [/subtitle delay/i, 'Subtitle timing adjusted', s],
    [/drag the white handle/i, 'Grasp the white orb to seek', 'Direct tapping upon the bar is warded against misclicks.'],
    [/this is the last episode/i, 'Thou hast reached the final chapter', 'No further episodes remain within this tome.'],
    [/this is the first episode/i, 'Thou art at the very beginning', 'No prior episodes precede this chapter.'],
    [/watch history cleared/i, 'Chronicles wiped clean', 'All prior watch records have been expunged.'],
    [/library rescanned/i, 'Archives surveyed anew', s.replace(/^Library rescanned\s*[—-]\s*/i, '')],
    [/media root set/i, 'Sanctuary root appointed', s.replace(/^Media root set\s*[—-]\s*/i, '')],
    [/tv link copied/i, 'Vessel address copied', 'Paste this link into thy Smart TV browser to begin.'],
    [/device scan failed/i, 'Scouting the realm failed', 'Unable to survey nearby network vessels.'],
    [/playback failed/i, 'Failed to render motion picture', 'The file may be missing or of an unyielding format.'],
    [/format not supported natively/i, 'Engaging live transmutation', 'Native playback failed; converting stream via engine.'],
    [/no picture from this video/i, 'Engaging visual transmutation', 'Audio detected without picture; converting stream.'],
    [/picture froze/i, 'Mending frozen frame', 'Restarting the stream to restore smooth motion.'],
    [/stream ended early/i, 'The stream halted prematurely', 'Seek slightly or press Play to resume thy journey.'],
    [/could not reach the server/i, 'The server doth not answer', 'Verify thy local host connection and try once more.'],
    [/thumbnail cache cleared/i, 'Portraits purged', 'All cached thumbnails have been cleared.'],
    [/settings updated from another device/i, 'Configuration synchronized', 'Updated preferences received from a companion device.'],
    [/saved filter/i, 'Visual filter preserved', s],
    [/filter:/i, 'Visual filter applied', s],
    [/speed /i, 'Tempo altered', s],
    [/animations on/i, 'Motion flourishes enabled', 'Interface transitions are now active.'],
    [/animations off/i, 'Motion flourishes quelled', 'Reduced motion for swifter performance.'],
    [/online ai saved/i, 'Cloud scribe configured', 'Thy API credentials have been safely stored.'],
    [/key removed/i, 'Credentials expunged', 'API key removed; local scribe shall be used.'],
    [/sleep timer: paused/i, 'Slumber timer elapsed', 'Playback hath been paused as thou commanded.'],
    [/skipped /i, 'Chapter bypassed', s]
  ];

  for (const [re, title, sub] of rules) {
    if (re.test(s)) return { title, sub };
  }

  // Fallback for any other dynamic message
  if (low.includes('failed') || low.includes('could not') || low.includes('error')) {
    return { title: s, sub: 'An unforeseen fault occurred during this task.' };
  }
  return { title: s, sub: 'Astra Player system notice' };
}

function showToast(message, ms = 3400, kind) {
  let el = $('astraToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'astraToast';
    el.className = 'astra-toast';
    el.setAttribute('role', 'status');
    el.innerHTML = '<div class="at-title"></div><div class="at-sub"></div><div class="at-bar-wrap"><i class="at-bar"></i></div>';
  }
  const host = toastHost();
  if (el.parentNode !== host) host.appendChild(el);

  const { title, sub } = formatOldEnglishNotice(message);
  el.querySelector('.at-title').textContent = title;
  el.querySelector('.at-sub').textContent = sub;

  const k = kind || toastKind(message);
  el.dataset.kind = k;

  const bar = el.querySelector('.at-bar');
  el.classList.remove('show');
  bar.style.animation = 'none';
  void el.offsetWidth;
  bar.style.animation = `atBar ${ms}ms linear forwards`;
  el.classList.add('show');

  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.classList.remove('show'), ms);
}

function formatTime(s) {
  if (!Number.isFinite(s) || s <= 0) return '00:00';
  const total = Math.floor(s);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60).toString().padStart(2, '0');
  const sec = (total % 60).toString().padStart(2, '0');
  return h > 0 ? `${h}:${m}:${sec}` : `${m}:${sec}`;
}

/* "[AWI] Darling in the FranXX - S01E22 [720p] [Multi-Audio]" -> { title, season, ep, tags } */
function parseMedia(fileName) {
  const base = String(fileName || '').replace(/\.(mp4|mkv|webm|avi|mov|ts|m4v)$/i, '');
  const tags = [];
  base.replace(/[\[(]([^\])]{2,40})[\])]/g, (m, inner) => {
    if (/\d{3,4}p|audio|dub|\bsubs?\b|hevc|x26[45]|10.?bit|web|bd|blu|hdr/i.test(inner) && !/^\s*s\d+\s*e\d+\s*$/i.test(inner)) tags.push(inner.trim());
    return m;
  });
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
    .replace(/[\[\]()]/g, ' ').replace(/\s[-\u2013:]\s/g, ' ').replace(/[\s\-\u2013:]+$/g, '').replace(/^[\s\-\u2013:]+/g, '').replace(/\s+/g, ' ').trim();
  if (!title) title = base.replace(/[\[\]()._]+/g, ' ').replace(/\s+/g, ' ').trim();
  return { title, season, ep, tags };
}
function cleanMediaTitle(fileName) {
  if (!fileName) return 'Unknown Title';
  const p = parseMedia(fileName);
  const pad = (n) => String(n).padStart(2, '0');
  const label = p.ep == null ? '' : (p.season != null ? ` \u00b7 S${pad(p.season)}E${pad(p.ep)}` : ` \u00b7 Ep ${p.ep}`);
  return (p.title || 'Unknown Title') + label;
}

// Real duration in seconds, or 0 when unknown (fragmented MP4 reports Infinity).
function getDuration() {
  const d = currentExplicitDuration || video.duration;
  return Number.isFinite(d) && d > 0 ? d : 0;
}

// Playback position in the original file (transcoded streams restart at 0).
function absoluteTime() {
  return isTranscodingMode ? (transcodeBaseOffset + video.currentTime) : video.currentTime;
}

/* ------------------------------------------------------------------ */
/* Web Audio (A/V offset + EQ)                                         */
/* ------------------------------------------------------------------ */
// Once a media element is routed through Web Audio it is silent while the
// AudioContext is suspended, so every user gesture / play event resumes it.
function resumeAudio() {
  if (audioCtx && audioCtx.state === 'suspended') audioCtx.resume().catch(() => {});
}
['pointerdown', 'keydown', 'touchend'].forEach((evt) => {
  document.addEventListener(evt, resumeAudio, { passive: true });
});

// The Web Audio chain (delay + EQ) costs CPU on every audio frame, so it is only built when it is really used.
/* ===== Sound engine: 5-band equalizer, bass boost, virtualizer, reverb ===== */
const EQ_BANDS = [60, 230, 910, 3600, 14000];
const EQ_PRESETS = {
  flat: [0, 0, 0, 0, 0], normal: [3, 0, 0, 0, 3], classical: [5, 3, -2, 4, 4], dance: [6, 0, 2, 4, 1],
  pop: [-1, 2, 5, 1, -2], rock: [5, 3, -1, 3, 5], jazz: [4, 2, -2, 2, 5], hiphop: [5, 3, 0, 1, 3],
  bass: [8, 5, 0, -1, -2], vocal: [-3, -1, 4, 4, 1], cinema: [5, 2, -1, 3, 4]
};
const EQ_PRESET_NAMES = {
  custom: 'Custom', flat: 'Flat', normal: 'Normal', classical: 'Classical', dance: 'Dance', pop: 'Pop',
  rock: 'Rock', jazz: 'Jazz', hiphop: 'Hip Hop', bass: 'Bass', vocal: 'Vocal', cinema: 'Cinema'
};
// Short impulses only: long convolution is heavy on weak phones
const REVERBS = { none: null, room: { sec: 0.5, decay: 3 }, hall: { sec: 1.6, decay: 2.5 }, plate: { sec: 1.0, decay: 4 } };
const fxImpulses = {};

function fxImpulse(key) {
  if (fxImpulses[key]) return fxImpulses[key];
  const cfg = REVERBS[key], rate = audioCtx.sampleRate, len = Math.max(1, Math.floor(rate * cfg.sec));
  const buf = audioCtx.createBuffer(2, len, rate);
  for (let c = 0; c < 2; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, cfg.decay);
  }
  return (fxImpulses[key] = buf);
}

function eqActive() {
  return eqOn && (eqBands.some(Boolean) || eqBoost > 0 || eqVirt > 0 || eqReverb !== 'none');
}

function initWebAudio(force) {
  if (audioCtx) { resumeAudio(); return; }
  if (!force && !currentAudioOffset && !eqActive()) return;
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioSrcNode = audioCtx.createMediaElementSource(video);

    delayNode = audioCtx.createDelay(10.0);
    delayNode.delayTime.value = Math.max(0, currentAudioOffset);

    eqNodes = EQ_BANDS.map((f, i) => {
      const n = audioCtx.createBiquadFilter();
      n.type = i === 0 ? 'lowshelf' : (i === EQ_BANDS.length - 1 ? 'highshelf' : 'peaking');
      n.frequency.value = f;
      if (n.type === 'peaking') n.Q.value = 1;
      n.gain.value = 0;
      return n;
    });
    eqBoostNode = audioCtx.createBiquadFilter();
    eqBoostNode.type = 'lowshelf';
    eqBoostNode.frequency.value = 140;
    eqBoostNode.gain.value = 0;

    fxSplit = audioCtx.createChannelSplitter(2);
    fxMerge = audioCtx.createChannelMerger(2);
    fxGain = { ll: audioCtx.createGain(), rl: audioCtx.createGain(), lr: audioCtx.createGain(), rr: audioCtx.createGain() };
    fxDry = audioCtx.createGain();
    fxWet = audioCtx.createGain(); fxWet.gain.value = 0;
    fxMaster = audioCtx.createGain();

    let prev = audioSrcNode;
    [delayNode, ...eqNodes, eqBoostNode, fxSplit].forEach((n) => { prev.connect(n); prev = n; });
    fxSplit.connect(fxGain.ll, 0); fxSplit.connect(fxGain.lr, 0);   // left channel
    fxSplit.connect(fxGain.rl, 1); fxSplit.connect(fxGain.rr, 1);   // right channel
    fxGain.ll.connect(fxMerge, 0, 0); fxGain.rl.connect(fxMerge, 0, 0);
    fxGain.lr.connect(fxMerge, 0, 1); fxGain.rr.connect(fxMerge, 0, 1);
    fxMerge.connect(fxDry); fxDry.connect(fxMaster);
    fxWet.connect(fxMaster);
    fxMaster.connect(audioCtx.destination);
    applyAudioFx();
  } catch (e) {
    console.error('Audio effects failed', e);
    // never leave the video silent if the graph could not be built
    try { audioSrcNode.disconnect(); audioSrcNode.connect(audioCtx.destination); } catch (_) {}
  }
  resumeAudio();
}

function applyAudioFx() {
  if (!audioCtx || !fxMaster) return;
  const t = audioCtx.currentTime, on = eqOn;
  eqNodes.forEach((n, i) => n.gain.setTargetAtTime(on ? eqBands[i] : 0, t, 0.02));
  const boostDb = on ? (eqBoost / 100) * 12 : 0;
  eqBoostNode.gain.setTargetAtTime(boostDb, t, 0.02);

  // Virtualizer = stereo widening (mid/side). k = 1 leaves the sound untouched.
  const k = on ? 1 + (eqVirt / 100) * 1.8 : 1, a = (1 + k) / 2, b = (1 - k) / 2;
  fxGain.ll.gain.setTargetAtTime(a, t, 0.02); fxGain.rr.gain.setTargetAtTime(a, t, 0.02);
  fxGain.lr.gain.setTargetAtTime(b, t, 0.02); fxGain.rl.gain.setTargetAtTime(b, t, 0.02);

  // Reverb: the convolver is only connected while a reverb is selected
  const rv = on ? REVERBS[eqReverb] : null;
  if (rv) {
    if (!fxConv || fxConv._key !== eqReverb) {
      if (fxConv) { try { fxMerge.disconnect(fxConv); } catch (_) {} try { fxConv.disconnect(); } catch (_) {} }
      fxConv = audioCtx.createConvolver();
      fxConv.buffer = fxImpulse(eqReverb);
      fxConv._key = eqReverb;
      fxConvWired = false;
    }
    if (!fxConvWired) { fxMerge.connect(fxConv); fxConv.connect(fxWet); fxConvWired = true; }
    fxWet.gain.setTargetAtTime(0.4, t, 0.05);
    fxDry.gain.setTargetAtTime(0.85, t, 0.05);
  } else {
    fxWet.gain.setTargetAtTime(0, t, 0.05);
    fxDry.gain.setTargetAtTime(1, t, 0.05);
    if (fxConv && fxConvWired) {
      setTimeout(() => {
        if (REVERBS[eqReverb] && eqOn) return;
        try { fxMerge.disconnect(fxConv); } catch (_) {}
        fxConvWired = false;
      }, 400);
    }
  }

  // Headroom so boosted sound does not clip
  const peak = on ? Math.max(0, ...eqBands) : 0, virtDb = on ? (eqVirt / 100) * 3 : 0;
  const head = Math.min(14, (peak + boostDb) * 0.6 + virtDb);
  fxMaster.gain.setTargetAtTime(Math.pow(10, -head / 20), t, 0.03);
}

const rngAudioOffset = $('rngAudioOffset');
if (rngAudioOffset) {
  rngAudioOffset.addEventListener('input', (e) => {
    initWebAudio(true);
    currentAudioOffset = parseFloat(e.target.value);
    $('lblAudioOffset').textContent = `${currentAudioOffset > 0 ? '+' : ''}${currentAudioOffset.toFixed(2)}s`;
    if (delayNode) {
      delayNode.delayTime.value = Math.max(0, currentAudioOffset);
    }
    saveCurrentSettings();
  });
}

/* ===== Theme sliders: fill + stepper buttons ===== */
function setRangeFill(r) {
  const min = parseFloat(r.min) || 0, max = parseFloat(r.max);
  const span = (isNaN(max) ? 100 : max) - min;
  r.style.setProperty('--p', (span ? (parseFloat(r.value) - min) / span : 0).toFixed(4));
}
function syncRanges() { document.querySelectorAll('input.custom-range').forEach(setRangeFill); }
function stepRange(r, dir) {
  if (dir > 0) r.stepUp(); else r.stepDown();
  r.dispatchEvent(new Event('input', { bubbles: true }));
  r.dispatchEvent(new Event('change', { bubbles: true }));
}
function makeStepBtn(r, dir) {
  const b = document.createElement('button');
  b.type = 'button'; b.className = 'rng-btn';
  b.textContent = dir > 0 ? '+' : '−';
  b.setAttribute('aria-label', dir > 0 ? 'Increase' : 'Decrease');
  b.onclick = () => stepRange(r, dir);
  return b;
}
document.addEventListener('input', (e) => {
  if (e.target && e.target.matches && e.target.matches('input.custom-range')) setRangeFill(e.target);
}, true);
new MutationObserver(() => { if (settingsModal.classList.contains('open')) syncRanges(); })
  .observe(settingsModal, { attributes: true, attributeFilter: ['class'] });

/* ===== Round knob (Bass Boost / Virtualizer) ===== */
function makeKnob(el, label, onChange) {
  const R = 48, C = 60;
  const pt = (deg) => { const r = deg * Math.PI / 180; return [C + R * Math.cos(r), C + R * Math.sin(r)]; };
  const [sx, sy] = pt(135), [ex, ey] = pt(405);
  el.classList.add('knob');
  el.tabIndex = 0;
  el.setAttribute('role', 'slider');
  el.setAttribute('aria-label', label);
  el.setAttribute('aria-valuemin', '0');
  el.setAttribute('aria-valuemax', '100');
  el.innerHTML = '<svg viewBox="0 0 120 120" aria-hidden="true"><circle class="k-disc" cx="60" cy="60" r="40"/>' +
    '<path class="k-bg" d="M' + sx + ' ' + sy + ' A' + R + ' ' + R + ' 0 1 1 ' + ex + ' ' + ey + '"/>' +
    '<path class="k-fg" d=""/><circle class="k-dot" r="7" cx="' + sx + '" cy="' + sy + '"/></svg>' +
    '<div class="knob-center"><b class="knob-val">0%</b><span class="knob-lbl">' + label + '</span></div>';
  const fg = el.querySelector('.k-fg'), dot = el.querySelector('.k-dot'), txt = el.querySelector('.knob-val');
  let value = 0;
  function paint(v) {
    value = clamp(Math.round(v), 0, 100);
    const ang = 270 * value / 100, p = pt(135 + ang);
    fg.setAttribute('d', ang < 1 ? '' : 'M' + sx + ' ' + sy + ' A' + R + ' ' + R + ' 0 ' + (ang > 180 ? 1 : 0) + ' 1 ' + p[0] + ' ' + p[1]);
    dot.setAttribute('cx', p[0]); dot.setAttribute('cy', p[1]);
    txt.textContent = value + '%';
    el.setAttribute('aria-valuenow', String(value));
  }
  function fromPointer(e) {
    const r = el.getBoundingClientRect();
    const deg = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
    let a = (deg - 135 + 360) % 360;
    if (a > 270) a = a < 315 ? 270 : 0;     // gap at the bottom snaps to the nearest end
    paint(a / 270 * 100);
    onChange(value);
  }
  let drag = false;
  el.addEventListener('pointerdown', (e) => { drag = true; try { el.setPointerCapture(e.pointerId); } catch (_) {} fromPointer(e); });
  el.addEventListener('pointermove', (e) => { if (drag) fromPointer(e); });
  const end = () => { drag = false; };
  el.addEventListener('pointerup', end); el.addEventListener('pointercancel', end);
  el.addEventListener('keydown', (e) => {
    const d = (e.key === 'ArrowRight' || e.key === 'ArrowUp') ? 5 : (e.key === 'ArrowLeft' || e.key === 'ArrowDown') ? -5 : 0;
    if (!d) return;
    e.preventDefault(); paint(value + d); onChange(value);
  });
  paint(0);
  return { set: paint };
}

/* ===== Equalizer UI ===== */
let eqKnobBoost = null, eqKnobVirt = null;
const eqHz = (f) => (f >= 1000 ? (f / 1000) + 'k' : f) + ' Hz';

function syncEqUi() {
  EQ_BANDS.forEach((f, i) => {
    const r = $('eqBand' + i);
    if (r) { r.value = eqBands[i]; setRangeFill(r); }
    const v = $('eqVal' + i);
    if (v) v.textContent = eqBands[i] + ' dB';
  });
  document.querySelectorAll('[data-eqp]').forEach((b) => b.classList.toggle('active', b.dataset.eqp === eqPreset));
  const on = $('eqOn');
  if (on) on.checked = eqOn;
  if ($('lblEqOn')) $('lblEqOn').textContent = eqOn ? 'On' : 'Off';
  if ($('eqCard')) $('eqCard').classList.toggle('off', !eqOn);
  if ($('eqReverb')) $('eqReverb').value = eqReverb;
  if (eqKnobBoost) eqKnobBoost.set(eqBoost);
  if (eqKnobVirt) eqKnobVirt.set(eqVirt);
}

function eqChanged() {
  initWebAudio(true);
  applyAudioFx();
  syncEqUi();
  saveCurrentSettings();
}

function buildEqUi() {
  const bands = $('eqBands'), presets = $('eqPresets');
  if (!bands || !presets) return;

  presets.innerHTML = '';
  Object.keys(EQ_PRESET_NAMES).forEach((k) => {
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'chip-preset'; b.dataset.eqp = k; b.textContent = EQ_PRESET_NAMES[k];
    b.onclick = () => {
      if (k !== 'custom') eqBands = EQ_PRESETS[k].slice();
      eqPreset = k;
      eqChanged();
    };
    presets.appendChild(b);
  });

  bands.innerHTML = '';
  EQ_BANDS.forEach((f, i) => {
    const col = document.createElement('div');
    col.className = 'vsl';
    col.innerHTML = '<span class="vsl-val" id="eqVal' + i + '">0 dB</span>' +
      '<div class="vsl-wrap"><input type="range" class="custom-range" id="eqBand' + i + '" min="-12" max="12" step="1" value="0" aria-label="' + eqHz(f) + ' gain"></div>' +
      '<span class="vsl-hz">' + eqHz(f) + '</span>';
    const r = col.querySelector('input');
    col.insertBefore(makeStepBtn(r, 1), col.querySelector('.vsl-wrap'));
    col.insertBefore(makeStepBtn(r, -1), col.querySelector('.vsl-hz'));
    r.addEventListener('input', () => {
      eqBands[i] = parseInt(r.value, 10) || 0;
      eqPreset = 'custom';
      eqChanged();
    });
    bands.appendChild(col);
  });

  if ($('eqOn')) $('eqOn').addEventListener('change', (e) => { eqOn = e.target.checked; eqChanged(); });
  if ($('eqReverb')) $('eqReverb').addEventListener('change', (e) => { eqReverb = e.target.value; eqChanged(); });
  if ($('knobBoost')) eqKnobBoost = makeKnob($('knobBoost'), 'Bass Boost', (v) => { eqBoost = v; eqChanged(); });
  if ($('knobVirt')) eqKnobVirt = makeKnob($('knobVirt'), 'Virtualizer', (v) => { eqVirt = v; eqChanged(); });
  syncEqUi();
}

// Older code / saved data used a 2-band bass + treble model
function applyEq(bass, treble, preset) {
  eqBands[0] = clamp(Math.round(Number(bass) || 0), -12, 12);
  eqBands[4] = clamp(Math.round(Number(treble) || 0), -12, 12);
  eqPreset = EQ_PRESET_NAMES[preset] ? preset : 'custom';
  applyAudioFx(); syncEqUi();
}

function eqSettings() {
  return { eqOn, eqBands: eqBands.slice(), eqBoost, eqVirt, eqReverb, eqPreset };
}

function loadEqFromSaved(s) {
  if (Array.isArray(s.eqBands) && s.eqBands.length === EQ_BANDS.length) {
    eqBands = s.eqBands.map((v) => clamp(Math.round(Number(v) || 0), -12, 12));
  } else {
    eqBands = [0, 0, 0, 0, 0];
    eqBands[0] = clamp(Math.round(Number(s.eqBass) || 0), -12, 12);
    eqBands[4] = clamp(Math.round(Number(s.eqTreble) || 0), -12, 12);
  }
  eqOn = s.eqOn !== false;
  eqBoost = clamp(Math.round(Number(s.eqBoost) || 0), 0, 100);
  eqVirt = clamp(Math.round(Number(s.eqVirt) || 0), 0, 100);
  eqReverb = REVERBS[s.eqReverb] !== undefined ? s.eqReverb : 'none';
  eqPreset = EQ_PRESET_NAMES[s.eqPreset] ? s.eqPreset : 'custom';
  applyAudioFx(); syncEqUi();
}

buildEqUi();
syncRanges();

/* ===== YouTube-style seek line: bigger on touch + time bubble while scrubbing ===== */
(function seekBubble() {
  const wrap = document.querySelector('.custom-track-wrapper');
  const box = wrap && wrap.closest('.timeline-box');
  if (!wrap || !box || !timelineSlider) return;
  const bubble = document.createElement('div');
  bubble.className = 'seek-bubble';
  wrap.appendChild(bubble);
  const done = () => box.classList.remove('scrubbing');
  timelineSlider.addEventListener('pointerdown', () => box.classList.add('scrubbing'));
  ['pointerup', 'pointercancel', 'change', 'blur'].forEach((ev) => timelineSlider.addEventListener(ev, done));
  timelineSlider.addEventListener('input', () => {
    const pct = parseFloat(timelineSlider.value) || 0, w = wrap.clientWidth || 1;
    bubble.textContent = formatTime((pct / 100) * (getDuration() || 0));
    bubble.style.left = clamp((pct / 100) * w, 24, Math.max(24, w - 24)) + 'px';
    box.classList.add('scrubbing');
  });
})();

const btnToggleSubStylePanel = $('btnToggleSubStylePanel');
function setSubStylePage(open) {
  const m = $('settingsModal'), p = $('subStylePage');
  if (!m || !p) return;
  m.classList.toggle('sub-open', open);
  p.setAttribute('aria-hidden', open ? 'false' : 'true');
  const body = p.querySelector('.sub-page-body'); if (open && body) body.scrollTop = 0;
}
if (btnToggleSubStylePanel) btnToggleSubStylePanel.onclick = () => setSubStylePage(true);
$('subStyleBack').onclick = () => setSubStylePage(false);
// Closing the menu always returns it to the main tabs
new MutationObserver(() => { if (!$('settingsModal').classList.contains('open')) setSubStylePage(false); }).observe($('settingsModal'), { attributes: true, attributeFilter: ['class'] });

/* ------------------------------------------------------------------ */
/* Playback state / history sync                                       */
/* ------------------------------------------------------------------ */
function savePlaybackState() {
  if (!activeVideoPath) return;
  const state = {
    relPath: activeVideoPath,
    title: playerCurrentTitle.textContent,
    folderTokens: currentPathTokens,
    time: absoluteTime(),
    duration: getDuration(),
    audioTrack: activeAudioStreamIndex,
    is10Bit: isCurrentFile10Bit
  };
  lsSet('astra_active_playback_state', JSON.stringify(state));
}

function notifyStreamPause() {
  if (isTranscodingMode) {
    fetch('/api/stream/pause?sid=' + TC_SID, { method: 'POST' }).catch(() => {});
  }
}

function notifyStreamResume() {
  if (isTranscodingMode) {
    fetch('/api/stream/resume?sid=' + TC_SID, { method: 'POST' }).catch(() => {});
  }
}

async function syncHistoryToServer(relPath, name, time, dur) {
  if (!name && !relPath) return;
  const t = Number.isFinite(time) ? Math.floor(time) : 0;
  const d = Number.isFinite(dur) ? Math.floor(dur) : 0;
  const keyForCache = relPath || activeVideoPath;
  if (keyForCache && d > 0) {
    historyCache[keyForCache] = {
      name: name || playerCurrentTitle.textContent, relPath: keyForCache, time: t, dur: d,
      percent: Math.min(100, Math.floor((t / d) * 100)), updated: Date.now()
    };
  }
  try {
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      keepalive: true,
      body: JSON.stringify({
        relPath: relPath || activeVideoPath,
        name: name || playerCurrentTitle.textContent,
        time: t,
        dur: d
      })
    });
  } catch (e) {}
}

function triggerAutoPause() {
  if (video && !video.paused) {
    video.pause();
    notifyStreamPause();
    if (activeVideoPath) {
      savePlaybackState();
      syncHistoryToServer(activeVideoPath, playerCurrentTitle.textContent, absoluteTime(), getDuration());
    }
  }
}
document.addEventListener('visibilitychange', () => {
  if (document.hidden) { triggerAutoPause(); return; }
  fetch('/api/profile', { cache: 'no-store' }).then((r) => r.json()).then((d) => {          // pick up changes made on another device
    if (!syncMerge(d.keys || {})) return;
    try { Object.assign(prefs, JSON.parse(localStorage.getItem('astra_prefs') || '{}')); initPrefsPanel(); loadSavedSettings(); renderSavedFilters(); showToast('Settings updated from another device', 2500); } catch (e) {}
  }).catch(() => {});
});
window.addEventListener('blur', () => { if (document.hidden) triggerAutoPause(); });
window.addEventListener('pagehide', triggerAutoPause);

/* ------------------------------------------------------------------ */
/* Saved settings                                                      */
/* ------------------------------------------------------------------ */
function loadSavedSettings() {
  try {
    const saved = JSON.parse(lsGet('astra_user_settings') || '{}') || {};
    if (saved.subSize) $('rngSubSize').value = saved.subSize;
    if (saved.subScale) $('rngSubScale').value = saved.subScale;
    if (saved.subBold !== undefined) $('chkSubBold').checked = saved.subBold;
    if (saved.subShadow !== undefined) $('chkSubShadow').checked = saved.subShadow;
    if (saved.subBorder !== undefined) $('chkSubBorder').checked = saved.subBorder;
    if (saved.subBg !== undefined) $('chkSubBg').checked = saved.subBg;
    if (saved.subTextColor) $('colSubText').value = saved.subTextColor;
    if (saved.subBorderColor) $('colSubBorder').value = saved.subBorderColor;
    if (saved.subFont !== undefined) $('selSubFont').value = saved.subFont;
    if (saved.subOutline !== undefined) $('rngSubOutline').value = saved.subOutline;
    if (saved.subBgOp !== undefined) $('rngSubBgOp').value = saved.subBgOp;
    if (saved.subBgCol) $('colSubBgCol').value = saved.subBgCol;
    if (saved.subPos !== undefined) $('rngSubPos').value = saved.subPos;

    if (saved.sharpness !== undefined) {
      $('sharpStrength').value = saved.sharpness;
      currentSharpness = parseFloat(saved.sharpness) / 100;
      $('lblSharp').textContent = saved.sharpness > 0 ? `${saved.sharpness}%` : 'Off';
    }
    if (saved.bright !== undefined) $('rngBright').value = saved.bright;
    if (saved.contrast !== undefined) $('rngContrast').value = saved.contrast;
    if (saved.sat !== undefined) $('rngSat').value = saved.sat;
    if (saved.hue !== undefined) $('rngHue').value = saved.hue;
    if (saved.warm !== undefined) $('rngWarm').value = saved.warm;

    if (saved.audioOffset !== undefined && rngAudioOffset) {
      currentAudioOffset = parseFloat(saved.audioOffset) || 0;
      rngAudioOffset.value = currentAudioOffset;
      $('lblAudioOffset').textContent = `${currentAudioOffset > 0 ? '+' : ''}${currentAudioOffset.toFixed(2)}s`;
    }

    if (saved.eqBands || saved.eqBass !== undefined || saved.eqTreble !== undefined) {
      loadEqFromSaved(saved);
    }

    if (saved.preferredLang) {
      preferredDefaultLang = saved.preferredLang;
      document.querySelectorAll('[data-deflang]').forEach((b) => {
        b.classList.toggle('active', b.dataset.deflang === preferredDefaultLang);
      });
    }
    preferredSubLang = saved.subLang || '';
    if (saved.speed) setPlaybackSpeed(saved.speed, false);
    if (saved.volume !== undefined) video.volume = clamp(Number(saved.volume), 0, 1);
    if (saved.muted !== undefined) video.muted = !!saved.muted;
    syncVolIcon();
    try {
      if (saved.aiLang && [...aiUi.lang.options].some((o) => o.value === saved.aiLang)) aiUi.lang.value = saved.aiLang;
      if (saved.aiTr !== undefined) aiUi.tr.checked = !!saved.aiTr;
      if (saved.aiMode) setAiMode(saved.aiMode, false);
      if (saved.aiSongs !== undefined) aiUi.songs.checked = !!saved.aiSongs;
    } catch (e) {}
  } catch (e) {}
  updateSubtitleStyles();
  applyCombinedFilters();
}

function saveCurrentSettings() {
  const settings = {
    subSize: $('rngSubSize').value,
    subScale: $('rngSubScale').value,
    subBold: $('chkSubBold').checked,
    subShadow: $('chkSubShadow').checked,
    subBorder: $('chkSubBorder').checked,
    subBg: $('chkSubBg').checked,
    subTextColor: $('colSubText').value,
    subBorderColor: $('colSubBorder').value,
    subFont: $('selSubFont').value,
    subOutline: $('rngSubOutline').value,
    subBgOp: $('rngSubBgOp').value,
    subBgCol: $('colSubBgCol').value,
    subPos: $('rngSubPos').value,
    sharpness: $('sharpStrength').value,
    bright: $('rngBright').value,
    contrast: $('rngContrast').value,
    sat: $('rngSat').value,
    hue: $('rngHue').value,
    warm: $('rngWarm').value,
    audioOffset: currentAudioOffset,
    ...eqSettings(),
    preferredLang: preferredDefaultLang,
    subLang: preferredSubLang,
    speed: playbackSpeed,
    volume: video.volume,
    muted: video.muted
  };
  try { settings.filterChip = currentFilterKey(); } catch (e) { settings.filterChip = ''; }
  try { settings.aiLang = aiUi.lang.value; settings.aiTr = aiUi.tr.checked; settings.aiSongs = aiUi.songs.checked; settings.aiMode = aiMode; } catch (e) {}
  lsSet('astra_user_settings', JSON.stringify(settings));
}

document.querySelectorAll('[data-deflang]').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('[data-deflang]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    preferredDefaultLang = btn.dataset.deflang;
    saveCurrentSettings();
  };
});

/* ------------------------------------------------------------------ */
/* Subtitles                                                           */
/* ------------------------------------------------------------------ */
const SUB_FONTS = {
  '': '', sans: '"Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif', serif: 'Georgia, "Times New Roman", serif', mono: '"Courier New", ui-monospace, monospace',
  round: 'ui-rounded, "Varela Round", "Nunito", "Trebuchet MS", sans-serif', comic: '"Comic Sans MS", "Comic Neue", cursive', impact: 'Impact, "Arial Black", sans-serif', hand: '"Segoe Print", "Bradley Hand", cursive'
};
function updateSubtitleStyles() {
  const size = $('rngSubSize').value;
  const scale = $('rngSubScale').value;
  const isBold = $('chkSubBold').checked;
  const hasShadow = $('chkSubShadow').checked;
  const hasBorder = $('chkSubBorder').checked;
  const outline = parseFloat($('rngSubOutline').value) || 0;
  const bgOp = parseInt($('rngSubBgOp').value, 10) || 0;
  const textColor = $('colSubText').value;
  const borderColor = $('colSubBorder').value;
  const bgHex = $('colSubBgCol').value || '#000000';
  const rgb = [1, 3, 5].map((i) => parseInt(bgHex.slice(i, i + 2), 16));

  $('lblSubSize').textContent = `${size}px`;
  $('lblSubScale').textContent = `${scale}%`;
  $('lblSubOutline').textContent = outline ? `${outline}px` : 'Off';
  $('lblSubBgOp').textContent = bgOp ? `${bgOp}%` : 'Off';
  $('lblSubPos').textContent = `${$('rngSubPos').value}%`;

  subDisplayBox.style.fontSize = `${size}px`;
  subDisplayBox.style.fontFamily = SUB_FONTS[$('selSubFont').value] || '';
  subDisplayBox.style.transform = `scale(${scale / 100})`;
  subDisplayBox.style.fontWeight = isBold ? '700' : '400';
  subDisplayBox.style.color = textColor;
  subDisplayBox.style.backgroundColor = bgOp ? `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${bgOp / 100})` : 'transparent';
  subDisplayBox.style.padding = bgOp ? '4px 10px' : '0px';
  subDisplayBox.style.borderRadius = bgOp ? '6px' : '0px';
  // border = real stroke behind the letters (any size), shadow stays a soft drop shadow
  subDisplayBox.style.webkitTextStroke = hasBorder && outline ? `${outline * 2}px ${borderColor}` : '0';
  subDisplayBox.style.paintOrder = 'stroke fill';
  subDisplayBox.style.textShadow = hasShadow ? '2px 2px 4px rgba(0,0,0,0.9), 0 0 8px rgba(0,0,0,0.8)' : 'none';
  if (typeof syncTopBoxStyle === 'function') syncTopBoxStyle();
  if (typeof syncSubLift === 'function') syncSubLift();
  saveCurrentSettings();
}

['rngSubSize', 'rngSubScale', 'rngSubOutline', 'rngSubBgOp', 'rngSubPos', 'selSubFont', 'chkSubBold', 'chkSubShadow', 'chkSubBorder', 'chkSubBg', 'colSubText', 'colSubBorder', 'colSubBgCol'].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('input', updateSubtitleStyles);
});
$('btnSubStyleReset').onclick = () => {
  const d = { rngSubSize: 18, rngSubScale: 100, rngSubOutline: 1.5, rngSubBgOp: 0, rngSubPos: 0 };
  Object.entries(d).forEach(([k, v]) => { $(k).value = v; });
  $('selSubFont').value = ''; $('chkSubBold').checked = true; $('chkSubShadow').checked = true; $('chkSubBorder').checked = true;
  $('colSubText').value = '#ffffff'; $('colSubBorder').value = '#000000'; $('colSubBgCol').value = '#000000';
  updateSubtitleStyles();
};

// Where the bottom subtitle sits: user height + automatically above the control bar while it is visible.
function syncSubLift() {
  const pos = parseFloat($('rngSubPos').value) || 0;
  const wrap = $('playerWrapper');
  const h = wrap ? wrap.clientHeight : 0;
  const bar = $('bottomOverlay');
  const barUp = bar && !bar.classList.contains('hidden') && !wrap.classList.contains('is-locked') ? Math.max(0, bar.offsetHeight - 22) : 0;
  const px = Math.round(34 + (h * pos) / 100 + barUp);
  subDisplayBox.style.top = 'auto';
  subDisplayBox.style.bottom = `${px}px`;
}
// Cue text -> safe HTML. Only <i>, <b>, <u> survive; everything else is stripped/escaped.
function formatCueText(raw) {
  const noTags = raw.replace(/<(?!\/?[ibu]>)[^>]*>/gi, '');
  return noTags.split(/(<\/?[ibu]>)/i).map((part, i) => (
    i % 2
      ? part.toLowerCase()
      : part
        .replace(/&(?!(?:amp|lt|gt|nbsp|lrm|rlm|quot|#\d+|#x[0-9a-f]+);)/gi, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
  )).join('');
}

const subPosLayer = document.createElement('div');
subPosLayer.className = 'sub-pos-layer';
subDisplayBox.parentNode.insertBefore(subPosLayer, subDisplayBox.nextSibling);

// Top lines (second speaker, songs) get their own box so they can show together with the bottom line.
const subTopBox = subDisplayBox.cloneNode(false);
subTopBox.id = 'subTopBox';
subDisplayBox.parentNode.insertBefore(subTopBox, subDisplayBox);
function syncTopBoxStyle() {
  ['fontSize', 'fontFamily', 'transform', 'fontWeight', 'color', 'backgroundColor', 'padding', 'borderRadius', 'textShadow', 'webkitTextStroke', 'paintOrder'].forEach((k) => { subTopBox.style[k] = subDisplayBox.style[k]; });
}
syncTopBoxStyle();

function hideSubtitle() {
  activeSubSignature = '';
  subDisplayBox.style.display = 'none';
  subDisplayBox.innerHTML = '';
  subTopBox.style.display = 'none';
  subTopBox.innerHTML = '';
  subPosLayer.textContent = '';
  assAnims.length = 0;
}

let activeSubSignature = '';
let lastSubCheck = 0;
const POS_RE = /^<pos:(-?[\d.]+),(-?[\d.]+),(\d),([\d.]*),([0-9a-f]*),([0-9a-f]*)>/i;

// Where the picture really is inside the player (it is letter-boxed), so ASS coordinates land on the picture.
function pictureRect() {
  const host = subPosLayer.parentNode;
  const W = host.clientWidth, H = host.clientHeight;
  const vw = video.videoWidth || 16, vh = video.videoHeight || 9;
  const sc = Math.min(W / vw, H / vh);
  const w = vw * sc, h = vh * sc;
  return { x: (W - w) / 2, y: (H - h) / 2, w, h };
}

/* ---- ASS engine renderer (v1.17): draws <ass:…> cues with positions, 9-grid anchors, fades, moves,
   \t transforms, karaoke and vector drawings (SVG), animated with the Web Animations API. ---- */
const ASS_RE = /^<ass:([A-Za-z0-9_-]+)>/;
const assAnims = [];                       // { a: Animation, cue }
function assDecode(raw) {
  const m = ASS_RE.exec(raw);
  if (!m) return null;
  try {
    const b = m[1].replace(/-/g, '+').replace(/_/g, '/');
    const json = decodeURIComponent(escape(atob(b + '==='.slice((b.length + 3) % 4))));
    return { info: JSON.parse(json), plain: raw.slice(m[0].length) };
  } catch (_) { return null; }
}
function assTimeline(info, key, start) {   // numeric \t timeline for one property: [[ms,value],...]
  const pts = [[0, start]]; let v = start;
  (info.tf || []).filter((t) => t.p[key] != null).sort((a, b) => a.t1 - b.t1).forEach((t) => {
    pts.push([t.t1, v]); pts.push([t.t2, t.p[key]]); v = t.p[key];
  });
  return pts.length > 1 ? pts : null;
}
function assAt(pts, ms) {
  if (ms <= pts[0][0]) return pts[0][1];
  for (let i = 1; i < pts.length; i++) {
    if (ms <= pts[i][0]) { const [t0, v0] = pts[i - 1], [t1, v1] = pts[i]; return t1 === t0 ? v1 : v0 + (v1 - v0) * (ms - t0) / (t1 - t0); }
  }
  return pts[pts.length - 1][1];
}
function renderAss(info, cue, rect, layer) {
  const [rx, ry] = info.r, kx = rect.w / rx, ky = rect.h / ry, b = info.base;
  const dur = Math.max(1, (cue.endTime - cue.startTime) * 1000);
  const an = info.an, colA = an % 3 === 1 ? 0 : an % 3 === 2 ? 1 : 2, rowA = an >= 7 ? 0 : an >= 4 ? 1 : 2;
  let ax, ay, maxW;
  if (info.pos) { ax = info.pos[0]; ay = info.pos[1]; maxW = rect.w; }
  else if (info.mv) { ax = info.mv[0]; ay = info.mv[1]; maxW = rect.w; }
  else {
    const [ml, mr, mv] = info.mr;
    ax = colA === 0 ? ml : colA === 1 ? (rx + ml - mr) / 2 : rx - mr;
    ay = rowA === 0 ? mv : rowA === 1 ? ry / 2 : ry - mv;
    maxW = Math.max(40, (rx - ml - mr) * kx);
  }
  const outer = document.createElement('div');
  outer.className = 'sub-ass';
  outer.style.left = `${rect.x + ax * kx}px`; outer.style.top = `${rect.y + ay * ky}px`;
  const fade = document.createElement('div'); fade.className = 'sub-ass-l';
  const rot = document.createElement('div'); rot.className = 'sub-ass-l';
  const box = document.createElement('div'); box.className = 'sub-ass-box';
  outer.appendChild(fade); fade.appendChild(rot); rot.appendChild(box);
  const px = (v) => `${v * ky}px`;
  const anims = [];
  const anim = (el, frames) => { try { const a = el.animate(frames, { duration: dur, fill: 'both', easing: 'linear' }); a.pause(); anims.push(a); } catch (_) { /* old browser: static */ } };

  box.style.transform = `translate(${-colA * 50}%, ${-rowA * 50}%)`;
  box.style.textAlign = colA === 0 ? 'left' : colA === 1 ? 'center' : 'right';
  box.style.maxWidth = `${maxW}px`;
  box.style.fontFamily = b.fn ? `"${b.fn}", "Noto Sans", Arial, sans-serif` : 'Arial, "Noto Sans", sans-serif';
  box.style.fontSize = px(b.fs || 48);
  box.style.color = `#${b.c1}`;
  if (b.b) box.style.fontWeight = '700';
  if (b.i) box.style.fontStyle = 'italic';
  box.style.textDecoration = [b.u ? 'underline' : '', b.s ? 'line-through' : ''].join(' ').trim() || 'none';
  const outline = `#${b.c3}`;
  if (info.box) { box.style.background = outline; box.style.padding = px(b.bord || 2); }
  else if (b.bord > 0) { box.style.webkitTextStroke = `${2 * b.bord * ky}px ${outline}`; box.style.paintOrder = 'stroke fill'; }
  if (b.shad > 0) box.style.textShadow = `${px(b.shad)} ${px(b.shad)} 0 rgba(0,0,0,.55)`;
  if (b.blur > 0 || (info.tf || []).some((t) => t.p.blur != null)) box.style.filter = `blur(${b.blur * ky * 0.6}px)`;
  if (b.a < 1) rot.style.opacity = String(b.a);

  // transform group on the rotation layer (origin = the anchor point)
  const frz = assTimeline(info, 'frz', b.frz), sx = assTimeline(info, 'sx', b.sx), sy = assTimeline(info, 'sy', b.sy);
  const tfm = (ms) => `rotate(${-(frz ? assAt(frz, ms) : b.frz)}deg) scale(${(sx ? assAt(sx, ms) : b.sx) / 100}, ${(sy ? assAt(sy, ms) : b.sy) / 100})`;
  rot.style.transformOrigin = '0 0';
  rot.style.transform = tfm(0);
  if (frz || sx || sy) {
    const ms = [...new Set([0, dur, ...[frz, sx, sy].filter(Boolean).flatMap((p) => p.map((q) => q[0]))])].filter((x) => x >= 0 && x <= dur).sort((a, c) => a - c);
    anim(rot, ms.map((t) => ({ offset: t / dur, transform: tfm(t) })));
  }
  const fs = assTimeline(info, 'fs', b.fs || 48);
  if (fs) anim(box, fs.map(([t, v]) => ({ offset: Math.min(1, t / dur), fontSize: px(v) })));
  const al = assTimeline(info, 'a', b.a);
  if (al) anim(rot, al.map(([t, v]) => ({ offset: Math.min(1, t / dur), opacity: v })));
  const bl = assTimeline(info, 'blur', b.blur);
  if (bl) anim(box, bl.map(([t, v]) => ({ offset: Math.min(1, t / dur), filter: `blur(${v * ky * 0.6}px)` })));
  const bo = assTimeline(info, 'bord', b.bord);
  if (bo && !info.box) anim(box, bo.map(([t, v]) => ({ offset: Math.min(1, t / dur), webkitTextStrokeWidth: `${2 * v * ky}px` })));
  const tc = (info.tf || []).filter((t) => t.p.c1).sort((a, c) => a.t1 - c.t1);
  if (tc.length) {
    const fr = [{ offset: 0, color: `#${b.c1}` }]; let last = b.c1;
    tc.forEach((t) => { fr.push({ offset: Math.min(1, t.t1 / dur), color: `#${last}` }, { offset: Math.min(1, t.t2 / dur), color: `#${t.p.c1}` }); last = t.p.c1; });
    fr.push({ offset: 1, color: `#${last}` });
    anim(box, fr);
  }
  if (info.fd) anim(fade, info.fd.map(([t, v]) => ({ offset: Math.min(1, t / dur), opacity: v })));
  if (info.mv) {
    const [x1, y1, x2, y2, t1, t2] = info.mv, L = (x) => `${rect.x + x * kx}px`, T = (y) => `${rect.y + y * ky}px`;
    anim(outer, [{ offset: 0, left: L(x1), top: T(y1) }, { offset: Math.min(1, t1 / dur), left: L(x1), top: T(y1) },
      { offset: Math.min(1, Math.max(t1, t2) / dur), left: L(x2), top: T(y2) }, { offset: 1, left: L(x2), top: T(y2) }]);
  }

  if (info.dr) {
    const d = info.dr, ns = 'http://www.w3.org/2000/svg', pad = (d.bord || 0) + 1;
    const svg = document.createElementNS(ns, 'svg');
    svg.setAttribute('viewBox', `${d.x - pad} ${d.y - pad} ${d.w + 2 * pad} ${d.h + 2 * pad}`);
    svg.style.width = `${(d.w + 2 * pad) * kx}px`; svg.style.height = `${(d.h + 2 * pad) * ky}px`;
    svg.style.overflow = 'visible'; svg.style.display = 'block';
    const p = document.createElementNS(ns, 'path');
    p.setAttribute('d', d.d); p.setAttribute('fill', `#${d.c}`);
    if (d.bord > 0 && !info.box) { p.setAttribute('stroke', `#${d.o}`); p.setAttribute('stroke-width', String(d.bord * 2)); p.setAttribute('paint-order', 'stroke'); p.setAttribute('stroke-linejoin', 'round'); }
    svg.appendChild(p);
    box.style.webkitTextStroke = '0'; box.style.width = 'max-content';
    box.appendChild(svg);
  } else {
    (info.runs || []).forEach((r) => {
      const mk = (txt, extra) => {
        const sp = document.createElement('span'); sp.textContent = txt;
        if (r.c1) sp.style.color = `#${r.c1}`;
        if (r.fs) sp.style.fontSize = px(r.fs);
        if (r.fn) sp.style.fontFamily = `"${r.fn}", "Noto Sans", Arial, sans-serif`;
        if (r.b != null) sp.style.fontWeight = r.b ? '700' : '400';
        if (r.i != null) sp.style.fontStyle = r.i ? 'italic' : 'normal';
        if (r.u != null || r.s != null) sp.style.textDecoration = [(r.u != null ? r.u : b.u) ? 'underline' : '', (r.s != null ? r.s : b.s) ? 'line-through' : ''].join(' ').trim() || 'none';
        if (r.bord != null) sp.style.webkitTextStrokeWidth = `${2 * r.bord * ky}px`;
        if (extra) extra(sp);
        box.appendChild(sp); return sp;
      };
      if (r.k) {
        const [st, kd, ty] = r.k, after = `#${r.c1 || b.c1}`, before = `#${b.c2 || b.c1}`;
        const chars = ty === 'f' && r.t.length > 1 ? [...r.t] : [r.t];
        chars.forEach((ch, i) => mk(ch, (sp) => {
          const t0 = st + kd * i / chars.length, t1 = t0 + Math.max(1, kd / chars.length);
          sp.style.color = before;
          anim(sp, [{ offset: 0, color: before }, { offset: Math.min(1, t0 / dur), color: before }, { offset: Math.min(1, t1 / dur), color: after }, { offset: 1, color: after }]);
        }));
      } else mk(r.t);
    });
  }
  layer.appendChild(outer);
  anims.forEach((a) => assAnims.push({ a, cue }));
  return outer;
}
// keep every animation locked to the video clock (seek, pause, play)
// An SRT that spells a line out syllable by syllable (one tiny cue each, all on screen together) is one line, not a column.
function assMergeSyllables(list) {
  const groups = new Map(), out = [];
  list.forEach((it) => {
    const inf = it.info, r = inf.runs || [];
    const tiny = !inf.pos && !inf.mv && !inf.dr && r.length === 1 && r[0].t.length <= 6 && !/\n/.test(r[0].t);
    if (!tiny) { out.push(it); return; }
    const b = inf.base, key = [inf.an, b.c1, b.c3, b.fn, b.fs, b.b, r[0].c1, r[0].fs].join('|');
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(it);
  });
  groups.forEach((g) => {
    if (g.length < 3) { out.push(...g); return; }
    g.sort((a, b) => a.cue.startTime - b.cue.startTime || a.i - b.i);
    const first = g[0], merged = { ...first, info: { ...first.info, runs: g.map((x) => ({ ...x.info.runs[0], t: x.info.runs[0].t + '\u200a' })) } };
    merged.n = g.length; out.push(merged);
  });
  return out.sort((a, b) => a.i - b.i);
}
function assSyncAnims() {
  if (!assAnims.length) return;
  const t = absoluteTime() - subDelay;
  for (const it of assAnims) {
    const ms = Math.max(0, (t - it.cue.startTime) * 1000);
    try {
      if (Math.abs((it.a.currentTime || 0) - ms) > 120 || video.paused) it.a.currentTime = ms;
      if (video.paused) { if (it.a.playState === 'running') it.a.pause(); } else if (it.a.playState !== 'running') it.a.play();
    } catch (_) { /* ignore */ }
  }
}

// Cues are matched against the position in the ORIGINAL file, so subtitles stay
// in sync after a seek in a transcoded stream (where video.currentTime restarts at 0).
function updateSubtitleDisplay() {
  const track = mainTrack && mainTrack.track;
  if (!subsOn || !track || !track.cues || track.cues.length === 0) {
    if (activeSubSignature !== '') hideSubtitle();
    return;
  }

  const t = absoluteTime() - subDelay;
  const cues = track.cues;
  let topText = '';
  let bottomText = '';
  const placed = [];
  const assList = [];

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (cue.startTime > t || cue.endTime <= t) continue;
    const raw = cue.text || '';
    const am = ASS_RE.test(raw) ? assDecode(raw) : null;
    const pm = am ? null : POS_RE.exec(raw);
    if (am) {
      assList.push({ cue, i, info: am.info });
    } else if (pm) {
      placed.push({ x: +pm[1], y: +pm[2], an: +pm[3], fs: pm[4] ? +pm[4] : 0, c1: pm[5], c3: pm[6], html: formatCueText(raw.slice(pm[0].length)) });
    } else if (raw.includes('<position:top>')) {
      topText += formatCueText(raw.replace(/<position:top>/g, '')) + '<br>';
    } else {
      bottomText += formatCueText(raw) + '<br>';
    }
  }

  if (assList.length > 2) { const m = assMergeSyllables(assList); assList.length = 0; assList.push(...m); }
  const rect = (placed.length || assList.length) ? pictureRect() : null;
  const signature = `${topText ? 'T' : 'B'}|${topText || bottomText}|${placed.map((p) => `${p.x},${p.y},${p.an},${p.fs},${p.c1},${p.html}`).join(';')}|${assList.map((a) => a.i + ':' + a.cue.startTime + ':' + (a.n || 1)).join(',')}|${rect ? Math.round(rect.w) + 'x' + Math.round(rect.h) : ''}`;
  syncSubLift();
  if (signature === activeSubSignature) { assSyncAnims(); return; }

  if (!topText && !bottomText && !placed.length && !assList.length) {
    hideSubtitle();
    return;
  }

  activeSubSignature = signature;
  subTopBox.style.bottom = 'auto'; subTopBox.style.top = '8%';
  subTopBox.innerHTML = topText;
  subTopBox.style.display = topText ? 'inline-block' : 'none';
  syncSubLift();
  subDisplayBox.innerHTML = bottomText;
  subDisplayBox.style.display = bottomText ? 'inline-block' : 'none';

  subPosLayer.textContent = '';
  assAnims.length = 0;
  assList.forEach((a) => renderAss(a.info, a.cue, rect, subPosLayer));
  // lines without their own position that land on the same spot are stacked (bottom ones go up, top ones down)
  const flow = [...subPosLayer.querySelectorAll('.sub-ass')].filter((_, k) => !assList[k].info.pos && !assList[k].info.mv);
  for (let i = 1; i < flow.length; i++) {
    for (let pass = 0; pass < 8; pass++) {
      const r = flow[i].firstChild.firstChild.firstChild.getBoundingClientRect(); let moved = false;
      for (let j = 0; j < i; j++) {
        const o = flow[j].firstChild.firstChild.firstChild.getBoundingClientRect();
        if (r.left < o.right && r.right > o.left && r.top < o.bottom - 1 && r.bottom > o.top + 1) {
          const info = assList.filter((x) => !x.info.pos && !x.info.mv)[i].info;
          const dy = info.an < 7 ? -(r.bottom - o.top + 2) : (o.bottom - r.top + 2);
          flow[i].style.top = `${parseFloat(flow[i].style.top) + dy}px`; moved = true; break;
        }
      }
      if (!moved) break;
    }
  }
  assSyncAnims();
  placed.forEach((p) => {
    const el = document.createElement('span');
    el.className = 'sub-pos';
    el.innerHTML = p.html;
    const col = p.an % 3 === 1 ? 0 : p.an % 3 === 2 ? -50 : -100;      // left / centre / right anchor
    const row = p.an >= 7 ? 0 : p.an >= 4 ? -50 : -100;               // top / middle / bottom anchor
    el.style.left = `${rect.x + p.x / 100 * rect.w}px`;
    el.style.top = `${rect.y + p.y / 100 * rect.h}px`;
    el.style.transform = `translate(${col}%, ${row}%)`;
    el.style.fontSize = `${Math.max(10, (p.fs || 5) / 100 * rect.h)}px`;
    if (p.c1) el.style.color = `#${p.c1}`;
    const o = p.c3 ? `#${p.c3}` : '#000';
    el.style.textShadow = `-1px -1px 0 ${o}, 1px -1px 0 ${o}, -1px 1px 0 ${o}, 1px 1px 0 ${o}, 0 0 6px ${o}`;
    subPosLayer.appendChild(el);
  });
  // two lines wanting the same spot: stack them (bottom/middle anchors grow upward, top anchors downward) instead of overprinting
  const els = [...subPosLayer.querySelectorAll('.sub-pos')];
  for (let i = 1; i < els.length; i++) {
    for (let pass = 0; pass < 8; pass++) {
      const r = els[i].getBoundingClientRect(); let moved = false;
      for (let j = 0; j < i; j++) {
        const o = els[j].getBoundingClientRect();
        if (r.left < o.right && r.right > o.left && r.top < o.bottom - 1 && r.bottom > o.top + 1) {
          const up = placed[i].an < 7;
          const dy = up ? -(r.bottom - o.top + 2) : (o.bottom - r.top + 2);
          els[i].style.top = `${parseFloat(els[i].style.top) + dy}px`; moved = true; break;
        }
      }
      if (!moved) break;
    }
  }
}

function setupSubtitleCues() {
  if (!mainTrack || !mainTrack.track) return;
  mainTrack.track.mode = 'hidden';
  activeSubSignature = '\u0000';
  updateSubtitleDisplay();
}

mainTrack.addEventListener('load', () => { activeSubSignature = '\u0000'; updateSubtitleDisplay(); });
mainTrack.addEventListener('error', () => {
  if (subsOn) showToast('Subtitle could not be loaded');
});

function resetSubtitleState() {
  subsOn = false;
  mainTrack.removeAttribute('src');
  hideSubtitle();
}

function selectSubtitleUrl(url) {
  subsOn = true;
  mainTrack.src = url;
  setupSubtitleCues();
}

function selectOptRow(container, row) {
  container.querySelectorAll('.opt-row').forEach((r) => r.classList.remove('selected'));
  row.classList.add('selected');
}

function buildSubtitleList(tracks, relPath) {
  subTrackList.innerHTML = '';

  const offRow = document.createElement('div');
  offRow.className = 'opt-row selected';
  offRow.textContent = 'Off';
  offRow.onclick = () => {
    selectOptRow(subTrackList, offRow);
    resetSubtitleState();
    preferredSubLang = '';
    vpSet(relPath, { sub: 'off' });
    saveCurrentSettings();
  };
  subTrackList.appendChild(offRow);

  const vp = vpGet(relPath);
  const forcedTrack = vp.sub && vp.sub.startsWith('t:') ? vp.sub.slice(2) : null;
  let autoChoose = null;
  tracks.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'opt-row';
    row.textContent = `${s.title} (${String(s.codec || '').toUpperCase()})`;

    const choose = (silent) => {
      selectOptRow(subTrackList, row);
      preferredSubLang = s.lang && s.lang !== 'und' ? s.lang : '';
      if (!silent) vpSet(relPath, { sub: `t:${s.streamIndex}` });
      saveCurrentSettings();
      if (!silent) showToast('Loading subtitle…', 1500);
      selectSubtitleUrl(`/api/subs/stream?file=${encodeURIComponent(relPath)}&trackIndex=${s.streamIndex}`);
    };
    row.onclick = () => choose(false);
    subTrackList.appendChild(row);

    // Keep the subtitle language chosen on the previous episode.
    if (forcedTrack !== null) { if (String(s.streamIndex) === forcedTrack) autoChoose = choose; }
    else if (vp.sub !== 'off' && !(vp.sub || '').startsWith('ai') && !autoChoose && preferredSubLang && s.lang === preferredSubLang) autoChoose = choose;
  });

  if (autoChoose) autoChoose(true);
  aiOnEpisodeLoaded();
}

function addExternalSubtitle(name, fullPath) {
  const url = `/api/subs/file?path=${encodeURIComponent(fullPath)}`;
  let row = Array.from(subTrackList.querySelectorAll('.opt-row')).find((r) => r.dataset.extPath === fullPath);
  if (!row) {
    row = document.createElement('div');
    row.className = 'opt-row';
    row.textContent = `External: ${name}`;
    row.dataset.extPath = fullPath;
    const target = row;
    row.onclick = () => {
      selectOptRow(subTrackList, target);
      selectSubtitleUrl(url);
      vpSet(activeVideoPath, { sub: `f:${fullPath}` });
    };
    subTrackList.appendChild(row);
  }
  selectOptRow(subTrackList, row);
  selectSubtitleUrl(url);
  vpSet(activeVideoPath, { sub: `f:${fullPath}` });
}

/* ------------------------------------------------------------------ */
/* WebGL renderer (sharpening) with plain <video> fallback             */
/* ------------------------------------------------------------------ */
let gl = null;
try {
  gl = glCanvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'low-power' });
} catch (e) { gl = null; }
let glProgram, texture, sharpLoc, texelLoc;
let glReady = false;
let glDirty = true;
let currentSharpness = 0.0;
let displayEl = glCanvas;
let glFallback = false;

const vsSource = `
  attribute vec2 a_pos;
  varying vec2 v_tex;
  void main() {
    v_tex = vec2(a_pos.x * 0.5 + 0.5, 1.0 - (a_pos.y * 0.5 + 0.5));
    gl_Position = vec4(a_pos, 0.0, 1.0);
  }
`;

const fsSource = `
  precision mediump float;
  varying vec2 v_tex;
  uniform sampler2D u_image;
  uniform float u_sharpness;
  uniform vec2 u_texel;
  void main() {
    vec2 step = u_texel;
    vec4 col = texture2D(u_image, v_tex);
    vec4 n = texture2D(u_image, v_tex + vec2(0.0, -step.y));
    vec4 s = texture2D(u_image, v_tex + vec2(0.0, step.y));
    vec4 e = texture2D(u_image, v_tex + vec2(step.x, 0.0));
    vec4 w = texture2D(u_image, v_tex + vec2(-step.x, 0.0));
    vec4 edge = 4.0 * col - n - s - e - w;
    gl_FragColor = clamp(col + edge * u_sharpness, 0.0, 1.0);
  }
`;

function useVideoFallback() {
  // No usable WebGL: show the <video> element directly (sharpness is unavailable).
  glReady = false; glFallback = true;
  glCanvas.style.display = 'none';
  video.style.display = 'block';
  video.classList.add('gl-viewport', 'aspect-contain');
  displayEl = video;
  video.style.filter = glCanvas.style.filter; // carry current filter over (no settings write at boot)
}

function initGL() {
  if (!gl) { useVideoFallback(); return; }
  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn('Shader error:', gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const vs = compile(gl.VERTEX_SHADER, vsSource);
  const fs = compile(gl.FRAGMENT_SHADER, fsSource);
  if (!vs || !fs) { useVideoFallback(); return; }

  glProgram = gl.createProgram();
  gl.attachShader(glProgram, vs);
  gl.attachShader(glProgram, fs);
  gl.linkProgram(glProgram);
  if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) { useVideoFallback(); return; }
  gl.useProgram(glProgram);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);

  const posLoc = gl.getAttribLocation(glProgram, 'a_pos');
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  sharpLoc = gl.getUniformLocation(glProgram, 'u_sharpness');
  texelLoc = gl.getUniformLocation(glProgram, 'u_texel');
  glReady = true;
  glDirty = true;
}

// Uploading a texture on every display refresh wastes CPU/battery (60 Hz screen, 24 fps video),
// so draw only when the decoder presented a new frame (requestVideoFrameCallback), falling back
// to drawing every refresh when that API is missing or stops firing.
const hasRVFC = typeof video.requestVideoFrameCallback === 'function';
let rvfcHandle = null;
let newFrameAvailable = true;
let lastRvfcAt = 0;

function armFrameWatch() {
  if (!hasRVFC || rvfcHandle !== null) return;
  rvfcHandle = video.requestVideoFrameCallback(() => {
    rvfcHandle = null;
    newFrameAvailable = true;
    lastRvfcAt = performance.now();
    armFrameWatch();
  });
}
function resetFrameWatch() {
  if (!hasRVFC) return;
  if (rvfcHandle !== null) { try { video.cancelVideoFrameCallback(rvfcHandle); } catch (e) {} }
  rvfcHandle = null;
  newFrameAvailable = true;
  armFrameWatch();
}
video.addEventListener('loadstart', resetFrameWatch);

// With sharpening off the picture goes straight from the decoder to the screen (no per-frame texture upload),
// which is what lets 60 fps play without lag; the WebGL canvas is only used while sharpening is on.
function applyDisplayMode() {
  const direct = currentSharpness <= 0, f = displayEl.style.filter;
  if (direct) { video.classList.add('gl-viewport', 'aspect-contain'); video.style.display = 'block'; glCanvas.style.display = 'none'; displayEl = video; }
  else { video.style.display = 'none'; glCanvas.style.display = 'block'; displayEl = glCanvas; glDirty = true; }
  displayEl.style.filter = f;
}

function renderGLFrame() {
  if (glReady && !glFallback && (currentSharpness <= 0) !== (displayEl === video)) applyDisplayMode();
  if (displayEl === video) { requestAnimationFrame(renderGLFrame); return; }
  armFrameWatch();
  if (glReady && !document.hidden && video.readyState >= 2 && video.videoWidth > 0) {
    let draw = glDirty;
    if (!draw && !video.paused && !video.ended) {
      const stale = performance.now() - lastRvfcAt > 1000;
      draw = !hasRVFC || newFrameAvailable || stale;
    }
    if (draw) {
      if (glCanvas.width !== video.videoWidth || glCanvas.height !== video.videoHeight) {
        glCanvas.width = video.videoWidth;
        glCanvas.height = video.videoHeight;
        gl.viewport(0, 0, glCanvas.width, glCanvas.height);
      }
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);
      gl.uniform1f(sharpLoc, currentSharpness);
      gl.uniform2f(texelLoc, 1 / glCanvas.width, 1 / glCanvas.height);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
      glDirty = false;
      newFrameAvailable = false;
    }
  }
  requestAnimationFrame(renderGLFrame);
}

glCanvas.addEventListener('webglcontextlost', (e) => { e.preventDefault(); glReady = false; });
glCanvas.addEventListener('webglcontextrestored', () => { initGL(); });
['seeked', 'loadeddata', 'canplay', 'emptied'].forEach((evt) => {
  video.addEventListener(evt, () => { glDirty = true; });
});

initGL();
requestAnimationFrame(renderGLFrame);

/* ------------------------------------------------------------------ */
/* Display filters                                                     */
/* ------------------------------------------------------------------ */
function applyCombinedFilters() {
  const b = $('rngBright').value;
  const c = $('rngContrast').value;
  const s = $('rngSat').value;
  const h = $('rngHue').value;
  const w = $('rngWarm').value;

  $('lblBright').textContent = `${b}%`;
  $('lblContrast').textContent = `${c}%`;
  $('lblSat').textContent = `${s}%`;
  $('lblHue').textContent = `${h}°`;
  $('lblWarm').textContent = `${w}%`;

  displayEl.style.filter = `brightness(${b}%) contrast(${c}%) saturate(${s}%) hue-rotate(${h}deg) sepia(${w}%)`;
  glDirty = true; // sharpness may have changed while paused
  try { syncFilterDropdowns(); } catch (e) {}
  saveCurrentSettings();
}

['rngBright', 'rngContrast', 'rngSat', 'rngHue', 'rngWarm'].forEach((id) => {
  $(id).addEventListener('input', applyCombinedFilters);
});

$('sharpStrength').addEventListener('input', (e) => {
  currentSharpness = parseFloat(e.target.value) / 100;
  $('lblSharp').textContent = currentSharpness > 0 ? `${e.target.value}%` : 'Off';
  glDirty = true;
  try { syncFilterDropdowns(); } catch (err) {}
  saveCurrentSettings();
});

function setActiveFilterChip() { try { syncFilterDropdowns(); } catch (e) {} }

$('btnResetFilters').addEventListener('click', () => {
  $('rngBright').value = 100;
  $('rngContrast').value = 100;
  $('rngSat').value = 100;
  $('rngHue').value = 0;
  $('rngWarm').value = 0;
  $('sharpStrength').value = 0;
  currentSharpness = 0;
  $('lblSharp').textContent = 'Off';
  setActiveFilterChip('normal');
  applyCombinedFilters();
});

/* Filters: preset dropdown, custom dropdown, add-by-name ---------------- */
const FILTER_PRESETS = [
  { k: 'normal',   name: 'Normal',          v: { b: 100, c: 100, s: 100, h: 0, w: 0,  sh: 0 } },
  { k: 'vivid',    name: 'Anime Vivid',     v: { b: 108, c: 120, s: 145, h: 0, w: 0,  sh: 80 } },
  { k: 'cyberpunk',name: 'Cyberpunk',       v: { b: 105, c: 135, s: 160, h: 15, w: 0, sh: 120 } },
  { k: 'sunset',   name: 'Warm Sunset',     v: { b: 102, c: 110, s: 125, h: 0, w: 35, sh: 40 } },
  { k: 'oled',     name: 'OLED Deep',       v: { b: 92,  c: 145, s: 110, h: 0, w: 0,  sh: 60 } },
  { k: 'eyecare',  name: 'Night Eye-Care',  v: { b: 85,  c: 95,  s: 85,  h: 0, w: 50, sh: 0 } },
  { k: 'manga',    name: 'Manga B&W',       v: { b: 110, c: 140, s: 0,   h: 0, w: 0,  sh: 100 } },
  { k: 'sharphd',  name: 'Sharp HD (for 360p)', v: { b: 100, c: 110, s: 105, h: 0, w: 0, sh: 170 } },
  { k: 'daylight', name: 'Bright Daylight', v: { b: 115, c: 105, s: 112, h: 0, w: 0,  sh: 40 } },
  { k: 'darkanime',name: 'Dark Anime',      v: { b: 90,  c: 130, s: 125, h: 0, w: 0,  sh: 70 } },
  { k: 'cinema',   name: 'Cinema',          v: { b: 98,  c: 125, s: 90,  h: 0, w: 12, sh: 40 } },
  { k: 'vintage',  name: 'Vintage Film',    v: { b: 100, c: 105, s: 75,  h: 0, w: 40, sh: 20 } },
  { k: 'retro',    name: 'Retro Warm',      v: { b: 105, c: 95,  s: 130, h: 0, w: 45, sh: 0 } },
  { k: 'sepia',    name: 'Sepia',           v: { b: 100, c: 100, s: 60,  h: 0, w: 100,sh: 0 } },
  { k: 'noir',     name: 'Noir',            v: { b: 95,  c: 150, s: 0,   h: 0, w: 0,  sh: 50 } },
  { k: 'pastel',   name: 'Soft Pastel',     v: { b: 112, c: 88,  s: 115, h: 0, w: 8,  sh: 0 } },
  { k: 'highcon',  name: 'High Contrast',   v: { b: 100, c: 160, s: 110, h: 0, w: 0,  sh: 60 } },
  { k: 'neon',     name: 'Neon Pop',        v: { b: 100, c: 140, s: 200, h: 0, w: 0,  sh: 90 } },
  { k: 'cool',     name: 'Cool Tone',       v: { b: 102, c: 108, s: 108, h: 350, w: 0, sh: 30 } }
];

const FILTERS_KEY = 'astra_saved_filters';
function loadSavedFilters() { try { const v = JSON.parse(localStorage.getItem(FILTERS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
let SAVED_FILTERS = loadSavedFilters();
function storeSavedFilters(list) { SAVED_FILTERS = list; try { localStorage.setItem(FILTERS_KEY, JSON.stringify(list)); } catch (e) {} }
function currentFilterValues() {
  return { b: +$('rngBright').value, c: +$('rngContrast').value, s: +$('rngSat').value, h: +$('rngHue').value, w: +$('rngWarm').value, sh: +$('sharpStrength').value };
}
function applyFilterValues(v) {
  $('rngBright').value = v.b; $('rngContrast').value = v.c; $('rngSat').value = v.s; $('rngHue').value = v.h; $('rngWarm').value = v.w;
  $('sharpStrength').value = v.sh; currentSharpness = v.sh / 100; $('lblSharp').textContent = v.sh > 0 ? `${v.sh}%` : 'Off';
  applyCombinedFilters();
}
function filterSame(a, v) { return a.b === v.b && a.c === v.c && a.s === v.s && a.h === v.h && a.w === v.w && a.sh === v.sh; }
function currentFilterKey() {
  const v = currentFilterValues();
  const pi = FILTER_PRESETS.findIndex((p) => filterSame(p.v, v));
  if (pi >= 0) return 'f:' + FILTER_PRESETS[pi].k;
  const ci = SAVED_FILTERS.findIndex((f) => filterSame(f, v));
  return ci >= 0 ? 'm:' + ci : '';
}
function syncFilterDropdowns() {
  const sp = $('selPreset'), sc = $('selCustom');
  if (!sp || !sc) return;
  const v = currentFilterValues();
  const pi = FILTER_PRESETS.findIndex((p) => filterSame(p.v, v));
  sp.value = pi >= 0 ? FILTER_PRESETS[pi].k : '';
  const ci = SAVED_FILTERS.findIndex((f) => filterSame(f, v));
  sc.value = ci >= 0 ? String(ci) : '';
  const del = $('btnDelFilter'); if (del) del.style.display = sc.value === '' ? 'none' : '';
}

function buildFilterSelects() {
  const sp = $('selPreset'); if (!sp) return;
  sp.textContent = '';
  const adj = new Option('Custom (adjusted)', ''); adj.hidden = true; sp.add(adj);
  FILTER_PRESETS.forEach((p) => sp.add(new Option(p.name, p.k)));
  sp.addEventListener('change', () => {
    const p = FILTER_PRESETS.find((x) => x.k === sp.value);
    if (p) { applyFilterValues(p.v); showToast(`Preset: ${p.name}`, 1100); }
  });
  const sc = $('selCustom');
  sc.addEventListener('change', () => {
    const f = SAVED_FILTERS[+sc.value];
    if (f) { applyFilterValues(f); showToast(`Filter: ${f.name}`, 1100); }
  });
  $('btnDelFilter').onclick = () => {
    const i = +sc.value; if (!(i >= 0) || sc.value === '') return;
    const nm = SAVED_FILTERS[i] && SAVED_FILTERS[i].name;
    const l = SAVED_FILTERS.slice(); l.splice(i, 1); storeSavedFilters(l); renderSavedFilters();
    showToast(`Deleted \u201c${nm}\u201d`, 1200);
  };
  renderSavedFilters();
}
function renderSavedFilters() {
  const sc = $('selCustom'); if (!sc) return;
  sc.textContent = '';
  const ph = new Option(SAVED_FILTERS.length ? 'Choose a custom filter' : 'None yet \u2013 add one below', '');
  if (SAVED_FILTERS.length) ph.hidden = true; else ph.disabled = true;
  sc.add(ph);
  SAVED_FILTERS.forEach((f, i) => sc.add(new Option(f.name, String(i))));
  syncFilterDropdowns();
}
function autoFilterName() {
  const have = new Set(SAVED_FILTERS.map((f) => f.name.toLowerCase()));
  let n = 1; while (have.has(('Filter ' + n).toLowerCase())) n++;
  return 'Filter ' + n;
}
$('btnSaveFilter').onclick = () => {
  const inp = $('filterName'); let name = inp.value.trim().slice(0, 24);
  if (!name) name = autoFilterName();
  const list = SAVED_FILTERS.filter((f) => f.name.toLowerCase() !== name.toLowerCase());
  list.push({ name, ...currentFilterValues() });
  storeSavedFilters(list.slice(-20)); inp.value = ''; renderSavedFilters();
  showToast(`Added filter “${name}”`, 1500);
};
$('filterName').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('btnSaveFilter').click(); });
$('filterName').addEventListener('keyup', (e) => e.stopPropagation());
buildFilterSelects();

/* ------------------------------------------------------------------ */
/* Touch gestures                                                      */
/* ------------------------------------------------------------------ */
const tapTracker = { left: 0, center: 0, right: 0 };
function triggerRipple(id) {
  const el = $(id);
  if (!el) return;
  if (id === 'rippleLeft') el.textContent = `-${prefs.seekStep}s`;
  if (id === 'rippleRight') el.textContent = `+${prefs.seekStep}s`;
  el.classList.remove('trigger');
  void el.offsetWidth;
  el.classList.add('trigger');
  setTimeout(() => el.classList.remove('trigger'), 300);
}

let togglePlayPause = function () {
  if (video.paused) {
    initWebAudio();
    notifyStreamResume();
    video.play().catch(() => {});
  } else {
    video.pause();
    notifyStreamPause();
  }
};

function handleDoubleTap(side) {
  if (isScreenLocked) {
    resetHideTimer();
    return;
  }
  const now = Date.now();
  if (now - tapTracker[side] < 280) {
    tapTracker[side] = 0;
    const curTime = absoluteTime();
    const dur = getDuration() || 9999;

    if (side === 'left') {
      seekToTargetSecond(Math.max(0, curTime - prefs.seekStep));
      triggerRipple('rippleLeft');
    } else if (side === 'right') {
      seekToTargetSecond(Math.min(dur - 2, curTime + prefs.seekStep));
      triggerRipple('rippleRight');
    } else if (side === 'center') {
      togglePlayPause();
      triggerRipple('rippleCenter');
    }
    resetHideTimer();
    return;
  }

  tapTracker[side] = now;
  setTimeout(() => {
    if (tapTracker[side] === now && Date.now() - now >= 230) {
      tapTracker[side] = 0;
      const isHidden = topOverlay.classList.contains('hidden');
      if (isHidden) {
        resetHideTimer();
      } else {
        clearTimeout(hideTimer);
        topOverlay.classList.add('hidden');
        bottomOverlay.classList.add('hidden');
        playerWrapper.classList.add('hud-hidden');
      }
    }
  }, 240);
}

$('touchLeft').onclick = (e) => { e.stopPropagation(); handleDoubleTap('left'); };
$('touchCenter').onclick = (e) => { e.stopPropagation(); handleDoubleTap('center'); };
$('touchRight').onclick = (e) => { e.stopPropagation(); handleDoubleTap('right'); };

/* ------------------------------------------------------------------ */
/* Seeking / stream switching                                          */
/* ------------------------------------------------------------------ */
function transcodeUrl(sec) {
  return `/stream/transcode?file=${encodeURIComponent(activeVideoPath)}`
    + `&audioTrack=${encodeURIComponent(activeAudioStreamIndex)}`
    + `&startTime=${sec}&is10Bit=${isCurrentFile10Bit ? '1' : '0'}&q=${effectiveQuality()}${prefs.hwEnc === 'auto' ? '&enc=hw' : ''}&sid=${TC_SID}`;
}


function syncTopHudBadges() {
  const h = video.videoHeight;
  const qStr = h > 0 ? (h + "p") : (playerResBadge.textContent || "Auto");
  const fpsVal = (typeof currentVideoFps !== "undefined" && currentVideoFps > 0) ? currentVideoFps : 0;
  const fpsStr = fpsVal > 0 ? ("@" + fpsVal + "fps") : "";
  const bitStr = sourceIs10Bit ? "10 Bit" : "8 Bit";

  const rfPill = $("topResFpsPill");
  if (rfPill) rfPill.textContent = qStr + fpsStr;

  const bitPill = $("topBitPill");
  if (bitPill) {
    bitPill.textContent = bitStr;
    bitPill.classList.toggle("bit-10", !!sourceIs10Bit);
    bitPill.classList.toggle("bit-ok", !sourceIs10Bit);
  }

  const qv = $("qualityValue");
  const fpsInline = $("topFpsInline");
  if (qv) qv.textContent = qStr;
  if (fpsInline) fpsInline.textContent = fpsVal > 0 ? (fpsVal + "fps") : "";
}

function formatDataRate(bytesPerSec) {
  if (!Number.isFinite(bytesPerSec) || bytesPerSec <= 0) return "0.0 Mbps";
  const mbps = (bytesPerSec * 8) / 1000000;
  if (mbps >= 100) return Math.round(mbps) + " Mbps";
  if (mbps >= 1) return mbps.toFixed(1) + " Mbps";
  return Math.max(1, Math.round((bytesPerSec * 8) / 1000)) + " Kbps";
}

let lastBufBytes = 0;
let lastBufStamp = Date.now();
setInterval(async () => {
  if (currentView !== "player" || document.hidden || !activeVideoPath) return;
  syncTopHudBadges();

  const speedEl = $("netSpeedText");
  const pingEl = $("netPingText");
  const badgeEl = $("netPingBadge");
  if (!speedEl || !pingEl || !badgeEl) return;

  const t0 = performance.now();
  try {
    if (isTranscodingMode) {
      const st = await (await fetch("/api/transcode/stats", { cache: "no-store" })).json();
      const pingMs = Math.max(1, Math.round(performance.now() - t0));
      pingEl.textContent = pingMs + "ms";
      badgeEl.classList.remove("ping-good", "ping-warn", "ping-bad");
      badgeEl.classList.add(pingMs <= 35 ? "ping-good" : pingMs <= 120 ? "ping-warn" : "ping-bad");

      if (st && st.speed > 0) {
        const estRate = st.speed * (typeof estBytesPerSec === "function" ? estBytesPerSec() : 250000);
        speedEl.textContent = st.speed.toFixed(1) + "x (" + formatDataRate(estRate) + ")";
      } else {
        speedEl.textContent = isTranscodeFrozen ? "Paused" : "Transcoding...";
      }
    } else {
      await fetch("/api/whoami", { cache: "no-store" });
      const pingMs = Math.max(1, Math.round(performance.now() - t0));
      pingEl.textContent = pingMs + "ms";
      badgeEl.classList.remove("ping-good", "ping-warn", "ping-bad");
      badgeEl.classList.add(pingMs <= 35 ? "ping-good" : pingMs <= 120 ? "ping-warn" : "ping-bad");

      const ahead = typeof bufferedAhead === "function" ? bufferedAhead() : 0;
      const bps = typeof estBytesPerSec === "function" ? estBytesPerSec() : 450000;
      const now = Date.now();
      const curBufBytes = ahead * bps;
      const dt = Math.max(0.5, (now - lastBufStamp) / 1000);
      const deltaRate = Math.max(0, (curBufBytes - lastBufBytes) / dt);
      lastBufBytes = curBufBytes;
      lastBufStamp = now;

      if (deltaRate > 1024) {
        speedEl.textContent = formatDataRate(deltaRate);
      } else if (ahead > 0.5 && !video.paused) {
        speedEl.textContent = formatDataRate(bps);
      } else {
        speedEl.textContent = "0.0 Mbps";
      }
    }
  } catch (e) {
    pingEl.textContent = "Offline";
    badgeEl.classList.remove("ping-good", "ping-warn");
    badgeEl.classList.add("ping-bad");
  }
}, 1500);

function updateQualityReadout() {
  syncTopHudBadges();
  const qv = $('qualityValue'), qt = $('qualityType');
  if (!qv || !qt) return;
  const h = video.videoHeight;
  qv.textContent = h > 0 ? `${h}p` : (playerResBadge.textContent || 'Auto');
  const ten = !!sourceIs10Bit;
  let label;
  if (isTranscodingMode) label = ten ? '10-bit \u00b7 Decoding' : (compatMode ? '8-bit \u00b7 Compat' : '8-bit \u00b7 Transcode');
  else label = ten ? '10-bit \u00b7 Native' : '8-bit \u00b7 Direct';
  qt.textContent = label;
  qt.className = `q-type ${ten ? 'hi' : 'ok'}`;
}
function updateStreamBadges() {
  setTimeout(updateQualityReadout, 0);
  if (isTranscodingMode) {
    streamModeBadge.textContent = compatMode ? 'Compat Transcode' : (isCurrentFile10Bit ? '10-Bit Transcode' : 'Direct Audio Pipe');
    if (sourceModePill) sourceModePill.textContent = 'Transcode Stream';
  } else {
    streamModeBadge.textContent = 'Native Direct (8-Bit)';
    if (sourceModePill) sourceModePill.textContent = 'Native Stream';
  }
}

function armStartWatch() {
  clearInterval(startWatch);
  const t0 = Date.now();
  const token = playToken;
  startWatch = setInterval(() => {
    if (token !== playToken || !isTranscodingMode || video.readyState >= 1) { clearInterval(startWatch); return; }
    const s = Math.floor((Date.now() - t0) / 1000);
    probeLoadingText.textContent = `Starting transcoder… ${s}s`;
    if (s === 75) {
      clearInterval(startWatch);
      showToast('Still no video data. Try another file or check ffmpeg.', 6000);
    }
  }, 1000);
}

async function startTranscodeAt(sec, label = 'Starting stream...') {
  const token = ++playToken;          // a newer request cancels this one
  sec = Math.max(0, sec);
  probeLoadingText.textContent = label;
  playerBufferingIndicator.classList.add('show');

  // Video is copied (not re-encoded) for 8-bit files, so it can only start on a keyframe.
  // Snap to it so audio and video start together and the clock/subtitles stay exact.
  if (!isCurrentFile10Bit && sec > 0) {
    try {
      const res = await fetch(`/api/video/keyframe?file=${encodeURIComponent(activeVideoPath)}&t=${sec}`);
      const data = await res.json();
      if (Number.isFinite(data.time) && data.time <= sec) sec = data.time;
    } catch (e) { /* fall back to the requested time */ }
    if (token !== playToken) return;
  }


  // 10-bit streams: a finished conversion may already be saved on the server. If so, start from its keyframe
  // (nothing is re-encoded) so the clock and subtitles stay exact.
  if (isCurrentFile10Bit) {
    try {
      const cres = await fetch(`/api/transcode/cache-start?file=${encodeURIComponent(activeVideoPath)}&audioTrack=${encodeURIComponent(activeAudioStreamIndex)}&q=${effectiveQuality()}&t=${sec}`);
      const cd = await cres.json();
      if (cd.hit && Number.isFinite(cd.time) && cd.time <= sec + 0.05) sec = cd.time;
    } catch (e) { /* no cache info: start normally */ }
    if (token !== playToken) return;
  }

  isTranscodingMode = true;
  transcodeBaseOffset = sec;
  updateStreamBadges();
  video.src = transcodeUrl(sec);
  video.load();
  armStartWatch();
  video.play().catch(() => {});
}

function seekToTargetSecond(targetSec, skipUndo = false, forceRestart = false) {
  if (!skipUndo && Math.abs(targetSec - absoluteTime()) > 2) recordSeekOrigin(absoluteTime());
  const dur = getDuration() || 1;
  const clampedSec = Math.max(0, Math.min(dur - 1, targetSec));

  if (!isTranscodingMode) {
    video.currentTime = clampedSec;
    savePlaybackState();
    setupSubtitleCues();
    return;
  }

  // Target already buffered (and seekable)? Just move the playhead: no new ffmpeg, no probe, no wait.  // buffered-seek
  if (!forceRestart && video.readyState >= 1) {
    const rel = clampedSec - transcodeBaseOffset;
    const covers = (r) => { for (let i = 0; i < r.length; i++) if (r.start(i) <= rel + 0.05 && r.end(i) - rel > 1.5) return true; return false; };
    if (rel >= 0 && covers(video.buffered) && covers(video.seekable)) {
      const tok = playToken;
      video.currentTime = rel;
      setTimeout(() => { if (tok === playToken && isTranscodingMode && video.seeking) startTranscodeAt(clampedSec, 'Seeking stream...'); }, 4000);   // safety net
      savePlaybackState();
      setupSubtitleCues();
      return;
    }
  }

  // Transcoded streams restart at the requested absolute time (avoids the 0:00 jump bug).
  startTranscodeAt(clampedSec, 'Seeking stream...');
  savePlaybackState();
  setupSubtitleCues();
}

/* ------------------------------------------------------------------ */
/* Loading & playing an episode                                        */
/* ------------------------------------------------------------------ */
function isActiveItem(v) {
  return v.relPath === activeVideoPath || v.fullPath === activeVideoPath;
}

function findFolderForPath(p, rawName) {
  const folders = Object.keys(fullLibrary);
  // Exact path match first; file name is only a last-resort fallback (names repeat across series).
  const byPath = folders.find((f) => fullLibrary[f].some((v) => v.relPath === p || v.fullPath === p));
  if (byPath !== undefined) return byPath;
  if (rawName) {
    const byName = folders.find((f) => fullLibrary[f].some((v) => v.name === rawName));
    if (byName !== undefined) return byName;
  }
  return null;
}

function resetTimelineUI() {
  isScrubbing = false;
  timelineSlider.value = 0;
  trackPlayed.style.width = '0%';
  trackBuffer.style.width = '0%';
  timeLabel.textContent = '00:00 / 00:00';
  playerDurationBadge.textContent = '--:--';
}

function updateMediaSession() {
  if (!('mediaSession' in navigator) || typeof MediaMetadata === 'undefined') return;
  try {
    navigator.mediaSession.metadata = new MediaMetadata({
      title: playerCurrentTitle.textContent,
      artist: currentPathTokens.join(' / ') || 'Astra Player',
      album: 'Astra Player'
    });
  } catch (e) {}
}

function setupMediaSessionHandlers() {
  if (!('mediaSession' in navigator)) return;
  const set = (action, fn) => { try { navigator.mediaSession.setActionHandler(action, fn); } catch (e) {} };
  set('play', () => { initWebAudio(); notifyStreamResume(); video.play().catch(() => {}); });
  set('pause', () => { video.pause(); });
  set('previoustrack', () => playAdjacentEpisode(-1));
  set('nexttrack', () => playAdjacentEpisode(1));
  set('seekbackward', () => seekToTargetSecond(Math.max(0, absoluteTime() - prefs.seekStep)));
  set('seekforward', () => seekToTargetSecond(absoluteTime() + prefs.seekStep));
}
setupMediaSessionHandlers();

function playAdjacentEpisode(step, auto = false) {
  const idx = currentVideoList.findIndex(isActiveItem);
  const next = idx === -1 ? null : currentVideoList[idx + step];
  if (!next) {
    if (!auto) showToast(step > 0 ? 'This is the last episode' : 'This is the first episode');
    return;
  }
  inspectMediaAndPlay(next.name, next.relPath || next.fullPath, 0);
}

// While an episode plays, quietly ready the next one: ffprobe result cached on the server and its first MB read into the OS cache.
let warmedNext = '';
function warmNextEpisode() {
  try {
    const idx = currentVideoList.findIndex(isActiveItem);
    const nx = idx === -1 ? null : currentVideoList[idx + 1];
    const rel = nx && (nx.relPath || nx.fullPath);
    if (!rel || rel === warmedNext) return;
    warmedNext = rel;
    fetch(`/api/video/metadata?file=${encodeURIComponent(rel)}`).catch(() => {});
    fetch(`/stream?file=${encodeURIComponent(rel)}`, { headers: { Range: 'bytes=0-1048575' } }).then((r) => r.arrayBuffer()).catch(() => {});
  } catch (e) {}
}

var lastOpen = { title: '', rel: '' };
async function inspectMediaAndPlay(rawTitle, relPath, seekTime = 0) {
  lastOpen = { title: rawTitle, rel: relPath }; videoUnloaded = false;
  autoLevel = 0; autoSlowHits = 0;
  const token = ++playToken;
  seekTime = Number(seekTime) > 0 ? Number(seekTime) : 0;

  // Fresh state for the new file (nothing may leak over from the previous episode).
  activeVideoPath = relPath;
  updatePlayerEmptyState();
  setChapters([]);
  nativeFallbackTried = false;
  compatMode = false;
  isCurrentFile10Bit = false;
  sourceIs10Bit = false;
  frameStuck = 0;
  isTranscodingMode = false;
  currentExplicitDuration = 0;
  activeAudioStreamIndex = '0:a:0';
  transcodeBaseOffset = 0;
  lastRecordedTime = 0;
  manualCenterPlay.style.display = 'none';
  resetSubtitleState();
  resetTimelineUI();
  setSubDelay(0);

  const hdr = formatCardHeader(rawTitle);
  playerCurrentTitle.textContent = hdr.tag ? (hdr.title + " • " + hdr.tag) : hdr.title;
  updateActiveEpisodeDescription();

  if (!currentVideoList.some(isActiveItem)) {
    const folder = findFolderForPath(relPath, rawTitle);
    if (folder !== null) {
      currentPathTokens = folder === 'Anime Root' ? [] : folder.split(' / ');
      currentVideoList = fullLibrary[folder];
    }
  }

  const rootBase = (libraryRoot || '').split('/').filter(Boolean).pop() || 'Storage';
  const subPath = currentPathTokens.join(' / ');
  const folderLabel = subPath ? (rootBase + ' / ' + subPath) : rootBase;
  playerCurrentFolder.textContent = folderLabel;
  if (epDrawerFolderName) epDrawerFolderName.textContent = folderLabel;
  renderFloatingEpisodes();
  renderInlinePlaylist();
  updateMediaSession();
  syncDeepLink(relPath);
  syncOnlineArtworkForActive();

  probeLoadingText.textContent = 'Scanning audio & subtitles...';
  playerBufferingIndicator.classList.add('show');

  let meta = null;
  try {
    const res = await fetch(`/api/video/metadata?file=${encodeURIComponent(relPath)}`);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    meta = await res.json();
  } catch (e) {
    meta = null;
  }
  if (token !== playToken) return; // another episode was requested meanwhile

  let useTranscode = false;
  if (meta) {
    currentExplicitDuration = Number(meta.duration) || 0;
    currentVideoFps = Number(meta.videoFps) || 0;
    currentFileBytes = Number(meta.size) || 0;
    playerDurationBadge.textContent = formatTime(currentExplicitDuration);
    isCurrentFile10Bit = !!meta.is10BitHevc;
    sourceIs10Bit = isCurrentFile10Bit;
    // sticky mode: if this episode once needed the transcoder, it starts there every time (no flipping back to direct)
    if (!isCurrentFile10Bit && vpGet(relPath).tc) { compatMode = true; isCurrentFile10Bit = true; }
    setChapters(meta.chapters || []);

    audioTrackList.innerHTML = '';
    let selectedTrackIndex = 0;
    const audioTracks = meta.audioTracks || [];

    if (preferredDefaultLang !== 'auto' && audioTracks.length > 0) {
      const matchIdx = audioTracks.findIndex((t) => (t.lang || '').includes(preferredDefaultLang) || (t.title || '').toLowerCase().includes(preferredDefaultLang));
      if (matchIdx !== -1) selectedTrackIndex = matchIdx;
    }

    audioTracks.forEach((t, idx) => {
      const isSelected = (idx === selectedTrackIndex);
      const row = document.createElement('div');
      row.className = `opt-row ${isSelected ? 'selected' : ''}`;
      row.textContent = `${t.title} (${String(t.codec || 'aac').toUpperCase()})`;
      row.onclick = () => {
        if (t.streamIndex === activeAudioStreamIndex) return; // already playing this track
        selectOptRow(audioTrackList, row);
        activeAudioStreamIndex = t.streamIndex;
        startTranscodeAt(absoluteTime());
      };
      audioTrackList.appendChild(row);
      if (isSelected) activeAudioStreamIndex = t.streamIndex;
    });

    buildSubtitleList(meta.subtitleTracks || [], relPath);

    useTranscode = isCurrentFile10Bit || selectedTrackIndex > 0;
  } else {
    audioTrackList.innerHTML = '<div class="opt-row selected">Default Track</div>';
    buildSubtitleList([], relPath);
  }

  if (useTranscode) {
    isTranscodingMode = true;
    transcodeBaseOffset = seekTime;
    updateStreamBadges();
    probeLoadingText.textContent = 'Starting transcoder…';
    video.src = transcodeUrl(seekTime);
    armStartWatch();
  } else {
    isTranscodingMode = false;
    updateStreamBadges();
    video.src = `/stream?file=${encodeURIComponent(relPath)}`;
  }

  savePlaybackState();
  finalizePlayback(seekTime);
}

function finalizePlayback(seekTime) {
  initWebAudio();
  setupSubtitleCues();
  loadSavedSettings();
  initWebAudio();   // only if a saved EQ / audio delay needs it

  video.onloadedmetadata = () => {
    video.playbackRate = playbackSpeed;
    playerBufferingIndicator.classList.remove('show');
    const dur = getDuration();
    if (!isTranscodingMode && seekTime > 0 && seekTime < dur - 5) {
      video.currentTime = seekTime;
    }
    playerDurationBadge.textContent = formatTime(dur);
    const h = video.videoHeight;
    playerResBadge.textContent = h >= 1080 ? '1080p' : h >= 720 ? '720p' : h > 0 ? `${h}p` : 'Auto';
    updateQualityReadout();
    setTimeout(warmNextEpisode, 15000);
    if (isTranscodingMode && needBuf() > 0 && !internalPause) { video.pause(); startRebuffer(); }
    else if (prefs.autoPlay === false) { video.pause(); manualCenterPlay.style.display = 'flex'; updatePlayButtonIcon(false); }
    else video.play().catch(() => { manualCenterPlay.style.display = 'flex'; });
    resetHideTimer();
  };
}

/* ------------------------------------------------------------------ */
/* <video> events                                                      */
/* ------------------------------------------------------------------ */
video.addEventListener('canplay', () => { playerBufferingIndicator.classList.remove('show'); });
video.addEventListener('waiting', () => {
  if (isTranscodingMode && !video.paused && !internalPause && needBuf() > 0 && !isScrubbing) { startRebuffer(); return; }
  if (!video.paused) {
    probeLoadingText.textContent = 'Buffering...';
    playerBufferingIndicator.classList.add('show');
  }
});
video.addEventListener('play', () => {
  manualCenterPlay.style.display = 'none';
  resumeAudio();
  notifyStreamResume(); // wakes a paused (frozen) transcoder no matter how playback started
});
video.addEventListener('playing', () => {
  armPictureWatch();
  playerBufferingIndicator.classList.remove('show');
  manualCenterPlay.style.display = 'none';
  updatePlayButtonIcon(true);
});
video.addEventListener('pause', () => {
  if (internalPause) return;
  updatePlayButtonIcon(false);
  notifyStreamPause();
});

video.addEventListener('ended', () => {
  const dur = getDuration();
  const nearEnd = !dur || absoluteTime() >= dur - 20;
  if (!nearEnd) {
    // A transcoded stream that dies early also fires "ended" - don't skip the episode.
    showToast('Stream ended early. Seek or press play to continue.', 4000);
    return;
  }
  if (activeVideoPath && dur) {
    syncHistoryToServer(activeVideoPath, playerCurrentTitle.textContent, dur, dur);
  }
  if (sleepAtEnd) { sleepAtEnd = false; setSleep(0); showToast('Sleep timer: stopped', 3000); return; }
  if (prefs.autoNext) playAdjacentEpisode(1, true); // auto-play next episode
});

function fallbackToTranscode(msg) {
  if (isTranscodingMode || nativeFallbackTried) return false;
  nativeFallbackTried = true;
  compatMode = true;
  isCurrentFile10Bit = true; // forces full video transcode to H.264
  try { vpSet(activeVideoPath, { tc: 1 }); } catch (e) {}      // remember: stay on the transcoder for this episode
  showToast(msg, 4000);
  startTranscodeAt(video.currentTime || 0);
  return true;
}
// Some phones "play" HEVC as sound only (decoder missing): no picture => switch to the transcoder.
let pictureWatch = null;
function armPictureWatch() {
  clearTimeout(pictureWatch);
  if (isTranscodingMode || nativeFallbackTried) return;
  const token = playToken;
  pictureWatch = setTimeout(() => {
    if (token !== playToken || isTranscodingMode || video.paused || video.currentTime < 0.5) return;
    let frames = 1;
    try { const q = video.getVideoPlaybackQuality && video.getVideoPlaybackQuality(); if (q) frames = q.totalVideoFrames; } catch (e) {}
    if (video.videoWidth === 0 || frames === 0) fallbackToTranscode('No picture from this video — switching to compatibility transcode');
  }, 3500);
}

/* v1.15 automatic mode switching: a frozen picture (sound keeps going) restarts the stream, or moves direct play to the transcoder.
   Once an episode has needed the transcoder it stays there (sticky, saved per episode). */
let frameStuck = 0, frameLast = -1, timeLast = -1, fixTimes = [];
setInterval(() => {
  try {
    if (!activeVideoPath || video.paused || video.seeking || video.ended || document.hidden || internalPause || video.readyState < 3 || !video.getVideoPlaybackQuality) { frameStuck = 0; frameLast = -1; return; }
    const f = video.getVideoPlaybackQuality().totalVideoFrames, t = video.currentTime;
    if (frameLast >= 0 && f === frameLast && t - timeLast > 0.6) frameStuck++; else frameStuck = 0;
    frameLast = f; timeLast = t;
    if (frameStuck < 3) return;
    frameStuck = 0; frameLast = -1;
    if (!isTranscodingMode) { fallbackToTranscode('Picture froze — switching to compatibility mode'); return; }
    const now = Date.now(); fixTimes = fixTimes.filter((x) => now - x < 120000);
    if (fixTimes.length >= 3) return;                                   // do not loop forever
    fixTimes.push(now);
    showToast('Picture froze — restarting the stream', 2500);
    startTranscodeAt(absoluteTime(), 'Fixing frozen picture...');
  } catch (e) {}
}, 1000);
video.addEventListener('error', () => {
  if (!activeVideoPath || !video.getAttribute('src')) return;
  playerBufferingIndicator.classList.remove('show');

  // The browser could not play the file natively (HEVC, odd codecs, ...): retry once through the transcoder.
  if (fallbackToTranscode('Format not supported natively — switching to compatibility transcode')) return;
  showToast('Playback failed. The file may be missing or unsupported.', 4500);
});

function updatePlayButtonIcon(isPlaying) {
  playBtn.classList.toggle('playing', !!isPlaying);   // the two icons morph in CSS
}

function updateBufferLine() {
  const dur = getDuration();
  if (!dur || !video.buffered.length || !trackBuffer) return;

  for (let i = video.buffered.length - 1; i >= 0; i--) {
    if (video.buffered.start(i) <= video.currentTime) {
      const bufferEnd = isTranscodingMode ? (transcodeBaseOffset + video.buffered.end(i)) : video.buffered.end(i);
      const bufferPercent = Math.min(100, (bufferEnd / dur) * 100);
      trackBuffer.style.width = `${bufferPercent}%`;
      break;
    }
  }
}

video.addEventListener('progress', updateBufferLine);

video.addEventListener('timeupdate', () => {
  const dur = getDuration();
  if (!dur) return;

  const currentExactSec = absoluteTime();
  if (!isScrubbing) {
    const pct = clamp((currentExactSec / dur) * 100, 0, 100);
    timelineSlider.value = pct;
    trackPlayed.style.width = `${pct}%`;
    timeLabel.textContent = `${formatTime(currentExactSec)} / ${formatTime(dur)}`;
  }

  updateBufferLine();
  updateSubtitleDisplay();
  onChapterTick(currentExactSec);

  const currentSec = Math.floor(currentExactSec);
  if (currentSec > 0 && Math.abs(currentSec - lastRecordedTime) >= 3 && activeVideoPath) {
    lastRecordedTime = currentSec;
    savePlaybackState();
    syncHistoryToServer(activeVideoPath, playerCurrentTitle.textContent, currentExactSec, dur);
  }
});

// Subtitle timing needs finer resolution than timeupdate's ~4 Hz.
let subTick = 0;
setInterval(() => {
  if (!video.paused && subsOn && (!isLite() || (subTick++ & 1) === 0)) updateSubtitleDisplay();
}, 120);


/* ===== Safe Seekbar (Thumb-Drag Only on Touch + Undo Seek) ===== */
let lastSeekOrigin = null;
let undoSeekTimer = null;
function recordSeekOrigin(prevSec) {
  if (!Number.isFinite(prevSec) || prevSec < 0) return;
  lastSeekOrigin = prevSec;
  const uBtn = $("undoSeekBtn");
  if (uBtn) {
    uBtn.textContent = "↺ Undo " + formatTime(prevSec);
    uBtn.style.display = "inline-flex";
    clearTimeout(undoSeekTimer);
    undoSeekTimer = setTimeout(() => { uBtn.style.display = "none"; }, 6000);
  }
}
const undoBtnEl = $("undoSeekBtn");
if (undoBtnEl) {
  undoBtnEl.onclick = (e) => {
    e.stopPropagation();
    if (lastSeekOrigin != null) {
      const target = lastSeekOrigin;
      lastSeekOrigin = null;
      undoBtnEl.style.display = "none";
      seekToTargetSecond(target, true);
    }
  };
}

let timelineThumbGrabbed = false;
timelineSlider.addEventListener("pointerdown", (e) => {
  if (isScreenLocked) { e.preventDefault(); return; }
  if (e.pointerType === "mouse") {
    timelineThumbGrabbed = true;
    return;
  }
  const rect = timelineSlider.getBoundingClientRect();
  const ratio = (parseFloat(timelineSlider.value) || 0) / 100;
  const thumbX = rect.left + ratio * rect.width;
  if (Math.abs(e.clientX - thumbX) <= 34) {
    timelineThumbGrabbed = true;
  } else {
    timelineThumbGrabbed = false;
    e.preventDefault();
    e.stopPropagation();
    showToast("Drag the white handle to seek", 1400, "warn");
  }
}, true);

["pointerup", "pointercancel"].forEach((ev) => {
  timelineSlider.addEventListener(ev, () => {
    setTimeout(() => { timelineThumbGrabbed = false; }, 30);
  }, true);
});

// Dragging only previews the position; the (expensive) seek happens on release.
let lastSnappedChapterStart = -1;
timelineSlider.addEventListener('input', (e) => {
  if (isScreenLocked || !timelineThumbGrabbed) { e.preventDefault(); return; }
  const dur = getDuration();
  if (!dur) return;
  isScrubbing = true;
  let pct = parseFloat(timelineSlider.value) || 0;
  let target = (pct / 100) * dur;
  let snapped = false;

  // Magnetic lock onto chapter start points when dragging within 1.8% of a chapter marker
  if (Array.isArray(chapters) && chapters.length > 0) {
    const snapWindowSec = dur * 0.018;
    for (let i = 0; i < chapters.length; i++) {
      if (Math.abs(target - chapters[i].start) <= snapWindowSec) {
        target = chapters[i].start;
        pct = (target / dur) * 100;
        timelineSlider.value = pct;
        snapped = true;
        if (lastSnappedChapterStart !== target) {
          lastSnappedChapterStart = target;
          if (navigator.vibrate) try { navigator.vibrate(15); } catch (_) {}
        }
        break;
      }
    }
  }
  if (!snapped) lastSnappedChapterStart = -1;

  trackPlayed.style.width = `${pct}%`;
  timeLabel.textContent = `${formatTime(target)} / ${formatTime(dur)}`;
  const ch = chapterAt(target);
  if (chapterLabel) {
    chapterLabel.textContent = ch ? ch.title : '';
    chapterLabel.style.display = ch ? 'inline-flex' : 'none';
    chapterLabel.classList.toggle('snapped', snapped);
  }
});
timelineSlider.addEventListener('change', () => {
  const wasScrubbing = isScrubbing;
  isScrubbing = false;
  if (chapterLabel) chapterLabel.classList.remove('snapped');
  timelineSlider.blur();
  if (!wasScrubbing || isScreenLocked) return;
  const dur = getDuration();
  if (!dur) return;
  seekToTargetSecond((timelineSlider.value / 100) * dur);
});
timelineSlider.addEventListener('pointercancel', () => { isScrubbing = false; });

/* ------------------------------------------------------------------ */
/* Player controls                                                     */
/* ------------------------------------------------------------------ */
let fakeFs = false;          // CSS rotation active (works with phone auto-rotate OFF)
let switchingFs = false;
function toastHost() {
  if (fakeFs) return playerWrapper;
  const f = document.fullscreenElement;
  return (f && f !== document.documentElement) ? f : document.body;
}
let rotatedLandscape = false;
function setFakeFs(on) {
  fakeFs = on;
  playerWrapper.classList.toggle('fake-fs', on);
  document.body.classList.toggle('fake-fs-on', on);
  const t = $('astraToast');
  if (t) { const host = toastHost(); if (t.parentNode !== host) host.appendChild(t); }
  resetHideTimer();
}
async function enterLandscape() {
  rotatedLandscape = true;
  if (screen.orientation && screen.orientation.lock) {
    try { await screen.orientation.lock('landscape'); } catch (e) { /* refused: fall through to CSS rotation */ }
  }
  await new Promise((r) => setTimeout(r, 250));
  if (window.innerHeight > window.innerWidth) {
    // Still portrait: Chrome forbids transforms on the fullscreen element itself, so make the
    // whole page the fullscreen element and rotate the player inside it.
    switchingFs = true;
    try {
      if (document.fullscreenElement === playerWrapper) await document.exitFullscreen();
      if (!document.fullscreenElement) await document.documentElement.requestFullscreen();
    } catch (e) { /* fullscreen refused: still rotate inside the page */ }
    switchingFs = false;
    setFakeFs(true);
  }
}
function leaveLandscape() {
  rotatedLandscape = false;
  setFakeFs(false);
  try { if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock(); } catch (e) {}
}
async function toggleFullscreen() {
  if (isScreenLocked) return;
  if (!document.fullscreenElement && !fakeFs) {
    await playerWrapper.requestFullscreen().catch(() => {});
    if (prefs.fsRotate) await enterLandscape();
  } else {
    leaveLandscape();
    if (document.fullscreenElement) await document.exitFullscreen().catch(() => {});
  }
}
fsBtn.onclick = toggleFullscreen;
// Phone physically rotated (or window resized) while the CSS rotation was on: drop it.
// (ignored while typing: the on-screen keyboard shrinks the window and must not drop us out of fullscreen)
const isTyping = () => { const a = document.activeElement; return !!a && (a.tagName === 'INPUT' && !/^(range|checkbox|color|radio|button)$/.test(a.type) || a.tagName === 'TEXTAREA'); };
let resizeT = null;
window.addEventListener('resize', () => { clearTimeout(resizeT); resizeT = setTimeout(() => { if (isTyping()) return; if (fakeFs && window.innerWidth > window.innerHeight) { setFakeFs(false); rotatedLandscape = false; } }, 180); });
window.addEventListener('keydown', (e) => { if (e.key === 'Escape' && fakeFs) leaveLandscape(); });

// Also covers leaving fullscreen with the system back gesture.
document.addEventListener('fullscreenchange', () => {
  if (!document.fullscreenElement && !switchingFs) { rotatedLandscape = false; setFakeFs(false); }
  if (!document.fullscreenElement && screen.orientation && screen.orientation.unlock) {
    try { screen.orientation.unlock(); } catch (e) {}
  }
});

playBtn.onclick = () => {
  if (isScreenLocked) return;
  initWebAudio();
  togglePlayPause();
};

function syncVolIcon() {
  const off = video.muted || video.volume === 0;
  volBtn.classList.toggle('muted', off);
}
function toggleMute() {
  video.muted = !video.muted;
  syncVolIcon();
}
// Remember volume / mute between sessions (debounced)
let volSaveTimer = null;
video.addEventListener('volumechange', () => {
  clearTimeout(volSaveTimer);
  volSaveTimer = setTimeout(saveCurrentSettings, 400);
});

/* ---- Playback speed ---- */
function setPlaybackSpeed(rate, announce = true) {
  playbackSpeed = clamp(Number(rate) || 1, 0.25, 4);
  video.defaultPlaybackRate = playbackSpeed;
  video.playbackRate = playbackSpeed;
  document.querySelectorAll('[data-speed]').forEach((b) => {
    b.classList.toggle('active', Number(b.dataset.speed) === playbackSpeed);
  });
  if (announce) { showToast(`Speed ${playbackSpeed}×`, 1200); saveCurrentSettings(); }
}
document.querySelectorAll('[data-speed]').forEach((btn) => {
  btn.onclick = () => setPlaybackSpeed(btn.dataset.speed);
});
const SPEED_STEPS = [0.5, 0.75, 1, 1.25, 1.5, 2, 3];
function stepSpeed(dir) {
  let i = SPEED_STEPS.findIndex((v) => v >= playbackSpeed - 1e-6);
  if (i === -1) i = SPEED_STEPS.length - 1;
  setPlaybackSpeed(SPEED_STEPS[clamp(i + dir, 0, SPEED_STEPS.length - 1)]);
}

/* ---- Subtitle delay ---- */
function setSubDelay(sec, announce = false, persist = announce) {
  subDelay = clamp(Math.round((Number(sec) || 0) * 10) / 10, -10, 10);
  if (rngSubDelay) rngSubDelay.value = subDelay;
  const lbl = $('lblSubDelay');
  if (lbl) lbl.textContent = `${subDelay > 0 ? '+' : ''}${subDelay.toFixed(1)}s`;
  if (persist && activeVideoPath) vpSet(activeVideoPath, { delay: subDelay });
  activeSubSignature = '\u0000';
  updateSubtitleDisplay();
  if (announce) showToast(`Subtitle delay ${subDelay > 0 ? '+' : ''}${subDelay.toFixed(1)}s`, 1200);
}
if (rngSubDelay) rngSubDelay.addEventListener('input', (e) => setSubDelay(e.target.value, false, true));

volBtn.onclick = () => {
  if (isScreenLocked) return;
  toggleMute();
};

rwBtn.onclick = () => {
  if (isScreenLocked) return;
  seekToTargetSecond(Math.max(0, absoluteTime() - prefs.seekStep));
};
ffBtn.onclick = () => {
  if (isScreenLocked) return;
  const dur = getDuration() || 99999;
  seekToTargetSecond(Math.min(dur - 2, absoluteTime() + prefs.seekStep));
};
bigPlayBtn.onclick = () => {
  if (isScreenLocked) return;
  manualCenterPlay.style.display = 'none';
  initWebAudio();
  notifyStreamResume();
  video.play().catch(() => {});
};

lockBtn.onclick = (e) => {
  e.stopPropagation();
  isScreenLocked = !isScreenLocked;
  playerWrapper.classList.toggle('is-locked', isScreenLocked);

  lockBtn.classList.toggle("is-locked-btn", isScreenLocked);
  lockBtn.innerHTML = isScreenLocked
    ? '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.3"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span id="lockBtnText">LOCKED</span>'
    : '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg><span id="lockBtnText">LOCK</span>';

  if (isScreenLocked) {
    settingsModal.classList.remove('open');
    playerEpisodesDrawer.classList.remove('open');
    bottomOverlay.classList.add('hidden');
    document.querySelectorAll('.top-title-group, .btn-group, .timeline-box').forEach((el) => { el.style.pointerEvents = 'none'; });
  } else {
    document.querySelectorAll('.top-title-group, .btn-group, .timeline-box').forEach((el) => { el.style.pointerEvents = 'auto'; });
    resetHideTimer();
  }
};

/* ---- every panel closes: ×, tap outside, Escape ---- */
const panelScrim = $('panelScrim');
const slidePanels = () => [settingsModal, playerEpisodesDrawer, $('chaptersPanel')];
function closePanels() { slidePanels().forEach((p) => p && p.classList.remove('open')); }
function syncScrim() { panelScrim.classList.toggle('show', slidePanels().some((p) => p && p.classList.contains('open'))); }
if (panelScrim) {
  panelScrim.addEventListener('click', (e) => { e.stopPropagation(); closePanels(); });
  const mo = new MutationObserver(syncScrim);
  slidePanels().forEach((p) => p && mo.observe(p, { attributes: true, attributeFilter: ['class'] }));
}
window.addEventListener('keydown', (e) => { if (e.key === 'Escape') closePanels(); });
const closeSettingsBtn = $('closeSettingsBtn');
if (closeSettingsBtn) closeSettingsBtn.onclick = (e) => { e.stopPropagation(); settingsModal.classList.remove('open'); };
settingsBtn.onclick = (e) => {
  if (e) e.stopPropagation();
  if (isScreenLocked) return;
  playerEpisodesDrawer.classList.remove('open');
  settingsModal.classList.toggle('open');
  resetHideTimer();
};

let hideTimer = null;
function resetHideTimer() {
  if (isScreenLocked) {
    topOverlay.classList.remove('hidden');
    clearTimeout(hideTimer);
    hideTimer = setTimeout(() => {
      topOverlay.classList.add('hidden');
    }, 5000);
    return;
  }

  topOverlay.classList.remove('hidden');
  bottomOverlay.classList.remove('hidden');
  playerWrapper.classList.remove('hud-hidden');
  clearTimeout(hideTimer);

  hideTimer = setTimeout(() => {
    if (settingsModal.classList.contains('open') || playerEpisodesDrawer.classList.contains('open') || $('chaptersPanel').classList.contains('open')) return;
    topOverlay.classList.add('hidden');
    bottomOverlay.classList.add('hidden');
    playerWrapper.classList.add('hud-hidden');
  }, 5000);
}

// Touch taps on the video are handled by the tap zones (show/hide toggle). If the wrapper also
// revealed the controls on touchstart, the zone's single-tap toggle would instantly hide them again.
playerWrapper.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') resetHideTimer(); });
[settingsModal, playerEpisodesDrawer, $('chaptersPanel'), panelScrim].forEach((el) => {
  if (!el) return;
  ['pointerdown', 'click'].forEach((ev) => el.addEventListener(ev, (e) => e.stopPropagation()));
});
[topOverlay, bottomOverlay, settingsModal, playerEpisodesDrawer, $('chaptersPanel')].forEach((el) => {
  ['pointerdown', 'click'].forEach((evt) => el.addEventListener(evt, resetHideTimer));
});

floatingEpisodesBtn.onclick = (e) => {
  if (e) e.stopPropagation();
  if (isScreenLocked) return;
  settingsModal.classList.remove('open');
  renderFloatingEpisodes();
  playerEpisodesDrawer.classList.toggle('open');
  resetHideTimer();
  const active = episodesDrawerList.querySelector('.drawer-ep-row.active');
  if (active && playerEpisodesDrawer.classList.contains('open')) {
    active.scrollIntoView({ block: 'center' });
  }
};
closeEpisodesDrawerBtn.onclick = () => playerEpisodesDrawer.classList.remove('open');

/* Keyboard shortcuts (desktop / external keyboard) */
document.addEventListener('keydown', (e) => {
  if (currentView !== 'player' || e.ctrlKey || e.metaKey || e.altKey) return;
  const tag = e.target && e.target.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return;
  if (tag === 'BUTTON' && (e.key === ' ' || e.key === 'Enter')) return;
  if (isScreenLocked) return;

  let handled = true;
  switch (e.key) {
    case ' ':
    case 'k':
    case 'K': togglePlayPause(); break;
    case 'ArrowLeft':
    case 'j':
    case 'J': seekToTargetSecond(Math.max(0, absoluteTime() - prefs.seekStep)); break;
    case 'ArrowRight':
    case 'l':
    case 'L': seekToTargetSecond(Math.min((getDuration() || 99999) - 2, absoluteTime() + prefs.seekStep)); break;
    case 'ArrowUp': video.volume = clamp(video.volume + 0.1, 0, 1); break;
    case 'ArrowDown': video.volume = clamp(video.volume - 0.1, 0, 1); break;
    case 'm':
    case 'M': toggleMute(); break;
    case 'f':
    case 'F': toggleFullscreen(); break;
    case 'n':
    case 'N': playAdjacentEpisode(1); break;
    case 'p':
    case 'P': playAdjacentEpisode(-1); break;
    case 'Escape': settingsModal.classList.remove('open'); playerEpisodesDrawer.classList.remove('open'); $('chaptersPanel').classList.remove('open'); break;
    case ',': stepChapter(-1); break;
    case '.': stepChapter(1); break;
    case 'c':
    case 'C': toggleChaptersPanel(); break;
    case ']': stepSpeed(1); break;
    case '[': stepSpeed(-1); break;
    case 'z':
    case 'Z': setSubDelay(subDelay - 0.1, true); break;
    case 'x':
    case 'X': setSubDelay(subDelay + 0.1, true); break;
    default: handled = false;
  }
  if (handled) {
    e.preventDefault();
    resetHideTimer();
  }
});


/* ===== v1.25 Card Format (Title • S0E0 | + Description) & Long-Press Video Info ===== */
let customDescriptions = {};
fetch('/api/descriptions').then((r) => r.json()).then((d) => {
  customDescriptions = d || {};
  if (typeof renderInlinePlaylist === 'function') renderInlinePlaylist();
  if (typeof updateActiveEpisodeDescription === 'function') updateActiveEpisodeDescription();
}).catch(() => {});

function findCustomEpInfo(item) {
  if (typeof customDescriptions === "undefined" || !customDescriptions) return "";
  const name = typeof item === "string" ? item : (item && item.name) || "";
  const p = parseMedia(name);
  if (p.ep == null) return "";
  const normTitle = (p.title || "").toLowerCase();
  const seriesKey = Object.keys(customDescriptions).find((k) => normTitle.includes(k.toLowerCase()));
  if (!seriesKey) return "";
  const sKey = String(p.season || 1);
  const seasonObj = customDescriptions[seriesKey] && customDescriptions[seriesKey][sKey];
  const val = seasonObj && seasonObj[String(p.ep)];
  if (!val) return "";
  return typeof val === "string" ? val : (val.title || "");
}

function updateActiveEpisodeDescription() {
  const fileName = (activeVideoPath || "").split("/").pop() || "";
  const text = findCustomEpInfo(fileName) || "";
  const topEl = $("playerCurrentDesc");
  const pauseEl = $("pausedEpDesc");
  if (topEl) topEl.textContent = text;
  if (pauseEl) pauseEl.textContent = text;
}

function formatCardHeader(item) {
  const name = typeof item === "string" ? item : (item.name || "");
  const p = parseMedia(name);
  const pad = (n) => String(n).padStart(2, "0");
  const tag = p.ep == null ? "" : (p.season != null ? `S${pad(p.season)}E${pad(p.ep)}` : `E${pad(p.ep)}`);
  return { title: p.title || cleanMediaTitle(name), tag };
}

function getCardDescription(item) {
  const epName = findCustomEpInfo(item);
  if (epName) return epName;
  if (!item || typeof item === "string") return "Local media stream";
  const parts = [];
  const p = parseMedia(item.name || "");
  if (p.tags && p.tags.length) parts.push(p.tags.slice(0, 2).join(" · "));
  if (item.size) parts.push(item.size);
  const prog = progressLabel(item);
  if (prog) parts.push(prog);
  return parts.length ? parts.join(" • ") : "Ready to play";
}

function showVideoInfoPopup(item, folderHint) {
  const old = document.getElementById("astraVidInfoModal");
  if (old) old.remove();
  const rel = item.relPath || item.fullPath || "";
  const name = item.name || rel.split("/").pop() || "Video";
  const { title, tag } = formatCardHeader(item);
  const h = historyCache[rel] || historyCache[item.fullPath] || null;
  const progStr = h && h.dur ? `${formatTime(h.time)} / ${formatTime(h.dur)} (${h.percent || 0}%)` : "Not watched yet";
  const folder = folderHint || findFolderForPath(rel, name) || "Storage";

  const host = document.fullscreenElement || document.body;
  const scrim = document.createElement("div");
  scrim.id = "astraVidInfoModal";
  scrim.className = "dlg-scrim";
  scrim.innerHTML = `
    <div class="dlg vid-info-dlg" role="dialog" aria-modal="true">
      <div class="vid-info-thumb history-thumb"></div>
      <div class="vid-info-head">
        <span class="vid-info-title">${escapeHtml(title)}</span>
        ${tag ? `<span class="vid-info-tag">• ${escapeHtml(tag)} |</span>` : ""}
      </div>
      <p class="vid-info-desc">${escapeHtml(getCardDescription(item))}</p>
      <div class="vid-info-grid">
        <div><b>Folder:</b> <span>${escapeHtml(folder)}</span></div>
        <div><b>File:</b> <span>${escapeHtml(name)}</span></div>
        <div><b>Progress:</b> <span>${escapeHtml(progStr)}</span></div>
      </div>
      <div class="dlg-act" style="margin-top:14px;">
        <button type="button" class="pill-btn vi-close">Close</button>
        <button type="button" class="pill-btn highlight vi-play">Play Video</button>
      </div>
    </div>`;
  const close = () => { scrim.classList.remove("on"); setTimeout(() => scrim.remove(), 160); };
  scrim.querySelector(".vi-close").onclick = close;
  scrim.querySelector(".vi-play").onclick = () => {
    close();
    inspectMediaAndPlay(name, rel, h ? resumeStartTime(h) : 0);
    navigateTo("player");
  };
  scrim.addEventListener("pointerdown", (e) => { if (e.target === scrim) close(); });
  host.appendChild(scrim);
  attachThumb(scrim.querySelector(".vid-info-thumb"), rel, "video", name);
  requestAnimationFrame(() => scrim.classList.add("on"));
}

function bindHoldVideoInfo(el, item, folderHint) {
  let holdTimer = null, moved = false, held = false;
  el.addEventListener("pointerdown", (e) => {
    if (e.button && e.button !== 0) return;
    moved = false; held = false;
    holdTimer = setTimeout(() => {
      held = true;
      if (navigator.vibrate) try { navigator.vibrate(25); } catch (_) {}
      showVideoInfoPopup(item, folderHint);
    }, 520);
  });
  el.addEventListener("pointermove", () => { moved = true; clearTimeout(holdTimer); });
  ["pointerup", "pointercancel", "pointerleave"].forEach((ev) => {
    el.addEventListener(ev, () => clearTimeout(holdTimer));
  });
  el.addEventListener("click", (e) => {
    if (held) { e.preventDefault(); e.stopImmediatePropagation(); held = false; }
  }, true);
}

/* ------------------------------------------------------------------ */
/* Episode lists                                                       */
/* ------------------------------------------------------------------ */
function progressLabel(item) {
  const h = historyCache[item.relPath] || historyCache[item.fullPath];
  if (!h) return '';
  const pct = Number(h.percent) || 0;
  if (pct >= 97) return '✓ Watched';
  return pct > 0 ? `${pct}% watched` : '';
}
function subLine(item) {
  const label = progressLabel(item);
  return escapeHtml([item.size, label].filter(Boolean).join(' · '));
}

function renderFloatingEpisodes() {
  episodesDrawerList.innerHTML = '';
  const pBtn = $("prevEpBtn"), nBtn = $("nextEpBtn");
  const activeIdx = currentVideoList.findIndex(isActiveItem);
  if (pBtn) pBtn.disabled = activeIdx <= 0;
  if (nBtn) nBtn.disabled = activeIdx < 0 || activeIdx >= currentVideoList.length - 1;
  if (currentVideoList.length === 0) {
    episodesDrawerList.innerHTML = '<div class="empty-hint">No queue active. Pick a series from dashboard!</div>';
    return;
  }
  currentVideoList.forEach((item) => {
    const row = document.createElement('div');
    const isPlaying = isActiveItem(item);
    const rel = item.relPath || item.fullPath;
    const h = historyCache[item.relPath] || historyCache[item.fullPath];
    const pct = h ? Math.min(100, Number(h.percent) || 0) : 0;
    row.className = `drawer-ep-row drawer-ep-card ${isPlaying ? 'active' : ''}`;
    row.innerHTML = `
      <div class="drawer-ep-thumb history-thumb">${pct > 0 ? `<div class="history-bar" style="width:${pct}%"></div>` : ''}</div>
      <div class="drawer-ep-meta">
        <div class="drawer-ep-top">
          ${isPlaying ? '<span class="watching-pill">WATCHING</span>' : ''}
          <div class="drawer-ep-title">${escapeHtml(cleanMediaTitle(item.name))}</div>
        </div>
        <div class="drawer-ep-sub">${subLine(item)}</div>
      </div>`;
    row.onclick = () => {
      inspectMediaAndPlay(item.name, rel, 0);
      playerEpisodesDrawer.classList.remove('open');
      renderInlinePlaylist();
    };
    episodesDrawerList.appendChild(row);
    attachThumb(row.querySelector('.drawer-ep-thumb'), rel, 'video', item.name);
  });
}

// Episode label for a card: "S1 E3" from the file name, else "Episode N", else the cleaned name.
function epCardLabel(item) {
  const n = item.name || '';
  let m = /S(\d{1,2})\s*[ ._-]?E(?:P)?\s?(\d{1,4})/i.exec(n) || /(\d{1,2})x(\d{2,4})/i.exec(n);
  if (m) return `Episode s${+m[1]} e${+m[2]}`;
  m = /(?:episode|ep|e)\s*\.?\s*(\d{1,4})/i.exec(n) || /\s-\s(\d{1,4})(?:v\d)?(?=\s|\[|\(|$)/.exec(n);
  return m ? `Episode ${+m[1]}` : cleanMediaTitle(n);
}
// Season folders that belong to the same anime as the open folder: "Naruto / Season 1", "Naruto / Season 2" ...
function seasonSiblings() {
  if (currentPathTokens.length < 2) return [];
  const parent = currentPathTokens.slice(0, -1).join(' / ');
  return Object.keys(fullLibrary).filter((k) => k.split(' / ').slice(0, -1).join(' / ') === parent && k.split(' / ').length === currentPathTokens.length)
    .sort((x, y) => x.localeCompare(y, undefined, { numeric: true }));
}
function seasonLabel(key) {
  const last = key.split(' / ').pop();
  const m = /^(?:s|season)\s*0*(\d+)$/i.exec(last.trim());
  return m ? `Season ${m[1]}` : last;
}
var IC_FILM = '<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="2" y="3" width="20" height="18" rx="3"/><path d="M7 3v18M17 3v18M2 9h5M17 9h5M2 15h5M17 15h5"/></svg>';
var IC_SEASON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="18" height="17" rx="2"/><path d="M16 2v4M8 2v4M3 10h18"/></svg>';
function updatePlayerEmptyState() {
  const w = $('playerWrapper');
  if (w) w.classList.toggle('no-video', !activeVideoPath);
}
// "The Eminence in Shadow / The Eminence in Shadow S01" -> { name: "The Eminence in Shadow", label: "Season 1" }
function seasonInfo(key) {
  const tokens = key.split(' / '), last = tokens[tokens.length - 1] || '';
  const m = /(?:season|\bs)[\s._-]*0*(\d{1,2})\b/i.exec(last);
  return { name: tokens[0] || last, label: m ? `Season ${+m[1]}` : last };
}
// Card text: title, plus S1E2 only when the file name really has it ("E5" when only the episode is known)
function epCardParts(item) {
  const p = parseMedia(item.name || '');
  const tag = p.ep == null ? '' : (p.season != null ? `S${p.season}E${p.ep}` : `E${p.ep}`);
  return { title: p.title || cleanMediaTitle(item.name), tag };
}
function renderInlinePlaylist() {
  updatePlayerEmptyState();
  playerInlinePlaylist.innerHTML = '';
  const seasonSlot = $('playerSeasons'); seasonSlot.innerHTML = '';
  if (currentVideoList.length === 0) {
    playerInlinePlaylist.innerHTML = '<div class="empty-hint">Select a series to view episodes</div>';
    return;
  }
  const n = currentVideoList.length;
  playerShelfTitle.innerHTML = IC_FILM + '<span></span><small></small>';
  playerShelfTitle.querySelector('span').textContent = currentPathTokens[0] || 'Active Queue';
  playerShelfTitle.querySelector('small').textContent = `${n} ${n === 1 ? 'video' : 'videos'}`;

  // Season boxes: series name (bigger) over "Season N" (smaller), scrolling sideways
  const seasons = seasonSiblings();
  if (seasons.length > 0) {
    const row = document.createElement('div'); row.className = 'season-row';
    const here = currentPathTokens.join(' / ');
    seasons.forEach((k) => {
      const info = seasonInfo(k);
      const bt = document.createElement('button');
      bt.className = 'season-box' + (k === here ? ' active' : '');
      bt.innerHTML = '<span class="sb-name"></span><span class="sb-sub">' + IC_SEASON + '<span></span></span>';
      bt.querySelector('.sb-name').textContent = info.name;
      bt.querySelector('.sb-sub span').textContent = info.label;
      bt.title = `${info.name} \u00b7 ${info.label}`;
      bt.onclick = () => { currentPathTokens = k.split(' / '); currentVideoList = fullLibrary[k]; renderInlinePlaylist(); renderFloatingEpisodes(); };
      row.appendChild(bt);
    });
    seasonSlot.appendChild(row);
    const on = row.querySelector('.active'); if (on) requestAnimationFrame(() => { row.scrollLeft = Math.max(0, on.offsetLeft - 16); });
  }

  const list = document.createElement('div');
  list.className = 'q-list q-v';
  currentVideoList.forEach((item) => {
    const isPlaying = isActiveItem(item);
    const rel = item.relPath || item.fullPath;
    const { title, tag } = formatCardHeader(item);
    const desc = getCardDescription(item);
    const card = document.createElement('div');
    card.className = `q-card bordered-media-card${isPlaying ? ' playing' : ''}`;
    card.innerHTML = `
      <div class="q-thumb history-thumb">${isPlaying ? '<span class="q-now"><i></i><i></i><i></i>Playing</span>' : ''}</div>
      <div class="media-card-body">
        <div class="q-name"><span class="q-title"></span>${tag ? `<span class="q-ep">• ${escapeHtml(tag)} |</span>` : ''}</div>
        <div class="media-card-desc"></div>
      </div>`;
    card.querySelector('.q-title').textContent = title;
    card.querySelector('.media-card-desc').textContent = desc;
    card.title = cleanMediaTitle(item.name);
    card.onclick = () => { inspectMediaAndPlay(item.name, rel, 0); renderInlinePlaylist(); };
    bindHoldVideoInfo(card, item, currentPathTokens.join(" / "));
    list.appendChild(card);
    attachThumb(card.querySelector('.q-thumb'), rel, 'video', item.name);
  });
  playerInlinePlaylist.appendChild(list);
}

/* ------------------------------------------------------------------ */
/* Subtitle file picker                                                */
/* ------------------------------------------------------------------ */
async function openSubFolderPicker(dir = '') {
  $('subPickerModal').classList.add('open');
  const list = $('subPickerList');
  try {
    const targetDir = dir || currentBrowsingDir || '';
    const res = await fetch(`/api/storage/explore?dir=${encodeURIComponent(targetDir)}`);
    const data = await res.json();
    if (!res.ok || !data.folders) throw new Error(data.error || 'Cannot read folder');
    if (subPickerPathInputField) subPickerPathInputField.value = data.current;
    list.innerHTML = '';

    const upRow = document.createElement('div');
    upRow.className = 'explorer-row';
    upRow.innerHTML = '<div class="row-title">Parent Folder</div><span class="row-badge">Up</span>';
    upRow.onclick = () => openSubFolderPicker(data.parent || data.current);
    list.appendChild(upRow);

    data.folders.forEach((f) => {
      const row = document.createElement('div');
      row.className = 'explorer-row';
      row.innerHTML = `<div class="row-title">${escapeHtml(f.name)}</div><span class="row-badge">Open</span>`;
      row.onclick = () => openSubFolderPicker(f.fullPath);
      list.appendChild(row);
    });

    data.files.filter((f) => f.type === 'sub').forEach((f) => {
      const row = document.createElement('div');
      row.className = 'explorer-row';
      row.innerHTML = `<div class="row-title" style="color:#60a5fa;">${escapeHtml(f.name)}</div><span class="row-badge">Select</span>`;
      row.onclick = () => {
        addExternalSubtitle(f.name, f.fullPath);
        $('subPickerModal').classList.remove('open');
      };
      list.appendChild(row);
    });
  } catch (e) {
    list.innerHTML = `<div class="empty-hint">${escapeHtml(e.message || 'Cannot read folder')}</div>`;
  }
}

$('btnAttachSubtitleFolder').onclick = () => openSubFolderPicker();
$('btnOpenSubPickerModal').onclick = () => openSubFolderPicker();
$('closeSubPickerModalBtn').onclick = () => $('subPickerModal').classList.remove('open');

if (btnGoSubPickerInput && subPickerPathInputField) {
  btnGoSubPickerInput.onclick = () => {
    const p = subPickerPathInputField.value.trim();
    if (p) openSubFolderPicker(p);
  };
  subPickerPathInputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const p = subPickerPathInputField.value.trim();
      if (p) openSubFolderPicker(p);
    }
  });
}

/* ------------------------------------------------------------------ */
/* Folder explorer                                                     */
/* ------------------------------------------------------------------ */
async function exploreFolder(dirPath = '') {
  const container = $('explorerContent');
  try {
    const targetDir = dirPath || currentBrowsingDir || '';
    const res = await fetch(`/api/storage/explore?dir=${encodeURIComponent(targetDir)}`);
    const data = await res.json();
    if (!res.ok || !data.folders) throw new Error(data.error || 'Cannot read folder');
    currentBrowsingDir = data.current;
    currentParentDir = data.parent || '';
    if (storagePathInputField) storagePathInputField.value = data.current;

    container.innerHTML = '';
    const videosHere = data.files.filter((f) => f.type === 'video');

    data.folders.forEach((f) => {
      const row = document.createElement('div');
      row.className = 'explorer-row';
      row.innerHTML = `
        <div class="row-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
          <div class="row-title">${escapeHtml(f.name)}</div>
        </div>
        <span class="row-badge">Open</span>
      `;
      row.onclick = () => exploreFolder(f.fullPath);
      container.appendChild(row);
    });

    data.files.forEach((f) => {
      const row = document.createElement('div');
      const isVid = f.type === 'video';
      const { title, tag } = formatCardHeader(f.name);
      row.className = isVid ? 'explorer-row explorer-video-card bordered-media-card' : 'explorer-row';
      if (isVid) {
        row.innerHTML = `
          <div class="exp-vid-thumb history-thumb"></div>
          <div class="media-card-body exp-vid-body">
            <div class="q-name"><span class="q-title">${escapeHtml(title)}</span>${tag ? `<span class="q-ep">• ${escapeHtml(tag)} |</span>` : ''}</div>
            <div class="media-card-desc">${escapeHtml(getCardDescription(f))}</div>
          </div>
          <span class="row-badge">Play</span>
        `;
      } else {
        row.innerHTML = `
          <div class="row-left">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="#f59e0b"><polygon points="6 4 20 12 6 20 6 4"/></svg>
            <div class="row-title">${escapeHtml(cleanMediaTitle(f.name))}</div>
          </div>
          <span class="row-badge">Attach</span>
        `;
      }
      row.onclick = () => {
        if (isVid) {
          playFromExplorer(f, videosHere, data.current);
        } else {
          addExternalSubtitle(f.name, f.fullPath);
          showToast(`Subtitle attached: ${f.name}`, 2000);
        }
      };
      if (isVid) {
        bindHoldVideoInfo(row, f, data.current);
        attachThumb(row.querySelector('.exp-vid-thumb'), f.relPath || f.fullPath, 'video', f.name);
      }
      container.appendChild(row);
    });

    if (data.folders.length === 0 && data.files.length === 0) {
      container.innerHTML = '<div class="empty-hint">No folders, videos or subtitles here</div>';
    }
  } catch (e) {
    container.innerHTML = `<div class="empty-hint">${escapeHtml(e.message || 'Cannot read folder')}</div>`;
  }
}

function playFromExplorer(file, videosHere, folderPath) {
  // Prefer the library entry (keeps one history key per episode and the proper series queue).
  const folder = findFolderForPath(file.fullPath);
  if (folder !== null) {
    currentPathTokens = folder === 'Anime Root' ? [] : folder.split(' / ');
    currentVideoList = fullLibrary[folder];
    const item = currentVideoList.find((v) => v.fullPath === file.fullPath);
    inspectMediaAndPlay(item.name, item.relPath || item.fullPath, 0);
  } else {
    currentPathTokens = [folderPath.split('/').filter(Boolean).pop() || 'Storage'];
    currentVideoList = videosHere.map((v) => ({ name: v.name, relPath: v.fullPath, fullPath: v.fullPath, size: '' }));
    inspectMediaAndPlay(file.name, file.fullPath, 0);
  }
  navigateTo('player');
}

if (btnGoPathInput && storagePathInputField) {
  btnGoPathInput.onclick = () => {
    const p = storagePathInputField.value.trim();
    if (p) exploreFolder(p);
  };
  storagePathInputField.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const p = storagePathInputField.value.trim();
      if (p) exploreFolder(p);
    }
  });
}

$('btnStorageGoParent').onclick = () => {
  if (currentParentDir && currentParentDir !== currentBrowsingDir) {
    exploreFolder(currentParentDir);
  } else if (currentBrowsingDir) {
    const parts = currentBrowsingDir.split('/').filter(Boolean);
    parts.pop();
    exploreFolder('/' + parts.join('/'));
  }
};

$('btnSetAsMediaRoot').onclick = async () => {
  if (!currentBrowsingDir) return;
  try {
    const res = await fetch('/api/settings/root', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ newPath: currentBrowsingDir })
    });
    const data = await res.json();
    if (data.success) {
      libraryRoot = data.root;
      fullLibrary = data.library || {};
      await loadCustomThumbs();
      renderDashboard();
      renderHistory();
      const eps = Object.values(fullLibrary).reduce((n, list) => n + list.length, 0);
      showToast(`Media root set — ${eps} episode${eps === 1 ? '' : 's'} found`);
    } else {
      showToast(data.message || 'Could not set media root');
    }
  } catch (e) {
    showToast('Could not reach the server');
  }
};

$('btnPickFolderBrowse').onclick = () => {
  exploreFolder(libraryRoot || currentBrowsingDir || '');
  navigateTo('library');
};

/* ------------------------------------------------------------------ */
/* Hardware telemetry (1.5s pulse + Linear/Raycast style HUD graph)   */
/* ------------------------------------------------------------------ */
const ramDataPoints = new Array(32).fill(0);
const cpuDataPoints = new Array(32).fill(0);
const timeDataPoints = new Array(32).fill('--:--:--');
let telemetryBusy = false;
let selectedPointIdx = -1;
let selectedClearTimer = null;
let pulseRingPhase = 0;

function formatClockNow() {
  const d = new Date();
  const p = (n) => String(n).padStart(2, '0');
  return `${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
}

function drawTelemetrySeries(ctx, pts, W, H, padL, padR, padT, padB, maxVal, color, topRgba) {
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;
  const coords = pts.map((val, idx) => ({
    x: padL + (idx / (pts.length - 1)) * plotW,
    y: padT + plotH - (Math.min(maxVal, Math.max(0, val)) / (maxVal || 1)) * plotH
  }));

  // Translucent vertical gradient fill
  const grad = ctx.createLinearGradient(0, padT, 0, padT + plotH);
  grad.addColorStop(0, topRgba);
  grad.addColorStop(1, 'rgba(5, 8, 17, 0.0)');

  ctx.beginPath();
  ctx.moveTo(coords[0].x, padT + plotH);
  ctx.lineTo(coords[0].x, coords[0].y);
  for (let i = 0; i < coords.length - 1; i++) {
    const xc = (coords[i].x + coords[i + 1].x) / 2;
    const yc = (coords[i].y + coords[i + 1].y) / 2;
    ctx.quadraticCurveTo(coords[i].x, coords[i].y, xc, yc);
  }
  const last = coords[coords.length - 1];
  ctx.lineTo(last.x, last.y);
  ctx.lineTo(last.x, padT + plotH);
  ctx.closePath();
  ctx.fillStyle = grad;
  ctx.fill();

  // Crisp glowing stroke
  ctx.save();
  ctx.shadowColor = color;
  ctx.shadowBlur = 10;
  ctx.strokeStyle = color;
  ctx.lineWidth = 2.4;
  ctx.lineJoin = 'round';
  ctx.beginPath();
  ctx.moveTo(coords[0].x, coords[0].y);
  for (let i = 0; i < coords.length - 1; i++) {
    const xc = (coords[i].x + coords[i + 1].x) / 2;
    const yc = (coords[i].y + coords[i + 1].y) / 2;
    ctx.quadraticCurveTo(coords[i].x, coords[i].y, xc, yc);
  }
  ctx.lineTo(last.x, last.y);
  ctx.stroke();
  ctx.restore();

  // Animated sonar ring + glowing dot on latest point
  const ringR = 4 + (pulseRingPhase % 10) * 0.7;
  const ringAlpha = Math.max(0, 0.65 - (pulseRingPhase % 10) * 0.065);
  ctx.beginPath();
  ctx.arc(last.x, last.y, ringR, 0, Math.PI * 2);
  ctx.strokeStyle = color;
  ctx.globalAlpha = ringAlpha;
  ctx.lineWidth = 1.5;
  ctx.stroke();
  ctx.globalAlpha = 1;

  ctx.beginPath();
  ctx.arc(last.x, last.y, 4, 0, Math.PI * 2);
  ctx.fillStyle = '#ffffff';
  ctx.fill();
  ctx.lineWidth = 2;
  ctx.strokeStyle = color;
  ctx.stroke();

  return coords;
}

function renderTelemetryCanvas() {
  if (!ramGraphCanvas) return;
  const ctx = ramGraphCanvas.getContext('2d');
  const W = ramGraphCanvas.width;
  const H = ramGraphCanvas.height;
  const padL = 38, padR = 14, padT = 22, padB = 22;
  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  // Deep obsidian canvas background
  const bg = ctx.createLinearGradient(0, 0, 0, H);
  bg.addColorStop(0, '#070b14');
  bg.addColorStop(1, '#04060c');
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // Dot-matrix background pattern (Linear / Vercel style)
  ctx.fillStyle = 'rgba(148, 163, 184, 0.14)';
  for (let gx = padL; gx <= W - padR; gx += 20) {
    for (let gy = padT; gy <= padT + plotH; gy += 20) {
      ctx.fillRect(gx, gy, 1.2, 1.2);
    }
  }

  // Horizontal reference lines + Y-axis labels
  ctx.font = '600 10px ui-monospace, Menlo, monospace';
  ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
  ctx.strokeStyle = 'rgba(71, 85, 105, 0.22)';
  ctx.lineWidth = 1;
  [0, 0.5, 1].forEach((t) => {
    const y = Math.round(padT + plotH * (1 - t));
    ctx.beginPath();
    ctx.moveTo(padL, y);
    ctx.lineTo(W - padR, y);
    ctx.stroke();
    ctx.fillText(`${Math.round(t * 100)}%`, 6, y + 3);
  });

  // Bottom time axis labels
  ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
  ctx.fillText(timeDataPoints[0] || '', padL, H - 6);
  const midIdx = Math.floor(timeDataPoints.length / 2);
  ctx.fillText(timeDataPoints[midIdx] || '', padL + plotW * 0.45, H - 6);
  ctx.fillText(timeDataPoints[timeDataPoints.length - 1] || '', W - padR - 54, H - 6);

  // Top-right mini HUD readout inside graph
  const curRam = ramDataPoints[ramDataPoints.length - 1] || 0;
  const curCpu = cpuDataPoints[cpuDataPoints.length - 1] || 0;
  const peakRam = Math.max(...ramDataPoints, 1);
  ctx.font = '700 11px ui-monospace, Menlo, monospace';
  ctx.fillStyle = '#38bdf8';
  ctx.fillText(`RAM ${curRam.toFixed(1)}MB (Peak ${peakRam.toFixed(0)}MB)`, padL, 14);
  ctx.fillStyle = '#fbbf24';
  ctx.fillText(`CPU ${curCpu}%`, W - padR - 64, 14);

  const maxRam = Math.max(peakRam * 1.25, 100);
  const ramCoords = drawTelemetrySeries(ctx, ramDataPoints, W, H, padL, padR, padT, padB, maxRam, '#38bdf8', 'rgba(56, 189, 248, 0.28)');
  const cpuCoords = drawTelemetrySeries(ctx, cpuDataPoints, W, H, padL, padR, padT, padB, 100, '#fbbf24', 'rgba(251, 191, 36, 0.24)');

  // Interactive tap/click inspector card
  if (selectedPointIdx >= 0 && selectedPointIdx < ramCoords.length) {
    const rc = ramCoords[selectedPointIdx];
    const cc = cpuCoords[selectedPointIdx];
    const x = rc.x;

    ctx.save();
    ctx.strokeStyle = 'rgba(248, 250, 252, 0.55)';
    ctx.lineWidth = 1.2;
    ctx.setLineDash([3, 3]);
    ctx.beginPath();
    ctx.moveTo(x, padT);
    ctx.lineTo(x, padT + plotH);
    ctx.stroke();
    ctx.setLineDash([]);

    [
      { pt: rc, col: '#38bdf8' },
      { pt: cc, col: '#fbbf24' }
    ].forEach(({ pt, col }) => {
      ctx.beginPath();
      ctx.arc(pt.x, pt.y, 5.5, 0, Math.PI * 2);
      ctx.fillStyle = col;
      ctx.fill();
      ctx.lineWidth = 2;
      ctx.strokeStyle = '#ffffff';
      ctx.stroke();
    });

    const boxW = 152;
    const boxH = 56;
    const boxX = Math.min(W - padR - boxW, Math.max(padL, x - boxW / 2));
    const boxY = padT + 4;

    ctx.fillStyle = 'rgba(9, 13, 24, 0.95)';
    ctx.strokeStyle = 'rgba(96, 165, 250, 0.7)';
    ctx.lineWidth = 1.2;
    ctx.beginPath();
    if (ctx.roundRect) ctx.roundRect(boxX, boxY, boxW, boxH, 8);
    else ctx.rect(boxX, boxY, boxW, boxH);
    ctx.fill();
    ctx.stroke();

    ctx.font = '700 11px ui-monospace, Menlo, monospace';
    ctx.fillStyle = '#94a3b8';
    ctx.fillText(`TIME  ${timeDataPoints[selectedPointIdx]}`, boxX + 10, boxY + 16);
    ctx.fillStyle = '#38bdf8';
    ctx.fillText(`RAM   ${ramDataPoints[selectedPointIdx].toFixed(1)} MB`, boxX + 10, boxY + 33);
    ctx.fillStyle = '#fbbf24';
    ctx.fillText(`CPU   ${cpuDataPoints[selectedPointIdx]}%`, boxX + 10, boxY + 49);
    ctx.restore();
  }
}

if (ramGraphCanvas) {
  ramGraphCanvas.style.cursor = 'crosshair';
  ramGraphCanvas.addEventListener('pointerdown', (e) => {
    const rect = ramGraphCanvas.getBoundingClientRect();
    const clickX = ((e.clientX - rect.left) / (rect.width || 1)) * ramGraphCanvas.width;
    const padL = 38, padR = 14;
    const plotW = ramGraphCanvas.width - padL - padR;
    const ratio = Math.min(1, Math.max(0, (clickX - padL) / (plotW || 1)));
    selectedPointIdx = Math.round(ratio * (ramDataPoints.length - 1));
    renderTelemetryCanvas();
    clearTimeout(selectedClearTimer);
    selectedClearTimer = setTimeout(() => {
      selectedPointIdx = -1;
      renderTelemetryCanvas();
    }, 5000);
  });
}

async function pulseHardwareGraph(force = false) {
  if (!force && (currentView !== 'settings' || document.hidden || telemetryBusy)) return;
  telemetryBusy = true;
  try {
    const res = await fetch('/api/system/status', { cache: 'no-store' });
    const data = await res.json();

    const badge = $('telemetryLatencyBadge');
    if (badge) badge.textContent = 'LIVE 1.5s';

    if (ramStatsText) {
      ramStatsText.textContent = `CPU: ${data.cpuPercent}%  •  App RAM: ${data.ramUsedMB} MB  •  Sys: ${data.usedSysMemMB}/${data.totalSysMemMB} MB`;
    }

    const ramVal = parseFloat(data.ramUsedMB) || 0;
    const cpuVal = parseFloat(data.cpuPercent) || 0;
    const nowStr = formatClockNow();

    // Seed initial baseline on first sample so graph starts cleanly without a 0-spike
    if (timeDataPoints[timeDataPoints.length - 1] === '--:--:--') {
      ramDataPoints.fill(ramVal);
      cpuDataPoints.fill(cpuVal);
      timeDataPoints.fill(nowStr);
    } else {
      ramDataPoints.push(ramVal);
      ramDataPoints.shift();
      cpuDataPoints.push(cpuVal);
      cpuDataPoints.shift();
      timeDataPoints.push(nowStr);
      timeDataPoints.shift();
    }

    pulseRingPhase++;
    if (selectedPointIdx > 0) selectedPointIdx--;
    renderTelemetryCanvas();
  } catch (e) {
    /* server unreachable */
  } finally {
    telemetryBusy = false;
  }
}

setInterval(() => pulseHardwareGraph(false), 1500);
// Trigger immediately when navigating to Settings
document.querySelectorAll('[data-hash="settings"]').forEach((btn) => {
  btn.addEventListener('click', () => setTimeout(() => pulseHardwareGraph(true), 60));
});
if ((window.location.hash || '').includes('settings')) {
  setTimeout(() => pulseHardwareGraph(true), 120);
}

/* ------------------------------------------------------------------ */
/* Navigation                                                          */
/* ------------------------------------------------------------------ */
/* Deep links: #player/<series>/<season>/<episode>  e.g. #player/The+Eminence+in+Shadow/season-1/episode-3 */
const urlSlug = (x) => encodeURIComponent(String(x).trim().replace(/\s+/g, '+')).replace(/%2B/gi, '+');
const unSlug = (x) => { const t = String(x || '').replace(/\+/g, ' '); try { return decodeURIComponent(t); } catch (e) { return t; } };
const normSlug = (x) => unSlug(x).toLowerCase().replace(/[\s_\-.]+/g, ' ').trim();   // 'anime+name', 'anime_name', 'Anime-Name' all match
function seasonSlugOf(key) {
  const tokens = key === 'Anime Root' ? [] : key.split(' / ').slice(1);
  if (!tokens.length) return 'season-1';
  const m = /(?:season|\bs)[\s._-]*0*(\d{1,2})\b/i.exec(tokens.join(' '));
  return m ? `season-${Number(m[1])}` : urlSlug(tokens.join(' - ')).toLowerCase();
}
function deepLinkFor(relPath) {
  if (!relPath) return '';
  const key = currentPathTokens.join(' / ') || 'Anime Root';
  const eps = fullLibrary[key];
  if (!eps) return '';
  const idx = eps.findIndex((e) => (e.relPath || e.fullPath) === relPath);
  if (idx < 0) return '';
  const series = key === 'Anime Root' ? 'Anime Root' : key.split(' / ')[0];
  const n = parseMedia(eps[idx].name).ep;
  const unique = n != null && eps.filter((e) => parseMedia(e.name).ep === n).length === 1;
  return `#player/${urlSlug(series)}/${seasonSlugOf(key)}/episode-${unique ? n : idx + 1}`;
}
function resolveDeepLink(raw) {
  const parts = String(raw || '').replace(/^#/, '').split('/');
  if (parts[0] !== 'player' || parts.length < 4) return null;
  const wantSeries = normSlug(parts[1]), wantSeason = String(parts[2]).toLowerCase(), m = /^episode-(\d+)$/i.exec(parts[3]);
  if (!m) return null;
  const n = Number(m[1]);
  const key = Object.keys(fullLibrary).find((k) => normSlug(urlSlug(k === 'Anime Root' ? 'Anime Root' : k.split(' / ')[0])) === wantSeries && seasonSlugOf(k) === wantSeason);
  if (!key) return null;
  const eps = fullLibrary[key];
  const byNum = eps.filter((e) => parseMedia(e.name).ep === n);
  const ep = byNum.length === 1 ? byNum[0] : eps[n - 1];
  return ep ? { key, ep } : null;
}
function syncDeepLink(relPath) {
  const h = deepLinkFor(relPath);
  if (h && window.location.hash !== h) { try { history.replaceState(null, '', h); } catch (e) {} }
}
let pendingDeepLink = null;
async function openDeepLink(raw) {
  const r = resolveDeepLink(raw);
  if (!r) { showToast('That episode was not found in your library', 3500); navigateTo('home'); return; }
  const path = r.ep.relPath || r.ep.fullPath;
  if (currentView === 'player' && activeVideoPath === path) return;
  currentPathTokens = r.key === 'Anime Root' ? [] : r.key.split(' / ');
  currentVideoList = fullLibrary[r.key];
  const h = historyCache[path];
  navigateTo('player');
  renderInlinePlaylist();
  inspectMediaAndPlay(r.ep.name, path, h ? resumeStartTime(h) : 0);
}

function navigateTo(hash) {
  const raw = String(hash || '').replace(/^#/, '') || 'home';
  let target = raw.split('/')[0];
  if (!$(`view-${target}`)) target = 'home';
  if (target !== 'player') triggerAutoPause();

  currentView = target;
  const keepDeep = target === 'player' && /^#player\//.test(window.location.hash);
  if (!keepDeep && window.location.hash !== `#${target}`) window.location.hash = target;
  document.querySelectorAll('.page-view').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.drawer-item').forEach((d) => d.classList.remove('active'));

  const view = $(`view-${target}`);
  const nav = document.querySelector(`.drawer-item[data-hash="${target}"]`);
  if (view) view.classList.add('active');
  window.scrollTo(0, 0); // each page opens at its top (the player must never land off-screen)
  if (nav) nav.classList.add('active');
  $('sideDrawer').classList.remove('open');
  $('menuOverlay').classList.remove('open');

  if (target === 'home') { renderDashboard(homeQuickSearch ? homeQuickSearch.value.trim() : ''); renderHistory(); }
  if (target === 'player') { renderInlinePlaylist(); if (activeVideoPath) syncDeepLink(activeVideoPath); liteEnterPlayer(); }
  else liteLeavePlayer();
  if (target === 'library') exploreFolder(libraryRoot || currentBrowsingDir || '');
  if (target === 'tasks') refreshTasks();
}
window.addEventListener('hashchange', () => {
  const raw = (window.location.hash || '').replace(/^#/, '') || 'home';
  if (raw.startsWith('player/')) { openDeepLink(raw); return; }
  const t = raw.split('/')[0];
  if (t !== currentView) navigateTo(t); // skip the echo of our own hash update
});
document.querySelectorAll('.drawer-item').forEach((btn) => {
  btn.onclick = () => navigateTo(btn.dataset.hash);
});
$('openDrawerBtn').onclick = () => { $('sideDrawer').classList.add('open'); $('menuOverlay').classList.add('open'); };
$('closeDrawerBtn').onclick = () => { $('sideDrawer').classList.remove('open'); $('menuOverlay').classList.remove('open'); };
$('menuOverlay').onclick = () => { $('sideDrawer').classList.remove('open'); $('menuOverlay').classList.remove('open'); };

document.querySelectorAll('.modal-tabs .tab-btn').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('.modal-tabs .tab-btn').forEach((b) => b.classList.remove('active'));
    document.querySelectorAll('.tab-body').forEach((b) => b.classList.remove('show'));
    btn.classList.add('active');
    $(btn.dataset.target).classList.add('show');
  };
});

if (homeQuickSearch) {
  let searchTimer = null;
  homeQuickSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      clearTimeout(searchTimer);
      renderDashboard(homeQuickSearch.value.trim());
    }
  });
  homeQuickSearch.addEventListener('input', (e) => {
    clearTimeout(searchTimer);
    const q = e.target.value.trim();
    searchTimer = setTimeout(() => renderDashboard(q), 150);
  });
}

/* ------------------------------------------------------------------ */
/* Library, dashboard, history                                         */
/* ------------------------------------------------------------------ */
// Opening the site always starts on Home. Only a deep link (#player/series/season/episode) starts an episode.
function restoreSessionState() {
  if (sessionRestoreDone) return;
  sessionRestoreDone = true;
  if (pendingDeepLink) { const d = pendingDeepLink; pendingDeepLink = null; openDeepLink(d); }
}

async function loadLibrary(refresh = false) {
  try {
    const res = await fetch(`/api/library${refresh ? '?refresh=1' : ''}`);
    const data = await res.json();
    fullLibrary = data.library || {};
    libraryRoot = data.root || '';
    await loadCustomThumbs();
    renderDashboard();
    await renderHistory();
  } catch (e) {
    /* offline: keep whatever is on screen */
  }
  restoreSessionState();
}

// Where to start when a series card is tapped: continue the most recently watched episode.
function pickSeriesStart(eps) {
  let best = null;
  eps.forEach((ep, i) => {
    const h = historyCache[ep.relPath] || historyCache[ep.fullPath];
    if (h && (!best || (h.updated || 0) > (best.h.updated || 0))) best = { i, h };
  });
  if (!best) return { ep: eps[0], time: 0 };
  if (best.h.percent >= 97) {
    const next = eps[best.i + 1];
    return { ep: next || eps[best.i], time: 0 };
  }
  return { ep: eps[best.i], time: best.h.time || 0 };
}

function renderDashboard(query = '') {
  seriesCardsGrid.innerHTML = '';
  const folders = Object.keys(fullLibrary);
  $('statSeriesCount').textContent = folders.length;

  let totalEps = 0;
  folders.forEach((k) => { totalEps += fullLibrary[k].length; });
  $('statEpCount').textContent = totalEps;

  const q = query.toLowerCase();
  let shown = 0;

  folders.forEach((folder) => {
    const eps = fullLibrary[folder];
    const matchFolder = folder.toLowerCase().includes(q);
    const matchEp = eps.some((e) => e.name.toLowerCase().includes(q));

    if (q && !matchFolder && !matchEp) return;
    shown++;

    const firstEp = eps[0];
    const sMatch = /(?:season|\bs)[\s._-]*0*(\d{1,2})\b/i.exec(folder);
    const seriesTag = sMatch ? `S${Number(sMatch[1])}` : 'Playlist';
    const seriesDisplayName = cleanSeriesQuery(folder) || cleanMediaTitle(folder);
    const isYtFolder = /^youtube$|^downloads$|^videos$|^telegram$/i.test(seriesDisplayName);

    const watchedCount = eps.filter((e) => {
      const h = historyCache[e.relPath] || historyCache[e.fullPath];
      return h && (Number(h.percent) || 0) >= 85;
    }).length;

    const card = document.createElement('div');
    card.className = 'c1-series-card';
    card.innerHTML = `
      <div class="c1-series-thumb">
        ${isYtFolder ? `<span class="youtube-folder-badge"><svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/></svg> YouTube</span>` : ''}
        <span class="c1-eps-pill">${eps.length} EPS</span>
      </div>
      <div class="c1-series-body">
        <div class="c1-series-title">${escapeHtml(seriesDisplayName)} <span>• ${escapeHtml(seriesTag)}</span></div>
        <div class="c1-series-sub">${watchedCount}/${eps.length} Watched • ${prefs.networkMode === 'online' && !isYtFolder ? 'Online Cover' : 'Local Series'}</div>
      </div>
    `;
    card.onclick = () => {
      currentPathTokens = folder === 'Anime Root' ? [] : folder.split(' / ');
      currentVideoList = eps;
      const start = pickSeriesStart(eps);
      renderInlinePlaylist();
      inspectMediaAndPlay(start.ep.name, start.ep.relPath || start.ep.fullPath, start.time);
      navigateTo('player');
    };
    bindHoldVideoInfo(card, firstEp, folder);
    seriesCardsGrid.appendChild(card);
    attachThumb(card.querySelector('.c1-series-thumb'), firstEp.relPath || firstEp.fullPath, 'series', folder);
  });

  if (shown === 0) {
    const hint = document.createElement('span');
    hint.className = 'empty-hint';
    hint.textContent = q
      ? `No results for "${query}"`
      : `No videos found${libraryRoot ? ` in ${libraryRoot}` : ''}. Pick a folder in Files and tap "Set Default Root".`;
    seriesCardsGrid.appendChild(hint);
  }
}
function resumeStartTime(item) {
  return item.percent >= 97 ? 0 : (item.time || 0);
}

async function renderHistory() {
  try {
    const res = await fetch('/api/history');
    historyCache = await res.json();
    historyGrid.innerHTML = '';

    const keys = Object.keys(historyCache).sort((a, b) => (historyCache[b].updated || 0) - (historyCache[a].updated || 0));
    const sizeEl = $('librarySizeCount');
    if (sizeEl) sizeEl.textContent = `(${keys.length} ${keys.length === 1 ? 'item' : 'items'})`;
    const heroBg = $('heroSpotlightBg');
    const heroEpSub = $('heroEpSubTitle');
    const heroBar = $('heroSpotlightBar');
    const heroNextBtn = $('heroNextEpBtn');
    const heroNextLbl = $('heroNextEpLabel');
    const heroPreview = $('heroMiniPreview');
    const heroPrevThumb = $('heroPreviewThumb');
    const heroPrevDur = $('heroPreviewDur');
    const heroPrevCap = $('heroPreviewCap');

    if (keys.length > 0) {
      const topKey = keys[0];
      const topItem = historyCache[topKey];
      const pct = Math.min(100, Number(topItem.percent) || 0);
      const hdr = formatCardHeader(topItem.name);
      const epInfo = findCustomEpInfo(topItem.name) || '';

      heroTitle.innerHTML = hdr.tag
        ? `${escapeHtml(hdr.title)} <span style="color:var(--accent);">• ${escapeHtml(hdr.tag)}</span>`
        : escapeHtml(hdr.title);
      if (heroEpSub) heroEpSub.textContent = epInfo;
      heroProgressPill.textContent = `${formatTime(topItem.time)} / ${formatTime(topItem.dur)} (${pct}%)`;
      if (heroBar) heroBar.style.width = `${pct}%`;

      const folder = findFolderForPath(topKey, topItem.name);
      const rootBase = (libraryRoot || '').split('/').filter(Boolean).pop() || 'Storage';
      heroSynopsis.textContent = folder ? `${rootBase} / ${folder}` : topKey;

      if (heroResumeLabel) heroResumeLabel.textContent = hdr.tag ? `Resume ${hdr.tag}` : 'Resume Playback';
      heroResumeBtn.onclick = () => {
        inspectMediaAndPlay(topItem.name, topKey, resumeStartTime(topItem));
        navigateTo('player');
      };

      // Mini Preview Card on Right
      if (heroPreview && heroPrevThumb) {
        heroPreview.style.display = 'block';
        heroPrevThumb.style.backgroundImage = `url("/api/thumb?file=${encodeURIComponent(topKey)}&kind=video")`;
        if (heroPrevDur) heroPrevDur.textContent = formatTime(topItem.dur);
        if (heroPrevCap) heroPrevCap.textContent = epInfo || cleanMediaTitle(topItem.name);
      }

      // Hero Full-Bleed Cover Wallpaper
      if (heroBg) {
        if (prefs.networkMode === 'online' && folder) {
          fetchOnlineArtwork(folder).then((meta) => {
            if (meta && meta.found && meta.localUrl) {
              heroBg.style.backgroundImage = `url("${meta.localUrl}")`;
            } else {
              heroBg.style.backgroundImage = `url("/api/thumb?file=${encodeURIComponent(topKey)}&kind=video")`;
            }
          });
        } else {
          heroBg.style.backgroundImage = `url("/api/thumb?file=${encodeURIComponent(topKey)}&kind=video")`;
        }
      }

      // Next Episode button on Hero
      const list = folder != null ? fullLibrary[folder] : null;
      const at = list ? list.findIndex((v) => v.relPath === topKey || v.fullPath === topKey) : -1;
      if (at >= 0 && list[at + 1] && heroNextBtn) {
        const nextEp = list[at + 1];
        const nextHdr = formatCardHeader(nextEp.name);
        heroNextBtn.style.display = 'inline-flex';
        if (heroNextLbl) heroNextLbl.textContent = nextHdr.tag ? `Next Ep (${nextHdr.tag})` : 'Next Ep';
        heroNextBtn.onclick = () => {
          inspectMediaAndPlay(nextEp.name, nextEp.relPath || nextEp.fullPath, 0);
          navigateTo('player');
        };
      } else if (heroNextBtn) {
        heroNextBtn.style.display = 'none';
      }

      // Combined Up Next & Watch History Horizontal Rail (Current -> NEXT -> NEXT 2 -> NEXT 3 -> Earlier History)
      const mkCard = (name, k, subText, pctBar, onPlay, badge) => {
        const { title, tag } = formatCardHeader(name);
        const epDesc = findCustomEpInfo(name) || subText;
        const card = document.createElement('div');
        card.className = 'history-deck-card bordered-media-card' + (badge ? ' is-next' : '');
        card.innerHTML = `
          <div class="history-thumb">
            ${badge ? `<span class="hist-tag">${badge}</span>` : ''}
            ${pctBar > 0 ? `<div class="history-bar" style="width:${pctBar}%"></div>` : ''}
          </div>
          <div class="media-card-body">
            <div class="q-name"><span class="q-title">${escapeHtml(title)}</span>${tag ? `<span class="q-ep">• ${escapeHtml(tag)}</span>` : ''}</div>
            <div class="media-card-desc" style="color:#cbd5e1;font-weight:600;">${escapeHtml(epDesc)}</div>
            <div class="media-card-desc" style="margin-top:2px;">${escapeHtml(subText)}</div>
          </div>`;
        card.onclick = onPlay;
        bindHoldVideoInfo(card, { name, relPath: k, fullPath: k });
        historyGrid.appendChild(card);
        attachThumb(card.querySelector('.history-thumb'), k, 'video', name);
      };

      keys.forEach((k, idx) => {
        const item = historyCache[k];
        const itemPct = Math.min(100, Number(item.percent) || 0);
        mkCard(
          item.name,
          k,
          `${formatTime(item.time)} / ${formatTime(item.dur)} (${itemPct}%)`,
          itemPct,
          () => { inspectMediaAndPlay(item.name, k, resumeStartTime(item)); navigateTo('player'); },
          ''
        );
        if (idx === 0 && at >= 0) {
          for (let n = 1; n <= 3 && list[at + n]; n++) {
            const ep = list[at + n];
            const rel = ep.relPath || ep.fullPath;
            mkCard(
              ep.name,
              rel,
              n === 1 ? 'Up next' : `In ${n} episodes`,
              0,
              () => { inspectMediaAndPlay(ep.name, rel, 0); navigateTo('player'); },
              n === 1 ? 'NEXT' : `NEXT ${n}`
            );
          }
        }
      });

      // Refresh watched counts on library cards
      renderDashboard(homeQuickSearch ? homeQuickSearch.value.trim() : '');
    } else {
      heroTitle.textContent = 'No active anime';
      if (heroEpSub) heroEpSub.textContent = '';
      heroProgressPill.textContent = '0%';
      if (heroBar) heroBar.style.width = '0%';
      if (heroNextBtn) heroNextBtn.style.display = 'none';
      if (heroPreview) heroPreview.style.display = 'none';
      if (heroBg) heroBg.style.backgroundImage = '';
      heroSynopsis.textContent = 'Pick an episode below to start watching.';
      if (heroResumeLabel) heroResumeLabel.textContent = 'Start Watching';
      heroResumeBtn.onclick = () => {
        const first = Object.keys(fullLibrary)[0];
        if (!first) { navigateTo('library'); return; }
        currentPathTokens = first === 'Anime Root' ? [] : first.split(' / ');
        currentVideoList = fullLibrary[first];
        const ep = currentVideoList[0];
        inspectMediaAndPlay(ep.name, ep.relPath || ep.fullPath, 0);
        navigateTo('player');
      };
      historyGrid.innerHTML = '<span class="empty-hint">No watch history yet</span>';
    }
  } catch (e) { console.error("renderHistory", e); }
}
async function clearHistory() {
  if (!(await astraConfirm('All saved watch progress will be removed.', { title: 'Clear watch history?', ok: 'Clear', danger: true }))) return;
  try {
    await fetch('/api/history/clear', { method: 'POST' });
  } catch (e) {
    showToast('Could not reach the server');
    return;
  }
  historyCache = {};
  lsRemove('astra_active_playback_state');
  renderDashboard();
  renderHistory();
  showToast('Watch history cleared', 2000);
}

const btnRescanLibrary = $('btnRescanLibrary');
if (btnRescanLibrary) {
  btnRescanLibrary.onclick = async () => {
    btnRescanLibrary.disabled = true;
    await loadLibrary(true);
    btnRescanLibrary.disabled = false;
    const eps = Object.values(fullLibrary).reduce((n, list) => n + list.length, 0);
    showToast(`Library rescanned — ${Object.keys(fullLibrary).length} series, ${eps} episodes`);
  };
}

$('resetHistoryFileBtn').onclick = clearHistory;
$('openClearHistoryModalBtn').onclick = clearHistory;

/* ------------------------------------------------------------------ */
/* Chapters                                                            */
/* ------------------------------------------------------------------ */
const chapterMarks = $('chapterMarks');
const chapterLabel = $('chapterLabel');
const chaptersBtn = $('chaptersBtn');
const chaptersPanel = $('chaptersPanel');
const chaptersList = $('chaptersList');
const skipChapterBtn = $('skipChapterBtn');
const skipChapterText = $('skipChapterText');
const SKIPPABLE = /^(op|ed|opening|ending|intro|recap|preview|credits|next episode)|opening|ending|\bop\b|\bed\b|recap|preview/i;
let chapters = [];
let chapterIdx = -1;
let autoSkipped = new Set();

function chapterAt(t) {
  for (let i = chapters.length - 1; i >= 0; i--) if (t >= chapters[i].start - 0.05) return chapters[i];
  return null;
}
function chapterTime(s) { return formatTime(s); }

function renderChapterMarks() {
  if (!chapterMarks) return;
  chapterMarks.innerHTML = '';
  const dur = getDuration();
  if (!dur) return;
  chapters.forEach((c, i) => {
    if (i === 0 || c.start <= 0 || c.start >= dur) return;
    const m = document.createElement('i');
    m.style.left = `${(c.start / dur) * 100}%`;
    chapterMarks.appendChild(m);
  });
}

function renderChapterList() {
  chaptersList.innerHTML = '';
  chapters.forEach((c, i) => {
    const row = document.createElement('div');
    row.className = 'chapter-row';
    row.dataset.i = i;
    row.innerHTML = `<span class="chapter-time">${chapterTime(c.start)}</span><span class="chapter-name">${escapeHtml(c.title)}</span>`;
    row.onclick = () => { seekToTargetSecond(c.start); chaptersPanel.classList.remove('open'); resetHideTimer(); };
    chaptersList.appendChild(row);
  });
}

function setChapters(list) {
  chapters = (Array.isArray(list) ? list : []).filter((c) => Number.isFinite(c.start))
    .map((c, i) => ({ start: c.start, end: c.end, title: c.title || `Chapter ${i + 1}` }));
  chapterIdx = -2; // force refresh on next tick
  autoSkipped = new Set();
  const has = chapters.length > 0;
  if (chaptersBtn) chaptersBtn.style.display = has ? '' : 'none';
  if (chapterLabel) { chapterLabel.textContent = ''; chapterLabel.style.display = 'none'; }
  if (typeof syncSkipOrNextEpButton === 'function') syncSkipOrNextEpButton(false, false);
  if (chaptersPanel) chaptersPanel.classList.remove('open');
  renderChapterMarks();
  renderChapterList();
}

function syncSkipOrNextEpButton(hasNextChapter, skippable) {
  if (!skipChapterBtn) return;
  const activeIdx = currentVideoList.findIndex(isActiveItem);
  const hasNextEp = activeIdx >= 0 && activeIdx < currentVideoList.length - 1;

  if (hasNextChapter) {
    skipChapterBtn.style.display = 'inline-flex';
    skipChapterText.textContent = 'NEXT';
    skipChapterBtn.dataset.mode = 'chapter';
    skipChapterBtn.classList.remove('next-ep-mode');
    skipChapterBtn.classList.toggle('highlight', !!skippable);
  } else if (hasNextEp) {
    skipChapterBtn.style.display = 'inline-flex';
    skipChapterText.textContent = 'NEXT EP';
    skipChapterBtn.dataset.mode = 'episode';
    skipChapterBtn.classList.remove('highlight');
    skipChapterBtn.classList.add('next-ep-mode');
  } else {
    skipChapterBtn.style.display = 'none';
    skipChapterBtn.dataset.mode = '';
  }
}

function onChapterTick(t) {
  if (!chapters.length) {
    syncSkipOrNextEpButton(false, false);
    return;
  }
  const cur = chapterAt(t);
  const idx = cur ? chapters.indexOf(cur) : -1;
  if (idx === chapterIdx) return;
  chapterIdx = idx;
  if (chapterLabel) { chapterLabel.textContent = cur ? cur.title : ''; chapterLabel.style.display = cur ? 'inline-flex' : 'none'; }
  chaptersList.querySelectorAll('.chapter-row').forEach((r) => r.classList.toggle('current', Number(r.dataset.i) === idx));
  const hasNext = idx >= 0 && idx < chapters.length - 1;
  const skippable = cur && SKIPPABLE.test(cur.title);
  syncSkipOrNextEpButton(hasNext, skippable);
  if (prefs.autoSkip && skippable && hasNext && !autoSkipped.has(idx) && cur.end - t > 2) {
    autoSkipped.add(idx);
    showToast(`Skipped ${cur.title}`, 1500);
    seekToTargetSecond(cur.end + 0.05);
  }
}

function stepChapter(dir) {
  if (isScreenLocked || !chapters.length) return;
  const t = absoluteTime();
  const cur = chapterAt(t);
  let idx = cur ? chapters.indexOf(cur) : 0;
  if (dir < 0) idx = (t - chapters[idx].start > 3) ? idx : idx - 1;
  else idx += 1;
  if (idx < 0) idx = 0;
  if (idx >= chapters.length) return;
  seekToTargetSecond(chapters[idx].start);
  showToast(chapters[idx].title, 1200);
}
function toggleChaptersPanel() {
  if (!chapters.length || isScreenLocked) return;
  playerEpisodesDrawer.classList.remove('open');
  settingsModal.classList.remove('open');
  chaptersPanel.classList.toggle('open');
  const cur = chaptersList.querySelector('.chapter-row.current');
  if (cur) cur.scrollIntoView({ block: 'center' });
}
if (chaptersBtn) chaptersBtn.onclick = (e) => { e.stopPropagation(); toggleChaptersPanel(); };
$('chaptersClose').onclick = () => chaptersPanel.classList.remove('open');
if (skipChapterBtn) skipChapterBtn.onclick = async (e) => {
  e.stopPropagation();
  if (skipChapterBtn.dataset.mode === 'episode') {
    const oldPath = activeVideoPath;
    const oldTitle = playerCurrentTitle.textContent;
    const oldDur = getDuration() || 100;
    if (oldPath) {
      await syncHistoryToServer(oldPath, oldTitle, oldDur, oldDur);
    }
    playAdjacentEpisode(1);
    return;
  }
  stepChapter(1);
};
video.addEventListener('durationchange', renderChapterMarks);
video.addEventListener('loadedmetadata', renderChapterMarks);

/* ------------------------------------------------------------------ */
/* Transcode pre-buffer / rebuffer                                     */
/* ------------------------------------------------------------------ */
let rebufferTimer = null;
function bufferedAhead() {
  const t = video.currentTime;
  for (let i = 0; i < video.buffered.length; i++) {
    if (video.buffered.start(i) <= t + 0.3 && video.buffered.end(i) >= t) return video.buffered.end(i) - t;
  }
  return 0;
}
function endRebuffer(resume = true) {
  clearInterval(rebufferTimer); rebufferTimer = null;
  if (!internalPause) return;
  internalPause = false;
  playerBufferingIndicator.classList.remove('show');
  if (resume) video.play().catch(() => {});
}
function startRebuffer() {
  if (internalPause) return;
  internalPause = true;
  const token = playToken;
  const began = Date.now();
  let best = 0, lastGain = Date.now();
  video.pause();
  playerBufferingIndicator.classList.add('show');
  rebufferTimer = setInterval(() => {
    if (token !== playToken || !isTranscodingMode) { endRebuffer(false); return; }
    const dur = getDuration() || 0;
    const remaining = dur ? Math.max(0, dur - absoluteTime()) : 999;
    const target = Math.min(needBuf(), remaining - 1);
    const ahead = bufferedAhead();
    probeLoadingText.textContent = `Buffering ${Math.floor(ahead)}s / ${Math.floor(target)}s`;
    if (ahead > best + 0.3) { best = ahead; lastGain = Date.now(); }
    // stop waiting when the encoder is not producing anything new (slow phone), instead of staring at 0s
    if (ahead >= target || Date.now() - began > 30000 || (Date.now() - lastGain > 8000 && Date.now() - began > 8000)) endRebuffer(true);
  }, 400);
}
// A manual play/pause press during a rebuffer simply ends the wait.
const _togglePlayPause = togglePlayPause;
togglePlayPause = function () {
  if (internalPause) {                 // honour-pause-while-buffering: the user pressed pause while we were buffering
    endRebuffer(false);
    updatePlayButtonIcon(false);
    notifyStreamPause();
    resetHideTimer();
    return;
  }
  _togglePlayPause();
};

/* Auto resolution: watch the transcoder speed, step down when it cannot keep up */
let autoSlowHits = 0, autoLastStep = 0;
setInterval(async () => {
  if (prefs.quality !== 'auto' || qualityOverride || !isTranscodingMode || !isCurrentFile10Bit || video.paused || internalPause || document.hidden) { autoSlowHits = 0; return; }
  if (autoLevel >= AUTO_LEVELS.length - 1 || Date.now() - autoLastStep < 15000) return;
  try {
    const st = await (await fetch('/api/transcode/stats')).json();
    if (!st.active || !st.speed || st.age > 4000) return;
    const starving = bufferedAhead() < 4;
    autoSlowHits = (st.speed < 0.95 && starving) ? autoSlowHits + 1 : 0;
    if (autoSlowHits >= 2) {
      autoSlowHits = 0; autoLastStep = Date.now(); autoLevel++;
      const h = { balanced: 720, fast: 480, low: 360 }[AUTO_LEVELS[autoLevel]];
      showToast(`Decoder at ${st.speed.toFixed(2)}x \u2192 switching to ${h}p`, 3000);
      seekToTargetSecond(absoluteTime(), true, true);   // auto-step-restart
    }
  } catch (e) {}
}, 2500);


/* ===== v1.26.1 Online Original Covers, Task Reporting & Ambient Background ===== */
const onlineMetaCache = new Map();

function cleanSeriesQuery(raw) {
  const firstPart = String(raw || "").split("/")[0].trim();
  const noSeason = firstPart.replace(/\b(season|s)\s*0*\d+\b/gi, "").trim();
  return parseMedia(noSeason || firstPart).title || noSeason || firstPart;
}

async function fetchOnlineArtwork(rawTitle) {
  if (prefs.networkMode !== "online" || !rawTitle) return null;
  const title = cleanSeriesQuery(rawTitle);
  const q = prefs.thumbQuality || "360p";
  const key = `${title.toLowerCase()}|${q}`;
  if (onlineMetaCache.has(key)) return onlineMetaCache.get(key);
  try {
    const res = await fetch(`/api/meta/online?title=${encodeURIComponent(title)}&q=${encodeURIComponent(q)}`);
    const data = await res.json();
    if (data && data.error) {
      showToast(`Online cover error: ${data.error}`, 3000);
    }
    onlineMetaCache.set(key, data && data.found ? data : null);
    return onlineMetaCache.get(key);
  } catch (e) {
    showToast("Online cover fetch failed (check internet)", 3000);
    return null;
  }
}

function applyAmbientBackground(imgUrl) {
  const bg = $("astraAmbientBg");
  const hero = $("heroBanner");
  const pw = $("playerWrapper");
  const active = !!imgUrl && prefs.networkMode === "online";
  if (bg) {
    bg.style.backgroundImage = active ? `url("${imgUrl}")` : "";
    bg.classList.toggle("active", active);
  }
  if (hero) {
    if (active) {
      hero.style.backgroundImage = `linear-gradient(90deg, rgba(18,24,36,0.92) 30%, rgba(18,24,36,0.62) 100%), url("${imgUrl}")`;
      hero.style.backgroundSize = "cover";
      hero.style.backgroundPosition = "center";
    } else {
      hero.style.backgroundImage = "";
    }
  }
  if (pw) {
    pw.style.boxShadow = active ? "0 12px 40px rgba(37, 99, 235, 0.28)" : "";
  }
}

async function syncOnlineArtworkForActive() {
  if (prefs.networkMode !== "online" || !activeVideoPath) {
    applyAmbientBackground("");
    return;
  }
  const seriesName = currentPathTokens[0] || activeVideoPath.split("/").pop() || "";
  const meta = await fetchOnlineArtwork(seriesName);
  if (meta && meta.found && meta.localUrl) {
    applyAmbientBackground(meta.localUrl);
  } else {
    applyAmbientBackground("");
  }
}

/* ------------------------------------------------------------------ */
/* Thumbnails (lazy, 2 at a time, cached in memory + server disk)      */
/* ------------------------------------------------------------------ */
const thumbCache = new Map();
const thumbQueue = [];
let thumbActive = 0;
const thumbObserver = ('IntersectionObserver' in window) ? new IntersectionObserver((entries) => {
  entries.forEach((en) => {
    if (!en.isIntersecting) return;
    thumbObserver.unobserve(en.target);
    const job = en.target._thumbJob;
    if (job) { thumbQueue.push(job); pumpThumbs(); }
  });
}, { rootMargin: '200px' }) : null;

function pumpThumbs() {
  while (thumbActive < 2 && thumbQueue.length) {
    const job = thumbQueue.shift();
    thumbActive++;
    loadThumb(job).finally(() => { thumbActive--; pumpThumbs(); });
  }
}
function setThumbFallback(el) {
  if (!el) return;
  el.style.backgroundImage = '';
  el.classList.remove('has-img');
  el.classList.add('thumb-fallback');
}
function setThumbImage(el, url) {
  if (!el || !url) return false;
  const probe = new Image();
  probe.onload = () => {
    if (!el.isConnected) return;
    el.style.backgroundImage = `url("${url}")`;
    el.classList.add('has-img');
    el.classList.remove('thumb-fallback');
  };
  probe.onerror = () => setThumbFallback(el);
  probe.src = url;
  return true;
}
async function loadThumb(job) {
  const { el, file, kind } = job;
  if (!el.isConnected) return;
  const key = `${kind}:${file}`;
  let url = thumbCache.get(key);
  if (!url) {
    try {
      const res = await fetch(`/api/thumb?file=${encodeURIComponent(file)}&kind=${kind}${prefs.networkMode === 'online' ? '&online=1' : ''}`);
      if (res.status === 200) {
        url = URL.createObjectURL(await res.blob());
        thumbCache.set(key, url);
      } else if (res.status === 204 && (job.tries = (job.tries || 0) + 1) <= 3) {
        setTimeout(() => { if (el.isConnected) { thumbQueue.push(job); pumpThumbs(); } }, 20000);
        return;
      } else {
        setThumbFallback(el);
      }
    } catch (e) { setThumbFallback(el); return; }
  }
  if (url && el.isConnected) setThumbImage(el, url);
  else if (el.isConnected && !job.tries) setThumbFallback(el);
}
let customThumbKeys = new Set(), customThumbStamp = Date.now();
function loadCustomThumbs() {
  return fetch('/api/thumbs/custom').then((r) => r.json()).then((d) => { customThumbKeys = new Set(d.keys || []); customThumbStamp = Date.now(); }).catch(() => {});
}
/* Themed text covers (offline / no artwork): tinted card + coloured title */
const COVER_HUES = [
  [/code[\s._-]*geass/i, 214],   // Code Geass -> theme blue
  [/eminence/i, 214],
  [/darling|franxx/i, 330],
  [/youtube|downloads|videos|telegram/i, 2]
];
function coverHue(text) {
  for (const [re, h] of COVER_HUES) if (re.test(text)) return h;
  let n = 0;
  for (let i = 0; i < text.length; i++) n = (n * 31 + text.charCodeAt(i)) % 360;
  return n;
}
function applyTextCover(el, text, hueSource) {
  const t = (text || '').trim() || '▶';
  el.classList.remove('has-img');
  el.style.backgroundImage = '';
  el.style.setProperty('--cv-h', coverHue(hueSource || t));
  el.dataset.cover = t;
  el.classList.add('text-cover');
}

function attachThumb(el, file, kind, label) {
  if (!el) return;
  el.dataset.initial = (cleanMediaTitle(label || '').trim()[0] || '▶').toUpperCase();
  if (!prefs.thumbs || !file) return;
  const isCoverEl = el.classList.contains('c1-series-thumb') || el.classList.contains('history-thumb');
  if (isCoverEl && !(kind === 'series' && label && customThumbKeys.has(label))) {
    const useOnline = prefs.networkMode === 'online' && kind === 'series' && label;
    const textFor = () => {
      if (kind === 'series') return cleanSeriesQuery(label) || cleanMediaTitle(label);
      const h = formatCardHeader(label || '');
      return h.tag || h.title;
    };
    const cover = () => applyTextCover(el, textFor(), kind === 'series' ? label : (formatCardHeader(label || '').title));
    if (!useOnline) { cover(); return; }
    cover();   // show the cover immediately, swap to real artwork if found
    fetchOnlineArtwork(label).then((meta) => {
      if (meta && meta.found && meta.localUrl && el.isConnected) {
        el.classList.remove('text-cover');
        el.style.backgroundImage = `url("${meta.localUrl}")`;
        el.classList.add('has-img');
        applyAmbientBackground(meta.localUrl);
      }
    });
    return;
  }
  if (kind === "series" && label && customThumbKeys.has(label)) {
    // custom thumbnail from config.json always wins
    const u = "/api/thumb/custom?key=" + encodeURIComponent(label) + "&v=" + customThumbStamp;
    el.style.backgroundImage = `url("${u}")`; el.classList.add("has-img");
    return;
  }
  if (prefs.networkMode === "online" && kind === "series" && label) {
    const seriesHint = label;
    fetchOnlineArtwork(seriesHint).then((meta) => {
      if (meta && meta.found && meta.localUrl && el.isConnected) {
        el.style.backgroundImage = `url("${meta.localUrl}")`;
        el.classList.add("has-img");
        if (kind === "series") applyAmbientBackground(meta.localUrl);
        return;
      }
      el._thumbJob = { el, file, kind };
      if (thumbObserver) thumbObserver.observe(el);
      else { thumbQueue.push(el._thumbJob); pumpThumbs(); }
    });
    return;
  }
  el._thumbJob = { el, file, kind };
  if (thumbObserver) thumbObserver.observe(el);
  else { thumbQueue.push(el._thumbJob); pumpThumbs(); }
}

/* ------------------------------------------------------------------ */
/* Sleep timer & preferences panel                                     */
/* ------------------------------------------------------------------ */
function setSleep(min) {
  clearTimeout(sleepTimerId); sleepTimerId = null; sleepAtEnd = false;
  const txt = $('sleepText'); const sel = $('prefSleep');
  if (min > 0) {
    sleepTimerId = setTimeout(() => {
      video.pause(); notifyStreamPause();
      showToast('Sleep timer: paused', 4000);
      if (txt) txt.textContent = 'Off'; if (sel) sel.value = '0';
    }, min * 60000);
    if (txt) txt.textContent = `Pauses in ${min} min`;
  } else if (min < 0) {
    sleepAtEnd = true;
    if (txt) txt.textContent = 'Stops after this episode';
  } else if (txt) txt.textContent = 'Off';
}

function applyFill() { playerWrapper.classList.toggle('fit-fill', !!prefs.fsFill); }
function initPrefsPanel() {
  const bind = (id, key, num) => {
    const el = $(id); if (!el) return;
    if (el.type === 'checkbox') { el.checked = !!prefs[key]; el.onchange = () => { prefs[key] = el.checked; savePrefs(); }; }
    else { el.value = String(prefs[key]); el.onchange = () => { prefs[key] = num ? Number(el.value) : el.value; savePrefs(); }; }
  };
  bind('prefSeek', 'seekStep', true);
  bind('prefNetworkMode', 'networkMode');
  const syncNetUi = () => {
    const r = $("rowThumbQuality");
    if (r) r.style.display = prefs.networkMode === "online" ? "" : "none";
  };
  syncNetUi();
  bind('prefThumbQuality', 'thumbQuality');
  const tqSel = $("prefThumbQuality");
  if (tqSel) tqSel.addEventListener("change", () => {
    onlineMetaCache.clear();
    renderDashboard();
    renderHistory();
    if (activeVideoPath) syncOnlineArtworkForActive();
    showToast(`Online thumbnail quality: ${prefs.thumbQuality}`, 1800);
  });
  const netSel = $("prefNetworkMode");
  if (netSel) netSel.addEventListener("change", () => {
    syncNetUi();
    onlineMetaCache.clear();
    applyAmbientBackground("");
    renderDashboard();
    renderHistory();
    if (activeVideoPath) syncOnlineArtworkForActive();
    showToast(prefs.networkMode === "online" ? "Online mode: fetching original thumbnails & backgrounds" : "Offline mode: local media only", 2400);
  }); bind('prefQuality', 'quality'); bind('prefAutoPlay', 'autoPlay'); bind('prefLite', 'lite');
  bind('prefAutoSkip', 'autoSkip'); bind('prefFsRotate', 'fsRotate'); bind('prefAutoNext', 'autoNext');
  bind('prefHw', 'hwEnc');
  bind('prefFsFill', 'fsFill'); $('prefFsFill').addEventListener('change', applyFill); applyFill();
  const th = $('prefThumbs');
  if (th) { th.checked = !!prefs.thumbs; th.onchange = () => { prefs.thumbs = th.checked; savePrefs(); renderDashboard(); renderHistory(); }; }
  $('prefSleep').onchange = (e) => setSleep(Number(e.target.value));
  $('prefQuality').addEventListener('change', () => {
    if (isTranscodingMode && activeVideoPath) { showToast('Applying quality...', 1500); seekToTargetSecond(absoluteTime(), true, true); /* quality-restart */ }
  });
  $('btnClearThumbs').onclick = async () => {
    try { await fetch('/api/thumbs/clear', { method: 'POST' }); } catch (e) {}
    thumbCache.forEach((u) => URL.revokeObjectURL(u)); thumbCache.clear();
    showToast('Thumbnail cache cleared', 2000); renderDashboard(); renderHistory();
  };
  fetch('/api/system/capabilities').then((r) => r.json()).then((c) => {
    $('prefHwText').textContent = prefs.hwEnc === 'auto' && c.hwEncoder
      ? `HEVC → H.264: hardware encoder (${c.hwEncoder}) first, software fallback`
      : 'HEVC → H.264: software x264 (v1.3 engine)';
  }).catch(() => {});
}
initPrefsPanel();

/* ------------------------------------------------------------------ */
/* AI subtitles (whisper.cpp on the server, fully offline)             */
/* ------------------------------------------------------------------ */
const aiUi = {
  box: $('aiBox'), state: $('aiState'), bar: $('aiBar'), prog: $('aiProgress'), hint: $('aiHint'), chip: $('aiChip'),
  gen: $('aiGenBtn'), all: $('aiGenAllBtn'), cancel: $('aiCancelBtn'), lang: $('aiLang'), tr: $('aiTranslate'), songs: $('aiSongs'), online: $('aiOnline'), files: $('aiFiles')
};
let aiMode = 'quick', aiLocal = true;
const AI_ONLINE_SAVE = 'astra_ai_online';
let aiVad = true;
const AI_MODE_TEXT = {
  quick: 'Quick: smallest model, only the speech is read. Fast, but it can mishear or miss words.',
  ai: 'AI: a better model. Slower, but much more accurate. Best for dialogue you really want to follow.'
};
function setAiMode(m, save) {
  aiMode = m === 'ai' ? 'ai' : 'quick';
  document.querySelectorAll('[data-aimode]').forEach((b) => b.classList.toggle('active', b.dataset.aimode === aiMode));
  if (aiUi.hint) aiUi.hint.textContent = AI_MODE_TEXT[aiMode] + (aiVad ? '' : ' Install the speech-detection model for a big speed-up (README).');
  if (save && activeVideoPath) { aiRowKey = null; aiCheck(activeVideoPath, false); }
  if (save) saveCurrentSettings();
}
document.querySelectorAll('[data-aimode]').forEach((b) => { b.onclick = () => setAiMode(b.dataset.aimode, true); });
let aiAvailable = false;
let aiPoll = null;
let aiActiveKey = null;
let aiRowKey = null;
let aiLastCues = -1;

function aiQuery(file) {
  return `file=${encodeURIComponent(file)}&audioTrack=${encodeURIComponent(activeAudioStreamIndex)}`
    + `&lang=${aiUi.lang.value}&translate=${aiUi.tr.checked ? 1 : 0}&mode=${aiMode}&songs=${aiUi.songs.checked ? 1 : 0}${aiUi.online.checked ? '&online=1' : ''}`;
}
const aiMeta = document.createElement('div'); aiMeta.className = 'ai-meta';
const aiLive = document.createElement('div'); aiLive.className = 'ai-live';
const aiErr = document.createElement('div'); aiErr.className = 'ai-err';
aiUi.prog.after(aiMeta, aiLive, aiErr);
const fmtDur = (sec) => { sec = Math.max(0, Math.round(sec)); const m = Math.floor(sec / 60), r = sec % 60; return m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`; };
function aiShow(info) {
  const active = info && ['queued', 'extracting', 'transcribing'].includes(info.state);
  aiUi.prog.classList.toggle('on', !!active || (info && info.state === 'done'));
  aiUi.bar.style.width = `${info ? info.pct || 0 : 0}%`;
  aiUi.cancel.style.display = active ? '' : 'none';
  aiUi.gen.disabled = !aiAvailable || !!active;
  aiUi.all.disabled = !aiAvailable;
  let txt = '';
  if (info) {
    if (info.state === 'queued') txt = `Waiting${info.queued ? ` (${info.queued} in queue)` : ''}`;
    else if (info.state === 'transcribing') txt = `${info.pct}%`;
    else if (info.state === 'done') txt = 'Ready';
    else if (info.state === 'error') txt = 'Failed';
    else if (info.state === 'cancelled') txt = 'Cancelled';
  }
  aiUi.state.textContent = txt;
  aiMeta.textContent = '';
  if (info && info.state === 'transcribing') {
    const left = info.eta != null ? ` · ~${fmtDur(info.eta)} left` : '';
    aiMeta.innerHTML = `<span>${info.mode === 'quick' ? 'Quick' : 'AI'} \u00b7 part ${info.chunk} of ${info.chunks}${left}</span><span>${fmtDur(info.elapsed)} elapsed${info.queued ? ` · ${info.queued} queued` : ''}</span>`;
  }
  aiLive.textContent = info && info.state === 'transcribing' && info.last ? `\u201c${info.last}\u201d` : '';
  aiErr.textContent = info && info.state === 'error' ? (info.msg || 'Subtitle generation failed') : '';
  aiUi.chip.style.display = active ? '' : 'none';
  if (active) aiUi.chip.textContent = `Subs ${Math.round(info.pct)}%`;
  aiUi.files.textContent = '';
  if (info && info.state === 'done' && info.key) {
    const nm = document.createElement('div'); nm.className = 'ai-file-name'; nm.textContent = info.name || 'Subtitles';
    const row = document.createElement('div'); row.className = 'ai-file-links';
    ['srt', 'vtt'].forEach((f) => { const a = document.createElement('a'); a.href = `/api/ai/subs/download?key=${info.key}&fmt=${f}`; a.textContent = f.toUpperCase(); a.setAttribute('download', ''); row.appendChild(a); });
    aiUi.files.append(nm, row);
  }
}
function aiRowLabel(meta) { return `${meta.mode === 'quick' ? 'Quick' : 'AI'} \u00b7 ${meta.lang === 'auto' ? 'auto-detect' : meta.lang}${meta.translate ? ' \u2192 English' : ''}`; }
function aiAddRow(key, meta) {
  const have = [...subTrackList.querySelectorAll('[data-ai-key]')].find((r) => r.dataset.aiKey === key);
  if (have) { if (meta) have.textContent = aiRowLabel(meta); aiRowKey = key; return have; }      // every generated subtitle stays in the list
  const row = document.createElement('div');
  row.className = 'opt-row';
  row.dataset.aiKey = key;
  row.textContent = meta ? aiRowLabel(meta) : (aiMode === 'quick' ? 'Quick subtitles' : 'AI subtitles');
  row.onclick = () => { selectOptRow(subTrackList, row); selectSubtitleUrl(`/api/ai/subs/vtt?key=${key}`); vpSet(activeVideoPath, { sub: 'ai:' + key }); };
  subTrackList.appendChild(row);
  aiRowKey = key;
  return row;
}
async function aiCheck(file, autoUse) {
  try {
    const info = await (await fetch(`/api/ai/subs?${aiQuery(file)}&from=${Math.floor(absoluteTime() || 0)}`)).json();
    if (info.error) return null;
    aiShow(info);
    if (info.state === 'done') {
      const row = aiAddRow(info.key);
      if (autoUse && row) { selectOptRow(subTrackList, row); selectSubtitleUrl(`/api/ai/subs/vtt?key=${info.key}`); }
    }
    return info;
  } catch (e) { return null; }
}
function aiStartPolling(file) {
  clearInterval(aiPoll);
  const forPath = file;
  aiPoll = setInterval(async () => {
    if (forPath !== activeVideoPath) { clearInterval(aiPoll); return; }
    const info = await aiCheck(forPath, false);
    if (!info) return;
    if (info.state === 'transcribing' && info.partial && info.cues !== aiLastCues) {      // live: show what is done so far
      aiLastCues = info.cues;
      const row = aiAddRow(info.key);
      const sel = subTrackList.querySelector('.opt-row.selected');
      if (row && (sel === row || !sel || sel.textContent.trim() === 'Off')) { selectOptRow(subTrackList, row); selectSubtitleUrl(`/api/ai/subs/vtt?key=${info.key}`); }
    }
    if (info.state === 'done') {
      clearInterval(aiPoll);
      showToast('Subtitles generated', 3000);
      const row = aiAddRow(info.key);
      if (row) { selectOptRow(subTrackList, row); selectSubtitleUrl(`/api/ai/subs/vtt?key=${info.key}`); vpSet(activeVideoPath, { sub: 'ai:' + info.key }); }
    } else if (['error', 'cancelled', 'none'].includes(info.state)) {
      clearInterval(aiPoll);
      if (info.state === 'error') showToast(info.msg || 'Subtitle generation failed', 5000);
    }
  }, 1500);
}
async function aiGenerate(file, priority) {
  const res = await fetch('/api/ai/subs', {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file, audioTrack: activeAudioStreamIndex, lang: aiUi.lang.value, translate: aiUi.tr.checked, songs: aiUi.songs.checked, online: aiUi.online.checked, mode: aiMode, priority: !!priority, from: priority ? Math.floor(absoluteTime() || 0) : 0 })
  });
  return res.json();
}
aiUi.gen.onclick = async () => {
  if (!activeVideoPath) return;
  const info = await aiGenerate(activeVideoPath, true);
  if (info.error) { showToast(info.error, 5000); return; }
  aiShow(info);
  if (info.state === 'done') { aiCheck(activeVideoPath, true); return; }
  aiStartPolling(activeVideoPath);
};
aiUi.all.onclick = async () => {
  if (!activeVideoPath) return;
  let n = 0;
  for (const it of currentVideoList) {
    const f = it.relPath || it.fullPath;
    if (!f) continue;
    const info = await aiGenerate(f, f === activeVideoPath);
    if (info && !info.error && info.state !== 'done') n++;
  }
  showToast(n ? `Queued ${n} episode${n > 1 ? 's' : ''} — they run one at a time` : 'All episodes already have subtitles', 3500);
  aiCheck(activeVideoPath, false).then((i) => { if (i && ['queued', 'extracting', 'transcribing'].includes(i.state)) aiStartPolling(activeVideoPath); });
};
aiUi.cancel.onclick = async () => {
  const info = await aiCheck(activeVideoPath, false);
  if (info && info.key) await fetch('/api/ai/subs/cancel', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: info.key }) });
  clearInterval(aiPoll);
  aiCheck(activeVideoPath, false);
};
[aiUi.lang, aiUi.tr, aiUi.songs, aiUi.online].forEach((el) => el.addEventListener('change', () => { if (activeVideoPath) aiCheck(activeVideoPath, false); }));
async function aiLoadExisting(path) {
  try {
    const d = await (await fetch(`/api/ai/subs/for?file=${encodeURIComponent(path)}`)).json();
    if (path !== activeVideoPath) return;
    const items = d.items || [];
    const done = items.filter((i) => i.state === 'done');
    const best = done.find((i) => i.mode !== 'quick') || done[0];
    if (best) {
      const rows = new Map();
      done.slice().sort((a, b) => (a.mode === 'quick') - (b.mode === 'quick')).forEach((i) => rows.set(i.key, aiAddRow(i.key, i)));      // AI first, then Quick: all stay selectable
      const vp = vpGet(path);
      const sel = subTrackList.querySelector('.opt-row.selected');
      const nothing = !sel || sel.textContent.trim() === 'Off';
      const wantKey = vp.sub && vp.sub.startsWith('ai:') ? vp.sub.slice(3) : null;
      const pick = wantKey && rows.get(wantKey) ? done.find((i) => i.key === wantKey) : best;
      if (rows.get(pick.key) && (vp.sub === 'ai' || wantKey || (vp.sub === undefined && nothing))) { selectOptRow(subTrackList, rows.get(pick.key)); selectSubtitleUrl(`/api/ai/subs/vtt?key=${pick.key}`); }
      if ([...aiUi.lang.options].some((o) => o.value === best.lang)) aiUi.lang.value = best.lang;
      aiUi.tr.checked = !!best.translate;
      aiUi.songs.checked = !!(best.songs);
      setAiMode(best.mode === 'quick' ? 'quick' : 'ai', false);
      aiShow({ state: 'done', pct: 100, key: best.key, name: best.name });
    }
  } catch (e) {}
}
function aiOnEpisodeLoaded() {
  aiRowKey = null; aiLastCues = -1;
  aiShow(null);
  if (activeVideoPath) {
    const vp = vpGet(activeVideoPath);
    setSubDelay(vp.delay || 0);
    if (vp.sub && vp.sub.startsWith('f:')) {                       // external subtitle file chosen earlier
      const full = vp.sub.slice(2);
      addExternalSubtitle(full.split('/').pop(), full);
    }
  }
  if (!aiAvailable && !activeVideoPath) return;
  if (activeVideoPath) {
    aiLoadExisting(activeVideoPath).then(() => {
      if (!aiAvailable || !activeVideoPath) return;
      aiCheck(activeVideoPath, false).then((info) => {
        if (info && ['queued', 'extracting', 'transcribing'].includes(info.state)) aiStartPolling(activeVideoPath);
      });
    });
  }
}
fetch('/api/ai/capabilities').then((r) => r.json()).then((c) => {
  aiAvailable = !!c.available;
  aiUi.gen.disabled = aiUi.all.disabled = !aiAvailable;
  aiLocal = !!c.local;
  aiVad = !!c.vad;
  setAiMode(aiMode, false);
  if (!aiAvailable) aiUi.hint.textContent = 'Needs whisper.cpp and a model on the device \u2014 see README "AI subtitles".';
}).catch(() => {});

/* ------------------------------------------------------------------ */
/* Task manager                                                        */
/* ------------------------------------------------------------------ */
const tasksList = $('tasksList');
let tasksData = [];
const fmtMin = (sec) => { sec = Math.max(0, Math.round(sec || 0)); const m = Math.floor(sec / 60), r = sec % 60; return m ? `${m}m ${String(r).padStart(2, '0')}s` : `${r}s`; };

function openByPath(relPath) {
  const key = Object.keys(fullLibrary).find((k) => fullLibrary[k].some((e) => (e.relPath || e.fullPath) === relPath));
  const h = historyCache[relPath];
  navigateTo('player');
  if (!key) {
    currentPathTokens = [];
    currentVideoList = [{ name: relPath.split('/').pop(), relPath }];
    inspectMediaAndPlay(relPath.split('/').pop(), relPath, h ? resumeStartTime(h) : 0);
    return;
  }
  const ep = fullLibrary[key].find((e) => (e.relPath || e.fullPath) === relPath);
  currentPathTokens = key === 'Anime Root' ? [] : key.split(' / ');
  currentVideoList = fullLibrary[key];
  inspectMediaAndPlay(ep.name, relPath, h ? resumeStartTime(h) : 0);
}

function taskGroup(t) {
  if (['transcribing', 'extracting', 'running', 'paused'].includes(t.state)) return 'active';
  if (t.state === 'queued') return 'queue';
  if (['error', 'failed'].includes(t.state)) return 'failed';
  if (['cancelled', 'aborted', 'stopped'].includes(t.state)) return 'aborted';
  return 'completed';
}

function taskCard(t) {
  const grp = taskGroup(t);
  const live = grp === 'active' || grp === 'queue';
  const card = document.createElement('div');
  card.className = `task-card ${t.state}`;

  const pct = t.pct == null ? (grp === 'completed' ? 100 : 0) : Math.max(0, Math.min(100, Number(t.pct)));
  const pctLabel = `${pct.toFixed(1)}%`;
  const chunkStr = (t.chunks && t.chunks > 0)
    ? `${Math.min(t.chunk || (grp === 'completed' ? t.chunks : 1), t.chunks)}/${t.chunks}`
    : (grp === 'completed' ? '1/1' : '0/1');

  const statusMeta = {
    active: { text: 'Active', cls: 'st-active' },
    queue: { text: 'Queue', cls: 'st-queue' },
    aborted: { text: 'Aborted', cls: 'st-aborted' },
    failed: { text: 'Error', cls: 'st-error' },
    completed: { text: 'Completed', cls: 'st-done' }
  }[grp];

  const linesNum = t.lines || 0;
  const spokenSample = t.last ? `: “${escapeHtml(t.last)}”` : '';
  let timeStr = '';
  if (grp === 'active') {
    timeStr = t.eta != null ? `Estimated Time: ${fmtMin(t.eta)}` : `Elapsed: ${fmtMin(t.elapsed || 0)}`;
  } else if (grp === 'queue') {
    timeStr = 'Waiting in queue';
  } else {
    timeStr = `Time Took: ${fmtMin(t.elapsed || 0)}`;
  }

  const errHtml = (grp === 'failed' && t.msg)
    ? `<div class="task-error-box">Error: ${escapeHtml(t.msg.replace(/^Error:\s*/i, ''))}</div>`
    : '';

  card.innerHTML = `
    <div class="task-top">
      <span class="task-kind">${escapeHtml(t.label)}</span>
      <span class="task-pill-status ${statusMeta.cls}"><i></i>${statusMeta.text}</span>
    </div>
    <div class="task-title">${escapeHtml(cleanMediaTitle(t.title || t.file || ''))}</div>
    <div class="task-prog-row">
      <span class="task-chunk-txt">${chunkStr}</span>
      <div class="task-track"><div class="task-track-fill" style="width:${pct}%"></div></div>
      <span class="task-pct-txt">${pctLabel}</span>
    </div>
    <div class="task-metrics-line" style="white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">[ ${linesNum} Lines${spokenSample} ]</div>
    <div class="task-metrics-line" style="color:var(--muted);font-size:0.72rem;">${timeStr}</div>
    ${errHtml}
    <div class="task-btns"></div>`;

  const btns = card.querySelector('.task-btns');
  const mk = (txt, cls, fn) => {
    const b = document.createElement('button');
    b.className = `pill-btn ${cls || ''}`;
    b.textContent = txt;
    b.onclick = fn;
    btns.appendChild(b);
  };

  if (live) {
    mk('Stop', 'danger', async () => {
      await fetch('/api/tasks/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id }) });
      refreshTasks();
    });
  }
  if (t.type === 'ai' && t.file) {
    mk('Open video', '', () => openByPath(t.file));
    if (grp === 'failed' || grp === 'aborted') {
      mk('Retry', 'highlight', async () => {
        await fetch('/api/ai/subs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: t.file, ...t.opts, priority: true }) });
        refreshTasks();
      });
    }
  }
  return card;
}

let taskFilter = 'all';
function renderTasks() {
  const active = tasksData.filter((t) => taskGroup(t) === 'active');
  const queue = tasksData.filter((t) => taskGroup(t) === 'queue').sort((a, b) => (a.created || 0) - (b.created || 0));
  const failed = tasksData.filter((t) => taskGroup(t) === 'failed');
  const aborted = tasksData.filter((t) => taskGroup(t) === 'aborted');
  const completed = tasksData.filter((t) => taskGroup(t) === 'completed');

  $('tasksSummary').textContent = tasksData.length
    ? `${active.length} Active  ·  ${queue.length} Queue  ·  ${failed.length} Error  ·  ${aborted.length} Aborted  ·  ${completed.length} Done`
    : 'No tasks yet';

  $('btnTasksStopAll').disabled = !(active.length + queue.length);
  $('btnTasksClear').disabled = !(failed.length + aborted.length + completed.length);

  const tabs = $('taskFilterTabs');
  if (tabs) tabs.querySelectorAll('[data-task-filter]').forEach((b) => b.classList.toggle('active', b.dataset.taskFilter === taskFilter));

  tasksList.textContent = '';
  if (!tasksData.length) {
    const e = document.createElement('div');
    e.className = 'empty-hint';
    e.textContent = 'No tasks yet. Active work and completed jobs will appear here.';
    tasksList.appendChild(e);
    return;
  }

  const appendSection = (label, list) => {
    if (!list.length) return;
    if (taskFilter === 'all') {
      const h = document.createElement('div');
      h.className = 'task-section-hdr';
      h.textContent = `${label} (${list.length})`;
      tasksList.appendChild(h);
    }
    list.forEach((t) => tasksList.appendChild(taskCard(t)));
  };

  if (taskFilter === 'all') {
    appendSection('Active', active);
    appendSection('Next in Queue', queue);
    appendSection('Error', failed);
    appendSection('Aborted (Stopped)', aborted);
    appendSection('Completed', completed);
  } else {
    const map = { active, queue, failed, aborted, completed };
    const list = map[taskFilter] || [];
    if (!list.length) {
      const e = document.createElement('div');
      e.className = 'empty-hint';
      e.textContent = `No ${taskFilter} tasks.`;
      tasksList.appendChild(e);
      return;
    }
    list.forEach((t) => tasksList.appendChild(taskCard(t)));
  }
}

const taskTabs = $('taskFilterTabs');
if (taskTabs) taskTabs.addEventListener('click', (e) => {
  const b = e.target.closest('[data-task-filter]');
  if (!b) return;
  taskFilter = b.dataset.taskFilter;
  renderTasks();
});

function updateTaskBadge(n) {
  const b = $('taskBadge');
  if (!b) return;
  b.textContent = n;
  b.style.display = n ? '' : 'none';
}

async function refreshTasks() {
  try {
    const d = await (await fetch('/api/tasks')).json();
    tasksData = d.tasks || [];
    const activeCount = tasksData.filter((t) => taskGroup(t) === 'active').length;
    const queueCount = tasksData.filter((t) => taskGroup(t) === 'queue').length;
    const errorCount = tasksData.filter((t) => taskGroup(t) === 'failed').length;
    const badge = $('taskBadge');
    if (badge) {
      const parts = [];
      if (activeCount) parts.push(`${activeCount} active`);
      if (queueCount) parts.push(`${queueCount} queue`);
      if (errorCount) parts.push(`${errorCount} error`);
      badge.textContent = parts.join(' · ') || String(tasksData.length);
      badge.style.display = tasksData.length ? '' : 'none';
    }
    if (currentView === 'tasks') renderTasks();
  } catch (e) {}
}

$('btnTasksStopAll').onclick = async () => {
  if (!(await astraConfirm('Everything running right now will be cancelled.', { title: 'Stop all tasks?', ok: 'Stop all', danger: true }))) return;
  await fetch('/api/tasks/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'all' }) });
  refreshTasks();
};
$('btnTasksClear').onclick = async () => { await fetch('/api/tasks/clear', { method: 'POST' }); refreshTasks(); };
setInterval(() => { if (!document.hidden) refreshTasks(); }, 1500);
refreshTasks();

{
  let t = null;
  const queue = () => { clearTimeout(t); t = setTimeout(saveCurrentSettings, 300); };
  ['input', 'change', 'click'].forEach((ev) => $('settingsModal').addEventListener(ev, queue, true));
  window.addEventListener('pagehide', saveCurrentSettings);
}

/* ------------------------------------------------------------------ */
/* Boot                                                                */
/* ------------------------------------------------------------------ */
loadSavedSettings();
{
  const boot = (window.location.hash || '').replace(/^#/, '');
  if (boot.startsWith('player/')) { pendingDeepLink = boot; navigateTo(boot); }
  else navigateTo(boot && boot !== 'player' ? boot : 'home');
}
loadLibrary(true);

/* ------------------------------------------------------------------ */
/* v1.15 precise sliders: - / + buttons (hold to repeat) around every settings slider */
(function fineSliders() {
  document.querySelectorAll('input.custom-range').forEach((rng) => {
    if (rng.parentElement.classList.contains('rng-wrap') || rng.closest('.vsl-wrap')) return;
    const wrap = document.createElement('div'); wrap.className = 'rng-wrap';
    rng.parentNode.insertBefore(wrap, rng);
    const mk = (txt, dir, label) => {
      const b = document.createElement('button'); b.type = 'button'; b.className = 'rng-btn'; b.textContent = txt; b.setAttribute('aria-label', label);
      const step = () => {
        const st = parseFloat(rng.step) || 1, mn = parseFloat(rng.min), mx = parseFloat(rng.max);
        const dec = (String(st).split('.')[1] || '').length;
        let v = Math.min(mx, Math.max(mn, parseFloat(rng.value) + dir * st));
        rng.value = v.toFixed(dec);
        rng.dispatchEvent(new Event('input', { bubbles: true })); rng.dispatchEvent(new Event('change', { bubbles: true }));
      };
      let t1 = null, t2 = null;
      const stop = () => { clearTimeout(t1); clearInterval(t2); };
      b.addEventListener('pointerdown', (e) => { e.preventDefault(); step(); t1 = setTimeout(() => { t2 = setInterval(step, 70); }, 450); });
      ['pointerup', 'pointerleave', 'pointercancel'].forEach((ev) => b.addEventListener(ev, stop));
      return b;
    };
    wrap.appendChild(mk('−', -1, 'Decrease'));
    wrap.appendChild(rng);
    wrap.appendChild(mk('+', 1, 'Increase'));
  });
})();

['play', 'pause', 'seeked', 'ratechange'].forEach((ev) => video.addEventListener(ev, () => setTimeout(assSyncAnims, 0)));

// small click animations on the player buttons (arrows nudge, speaker pops)
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('#rwBtn, #ffBtn, #volBtn, #playBtn');
  if (!b) return;
  b.classList.remove('anim'); void b.offsetWidth; b.classList.add('anim');
  setTimeout(() => b.classList.remove('anim'), 450);
}, true);
video.addEventListener('volumechange', syncVolIcon);

/* ---- subtitle: save to file / remove / generate again ---- */
function vttToSrtClient(v) {
  let n = 0;
  return String(v).replace(/\r/g, '').split(/\n\n+/).map((b) => {
    const L = b.split('\n'); const i = L.findIndex((x) => x.includes('-->'));
    if (i < 0) return '';
    const t = L[i].replace(/\./g, ',').replace(/<[^>]+>/g, '');
    const txt = L.slice(i + 1).join('\n').replace(/^<(?:ass|pos|position):[^>]*>/gm, '').trim();
    return txt ? `${++n}\n${t}\n${txt}\n` : '';
  }).filter(Boolean).join('\n');
}
const subDownload = async () => {
  const row = subTrackList.querySelector('.opt-row.selected');
  if (!row || !mainTrack.src || row.textContent.trim() === 'Off') { showToast('Pick a subtitle first', 2200); return; }
  try {
    const base = (cleanMediaTitle(activeVideoPath.split('/').pop() || 'subtitles') || 'subtitles').replace(/[\\/:*?"<>|]+/g, ' ');
    const txt = await (await fetch(mainTrack.src)).text();
    const blob = new Blob([vttToSrtClient(txt)], { type: 'application/x-subrip' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = `${base}.srt`;
    document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
    showToast('Subtitle saved (.srt)', 2200);
  } catch (e) { showToast('Could not save the subtitle', 2500); }
};
const subRemove = async () => {
  const row = subTrackList.querySelector('.opt-row.selected');
  if (!row || row.textContent.trim() === 'Off') { showToast('Nothing to remove - subtitles are off', 2200); return; }
  if (!row.dataset.aiKey && !row.dataset.extPath) { showToast('Built-in tracks cannot be removed - choose Off instead', 3000); return; }
  if (!(await astraConfirm('The selected subtitle will be removed.', { title: 'Remove subtitle?', ok: 'Remove', danger: true }))) return;
  if (row.dataset.aiKey) {
    try { const r = await fetch('/api/ai/subs/remove', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ key: row.dataset.aiKey }) }); const j = await r.json(); if (!r.ok) { showToast(j.error || 'Could not remove', 3000); return; } } catch (e) { showToast('Server not reachable', 2500); return; }
    aiShow(null);
  }
  row.remove();
  const off = subTrackList.querySelector('.opt-row');
  if (off) off.click();
  showToast('Subtitle removed', 2000);
  if (activeVideoPath) aiCheck(activeVideoPath, false);
};
// "Generate" turns into "Generate again" once this mode + language already has a result
(function () {
  const lbl = aiUi.gen.querySelector('span');
  const sync = (info) => { lbl.textContent = info && info.state === 'done' ? 'Generate again' : 'Generate'; };
  const _show = aiShow; aiShow = function (info) { _show(info); sync(info); };
  aiUi.gen.onclick = async () => {
    if (!activeVideoPath) return;
    const again = lbl.textContent === 'Generate again';
    if (again && !(await astraConfirm('A fresh subtitle will replace the existing one. To keep it and add another, change the mode or language first.', { title: 'Replace subtitle?', ok: 'Replace' }))) return;
    const res = await fetch('/api/ai/subs', { method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ file: activeVideoPath, audioTrack: activeAudioStreamIndex, lang: aiUi.lang.value, translate: aiUi.tr.checked, songs: aiUi.songs.checked, online: aiUi.online.checked, mode: aiMode, priority: true, from: Math.floor(absoluteTime() || 0), force: again }) });
    const info = await res.json();
    if (info.error) { showToast(info.error, 5000); return; }
    if (again) { const old = subTrackList.querySelector(`[data-ai-key="${info.key}"]`); if (old) old.remove(); }
    aiShow(info);
    if (info.state === 'done') { aiCheck(activeVideoPath, true); return; }
    aiStartPolling(activeVideoPath);
  };
})();
// the file picker must be visible inside fullscreen too (only the player is fullscreen): park it in the player while open
(function () {
  const m = $('subPickerModal'), home = m.parentNode;
  const place = () => { const host = document.fullscreenElement || ($('playerWrapper').classList.contains('fake-fs') ? $('playerWrapper') : null); (host || home).appendChild(m); };
  new MutationObserver(() => { if (m.classList.contains('open')) place(); else if (m.parentNode !== home) home.appendChild(m); }).observe(m, { attributes: true, attributeFilter: ['class'] });
})();

/* ===== v1.20 settings widgets (Compact Dropdown + Inline Custom Combo Box) ===== */
(function () {
  const fmtT = (sec) => (sec < 1 ? "0 s" : sec < 90 ? `${Math.round(sec)} seconds` : `${Math.floor(sec / 60)} min ${Math.round(sec % 60)} s`);
  const fmtMB = (mb) => (mb >= 1024 && mb % 1024 === 0 ? `${mb / 1024} GB` : `${mb} MB`);
  const PRESETS = [0, 1, 5, 10];
  const picks = [...document.querySelectorAll(".mem-pick")];
  const tcOf = (key) => key === "preBufMB10";
  const SAVE_ICON = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2z"/><polyline points="17 21 17 13 7 13 7 21"/><polyline points="7 3 7 8 15 8"/></svg>';
  const CHEV_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';

  function noteText(key, mb) {
    const sec = bufSeconds(mb, tcOf(key)), real = tcOf(key) && mb > 0 ? Math.max(5, sec) : sec;
    return mb > 0
      ? `≈ ${fmtT(real)} of ${activeVideoPath ? "this video" : "a typical 720p video"} is loaded before it starts${sec >= 600 ? " (max 10 min)" : ""}`
      : (tcOf(key) ? "Starts after a 5 second head start" : "Starts right away");
  }

  function render(el) {
    const key = el.dataset.mem, mb = Number(prefs[key]) || 0, isCompact = el.classList.contains("compact");
    const isPreset = PRESETS.includes(mb);
    const editing = el.dataset.edit === "1" || (isCompact && !isPreset);
    el.innerHTML = "";

    const sel = document.createElement("select");
    sel.className = "pref-select";
    sel.setAttribute("aria-label", "Pre-buffer memory");
    PRESETS.forEach((p) => sel.add(new Option(p ? `${p} MB` : "Off", String(p))));
    if (!isPreset && !isCompact) sel.add(new Option(`${fmtMB(mb)} (custom)`, "cur"));
    sel.add(new Option("Custom…", "custom"));
    sel.value = editing ? "custom" : (isPreset ? String(mb) : "cur");

    const extNote = document.getElementById(`note-${key}`);
    const updateNote = (valMb) => {
      const txt = noteText(key, valMb);
      if (extNote) extNote.textContent = txt;
      const inNote = el.querySelector(".mem-note");
      if (inNote) inNote.textContent = txt;
    };

    sel.onchange = () => {
      if (sel.value === "custom") { el.dataset.edit = "1"; render(el); return; }
      if (sel.value === "cur") return;
      prefs[key] = Number(sel.value);
      el.dataset.edit = "0";
      savePrefs();
      renderAll();
    };

    if (editing) {
      const comboWrap = document.createElement("div");
      comboWrap.className = "prebuf-custom-combo";

      const box = document.createElement("div");
      box.className = "prebuf-combo-box";

      const inp = document.createElement("input");
      inp.type = "number";
      inp.min = "0";
      inp.max = "4096";
      inp.step = "1";
      inp.value = String(mb || 50);
      inp.setAttribute("aria-label", "Custom MB");
      inp.oninput = () => updateNote(Math.max(0, parseFloat(inp.value) || 0));

      const unit = document.createElement("span");
      unit.className = "prebuf-unit";
      unit.textContent = "MB";

      const arrowBtn = document.createElement("button");
      arrowBtn.type = "button";
      arrowBtn.className = "prebuf-arrow-btn";
      arrowBtn.title = "Select preset";
      arrowBtn.innerHTML = CHEV_ICON;

      el.appendChild(sel);
      box.append(inp, unit, arrowBtn);

      const saveBtn = document.createElement("button");
      saveBtn.type = "button";
      saveBtn.className = "prebuf-save-btn";
      saveBtn.title = "Save custom buffer";
      saveBtn.innerHTML = SAVE_ICON;
      saveBtn.onclick = () => {
        const n = Math.max(0, Math.round((parseFloat(inp.value) || 0) * 100) / 100);
        prefs[key] = n;
        el.dataset.edit = PRESETS.includes(n) ? "0" : "1";
        savePrefs();
        renderAll();
        showToast(`Pre-buffer saved: ${fmtMB(n)}`, 1400);
      };
      inp.addEventListener("keydown", (e) => { if (e.key === "Enter") { e.preventDefault(); saveBtn.click(); } });

      comboWrap.append(box, saveBtn);
      el.appendChild(comboWrap);

      requestAnimationFrame(() => {
        const csBtn = el.querySelector(".cs-btn");
        if (csBtn) {
          el.querySelector(".cs").classList.add("prebuf-hidden-cs");
          arrowBtn.onclick = (e) => { e.stopPropagation(); csBtn.click(); };
        }
      });
    } else {
      el.appendChild(sel);
    }

    if (!isCompact) {
      const note = document.createElement("div");
      note.className = "mem-note";
      el.appendChild(note);
    }
    updateNote(mb);
  }

  function renderAll() { picks.forEach((p) => render(p)); }
  picks.forEach((p) => p.addEventListener('astra-refresh', () => render(p)));
  window.renderMemPickers = renderAll;
  renderAll();
})();
// auto-play toggles inside the player settings
document.querySelectorAll('[data-pref]').forEach((el) => {
  el.checked = prefs[el.dataset.pref] !== false && !!prefs[el.dataset.pref];
  el.addEventListener('change', () => { prefs[el.dataset.pref] = el.checked; savePrefs(); const o = document.getElementById('pref' + el.dataset.pref[0].toUpperCase() + el.dataset.pref.slice(1)); if (o) o.checked = el.checked; document.querySelectorAll('[data-pref="' + el.dataset.pref + '"]').forEach((x) => { x.checked = el.checked; }); });
});
['prefAutoPlay', 'prefAutoNext'].forEach((id) => { const el = $(id); if (el) el.addEventListener('change', () => { document.querySelectorAll('[data-pref="' + id.slice(4, 5).toLowerCase() + id.slice(5) + '"]').forEach((m) => { m.checked = el.checked; }); }); });
// every Save button: store everything now (and sync to the other devices)
document.addEventListener('click', (e) => {
  const b = e.target.closest && e.target.closest('.save-btn');
  if (!b) return;
  try { saveCurrentSettings(); savePrefs(); if (typeof window.syncFlush === 'function') window.syncFlush(); } catch (x) {}
  const sp = b.querySelector('span'), old = sp ? sp.textContent : '';
  b.classList.add('saved'); if (sp) sp.textContent = 'Saved';
  setTimeout(() => { b.classList.remove('saved'); if (sp) sp.textContent = old; }, 1400);
});

// Sliders: a tap on the bar no longer jumps the value (it used to change by accident while scrolling the panel).
// Grab the round handle and drag, or use the - / + buttons. Vertical swipes scroll the panel.
(function () {
  const near = (r, e) => {
    const min = +r.min || 0, max = +r.max || 100, ratio = max > min ? (r.value - min) / (max - min) : 0;
    const box = r.getBoundingClientRect(), thumb = 24;
    return Math.abs(e.clientX - (box.left + thumb / 2 + ratio * (box.width - thumb))) <= 30;
  };
  document.addEventListener('pointerdown', (e) => {
    const r = e.target;
    if (!r || r.tagName !== 'INPUT' || r.type !== 'range' || r.id === 'timelineSlider' || !r.closest('.settings-modal, .settings-card, .prefs-card')) return;
    if (!near(r, e)) { e.preventDefault(); r.blur(); if (!window._sliderHint || Date.now() - window._sliderHint > 4000) { window._sliderHint = Date.now(); showToast('Drag the handle or use − / +', 1800); } }
  }, true);
})();

// Name tips: touch tips require a genuine stationary 650 ms hold.
// Android browsers synthesize mouseover after taps; ignore those completely.
(function () {
  const bubble = document.createElement('div');
  bubble.className = 'tip-bubble';
  document.body.appendChild(bubble);
  let timer = null, hideT = null, shown = null, startX = 0, startY = 0, activePointer = null;
  const clearHold = () => {
    clearTimeout(timer);
    timer = null;
    document.querySelectorAll('.tip-hold').forEach((x) => x.classList.remove('tip-hold'));
    activePointer = null;
  };
  const hide = () => {
    clearTimeout(hideT);
    bubble.classList.remove('on');
    shown = null;
  };
  const place = (b) => {
    bubble.textContent = b.dataset.tip;
    bubble.style.maxWidth = '220px';
    bubble.classList.add('on');
    const r = b.getBoundingClientRect(), bw = bubble.offsetWidth, bh = bubble.offsetHeight;
    let top = r.top - bh - 10;
    if (top < 6) top = r.bottom + 10;
    if (top + bh > innerHeight - 6) top = r.top - bh - 10;
    const left = Math.max(8, Math.min(innerWidth - bw - 8, r.left + r.width / 2 - bw / 2));
    bubble.style.left = left + 'px';
    bubble.style.top = Math.max(6, top) + 'px';
  };
  const show = (b) => {
    shown = b;
    place(b);
    clearTimeout(hideT);
    hideT = setTimeout(hide, 2200);
  };
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('[data-tip]');
    hide();
    clearHold();
    if (!b || e.pointerType === 'mouse') return;
    activePointer = e.pointerId;
    startX = e.clientX; startY = e.clientY;
    b.classList.add('tip-hold');
    b.style.setProperty('--tip-hold', '650ms');
    timer = setTimeout(() => {
      if (activePointer !== e.pointerId) return;
      b.classList.remove('tip-hold');
      show(b);
      window._tipJust = b;
    }, 650);
  }, true);
  document.addEventListener('pointermove', (e) => {
    if (activePointer !== null && e.pointerId === activePointer &&
        (Math.abs(e.clientX - startX) > 9 || Math.abs(e.clientY - startY) > 9)) clearHold();
  }, true);
  ['pointerup', 'pointercancel', 'scroll', 'touchmove'].forEach((ev) => {
    document.addEventListener(ev, clearHold, { capture: true, passive: true });
  });
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('[data-tip]');
    if (b && b === window._tipJust) {
      e.preventDefault();
      e.stopPropagation();
    }
    window._tipJust = null;
  }, true);
  document.addEventListener('contextmenu', (e) => {
    if (e.target.closest && e.target.closest('[data-tip]')) e.preventDefault();
  });
  // Physical mouse hover only. Never infer hover from pointerover/mouseover on touch devices.
  if (window.matchMedia && window.matchMedia('(hover: hover) and (pointer: fine)').matches) {
    document.addEventListener('pointerover', (e) => {
      if (e.pointerType !== 'mouse') return;
      const b = e.target.closest && e.target.closest('[data-tip]');
      if (!b) { hide(); return; }
      if (b !== shown) {
        clearTimeout(timer);
        timer = setTimeout(() => show(b), 450);
      }
    });
    document.addEventListener('pointerout', (e) => {
      if (e.pointerType === 'mouse') hide();
    });
  }
})();

/* ===== Low-memory mode (v1.21) =====
   Auto = on for phones that report <= 2 GB RAM or <= 4 cores. While it is on:
   - the home / library / history pages are emptied (thumbnails + DOM freed) when the player opens, and rebuilt when you come back
   - a video that sits paused outside the player for 90 s is unloaded (its buffer is released) and reopened at the same spot when you return
   - effects (blur, shadows, transitions) are off and the subtitle clock ticks half as often */
var videoUnloaded = false, unloadPos = 0, idleSince = 0;
function isLite() {
  const m = prefs.lite;
  if (m === 'on') return true;
  if (m === 'off') return false;
  return (navigator.deviceMemory && navigator.deviceMemory <= 2) || (navigator.hardwareConcurrency && navigator.hardwareConcurrency <= 4);
}
function applyLite() { document.documentElement.classList.toggle('lite', isLite()); }
function liteEnterPlayer() {
  if (!isLite()) return;
  try { thumbQueue.length = 0; } catch (e) {}
  [seriesCardsGrid, $('historyGrid'), $('explorerContent')].forEach((el) => { if (el) el.replaceChildren(); });
  if (videoUnloaded && lastOpen.rel) { videoUnloaded = false; inspectMediaAndPlay(lastOpen.title, lastOpen.rel, unloadPos); }
}
function liteLeavePlayer() { idleSince = Date.now(); }
setInterval(() => {
  if (!isLite() || currentView === 'player' || videoUnloaded || !activeVideoPath || !video.getAttribute('src')) return;
  if (!video.paused) { idleSince = Date.now(); return; }
  if (Date.now() - idleSince < 90000) return;
  try {
    unloadPos = absoluteTime() || 0; videoUnloaded = true;
    video.removeAttribute('src'); video.load();
  } catch (e) { videoUnloaded = false; }
}, 10000);
applyLite();
const _lite = $('prefLite'); if (_lite) _lite.addEventListener('change', applyLite);


/* ------------------------------------------------------------------ */
/* v1.21 subtitle row actions (save / remove sit next to the name)     */
(function subRowActions() {
  const ICON_SAVE = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>';
  const ICON_DEL = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6l-1 14a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2L5 6"/><path d="M10 11v6M14 11v6"/></svg>';
  const mkBtn = (cls, label, icon, fn) => {
    const b = document.createElement('button'); b.type = 'button'; b.className = 'row-act-btn ' + cls; b.setAttribute('aria-label', label); b.title = label; b.innerHTML = icon;
    b.addEventListener('click', (e) => { e.stopPropagation(); fn(); });
    return b;
  };
  function decorate() {
    subTrackList.querySelectorAll('.opt-row').forEach((row, i) => {
      if (i === 0 || row.querySelector('.row-act')) return; // first row is "Off"
      const name = document.createElement('span'); name.className = 'sub-name';
      while (row.firstChild) name.appendChild(row.firstChild);
      const act = document.createElement('span'); act.className = 'row-act';
      act.appendChild(mkBtn('ra-save', 'Save subtitle as .srt', ICON_SAVE, subDownload));
      act.appendChild(mkBtn('ra-del', 'Remove subtitle', ICON_DEL, subRemove));
      row.appendChild(name); row.appendChild(act);
    });
  }
  new MutationObserver(decorate).observe(subTrackList, { childList: true, subtree: true });
  decorate();
})();

/* ------------------------------------------------------------------ */
/* v1.21 safer sliders: a scroll or a stray tap never changes a setting */
(function safeSliders() {
  document.querySelectorAll('.settings-modal input.custom-range').forEach((rng) => {
    let startVal = null, sx = 0, sy = 0, locked = false, guard = false, engaged = false;
    const restore = () => { guard = true; rng.value = startVal; rng.dispatchEvent(new Event('input', { bubbles: true })); rng.dispatchEvent(new Event('change', { bubbles: true })); guard = false; };
    rng.addEventListener('pointerdown', (e) => {
      if (e.pointerType === 'mouse') { startVal = null; return; }
      startVal = rng.value; sx = e.clientX; sy = e.clientY; locked = false; engaged = false;
      // Only a grab on the thumb moves the value; touching the bare track is ignored
      const r = rng.getBoundingClientRect(), mn = +rng.min, mx = +rng.max;
      const thumbX = r.left + ((+rng.value - mn) / (mx - mn || 1)) * r.width;
      if (Math.abs(e.clientX - thumbX) > 28) locked = true;
    });
    rng.addEventListener('pointermove', (e) => {
      if (startVal === null || engaged) return;
      const dx = Math.abs(e.clientX - sx), dy = Math.abs(e.clientY - sy);
      if (dy > 8 && dy > dx) { locked = true; if (rng.value !== startVal) restore(); }
      else if (dx > 6) engaged = true;
    });
    rng.addEventListener('input', (e) => { if (!guard && locked && startVal !== null) { e.stopImmediatePropagation(); restore(); } }, true);
    ['pointerup', 'pointercancel'].forEach((ev) => rng.addEventListener(ev, () => { setTimeout(() => { startVal = null; locked = false; }, 0); }));
    rng.addEventListener('wheel', (e) => e.preventDefault(), { passive: false });
  });
})();


/* ------------------------------------------------------------------ */
/* v1.22 custom UI: dropdowns, color picker, confirm dialog            */
(function customUI() {
  const CHEV = '<svg class="cs-chev" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"/></svg>';
  const CHECK = '<svg class="cs-check" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>';
  let cur = null;
  function closePop() { if (!cur) return; cur.menu.remove(); cur.btn.classList.remove('open'); cur.btn.setAttribute('aria-expanded', 'false'); cur = null; }
  // Rectangle of el in the coordinate space of its container (the player is rotated in fake fullscreen)
  function rectIn(el, box) {
    const r = el.getBoundingClientRect();
    if (box === document.body) return { left: r.left, top: r.top, right: r.right, bottom: r.bottom, width: r.width, height: r.height };
    if (box.classList.contains('fake-fs')) {
      const inv = new DOMMatrix(getComputedStyle(box).transform).inverse();
      const p = [[r.left, r.top], [r.right, r.top], [r.left, r.bottom], [r.right, r.bottom]].map(([x, y]) => inv.transformPoint(new DOMPoint(x, y)));
      const xs = p.map((q) => q.x), ys = p.map((q) => q.y), l = Math.min(...xs), t = Math.min(...ys);
      return { left: l, top: t, right: Math.max(...xs), bottom: Math.max(...ys), width: Math.max(...xs) - l, height: Math.max(...ys) - t };
    }
    const c = box.getBoundingClientRect(), ox = c.left + box.clientLeft, oy = c.top + box.clientTop;
    return { left: r.left - ox, top: r.top - oy, right: r.right - ox, bottom: r.bottom - oy, width: r.width, height: r.height };
  }
  function openPop(btn, anchor, build, cls) {
    if (cur && cur.btn === btn) { closePop(); return; }
    closePop();
    const box = btn.closest('.player-wrapper') || document.body;
    const menu = document.createElement('div'); menu.className = 'cs-menu ' + (cls || ''); menu.setAttribute('role', 'listbox');
    menu.style.position = box === document.body ? 'fixed' : 'absolute'; menu.style.visibility = 'hidden';
    build(menu, closePop); box.appendChild(menu);
    const tr = rectIn(anchor, box);
    const cw = box === document.body ? innerWidth : box.clientWidth, ch = box === document.body ? innerHeight : box.clientHeight;
    menu.style.minWidth = Math.max(tr.width, cls === 'cc-menu' ? 0 : 150) + 'px';
    const mw = menu.offsetWidth, mh = menu.scrollHeight, below = ch - tr.bottom - 10, above = tr.top - 10;
    const down = mh <= below || below >= above, avail = Math.max(120, down ? below : above);
    menu.style.maxHeight = avail + 'px';
    const h = Math.min(mh, avail);
    menu.style.left = Math.max(8, Math.min(tr.left, cw - mw - 8)) + 'px';
    menu.style.top = (down ? tr.bottom + 6 : tr.top - h - 6) + 'px';
    menu.dataset.dir = down ? 'down' : 'up'; menu.style.visibility = '';
    btn.classList.add('open'); btn.setAttribute('aria-expanded', 'true'); cur = { menu, btn };
    const on = menu.querySelector('.on'); if (on) on.scrollIntoView({ block: 'nearest' });
  }
  document.addEventListener('pointerdown', (e) => { if (cur && !cur.menu.contains(e.target) && !cur.btn.contains(e.target)) closePop(); }, true);
  document.addEventListener('scroll', (e) => { if (cur && !cur.menu.contains(e.target)) closePop(); }, true);
  window.addEventListener('resize', closePop);
  document.addEventListener('keydown', (e) => {
    if (!cur) return;
    if (e.key === 'Escape') { e.stopPropagation(); const b = cur.btn; closePop(); b.focus(); }
    else if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      const items = [...cur.menu.querySelectorAll('.cs-opt:not(:disabled)')]; if (!items.length) return;
      e.preventDefault(); const i = items.indexOf(document.activeElement);
      items[(i + (e.key === 'ArrowDown' ? 1 : -1) + items.length) % items.length].focus();
    }
  }, true);

  const valDesc = (proto) => Object.getOwnPropertyDescriptor(proto, 'value');
  function enhanceSelect(sel) {
    if (sel._cs) return; sel._cs = true;
    const w = document.createElement('div'); w.className = 'cs'; w.style.cssText = sel.style.cssText; sel.style.cssText = '';
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cs-btn';
    b.setAttribute('aria-haspopup', 'listbox'); b.setAttribute('aria-expanded', 'false'); b.setAttribute('aria-label', sel.getAttribute('aria-label') || 'Choose an option');
    b.innerHTML = '<span class="cs-val"></span>' + CHEV;
    sel.parentNode.insertBefore(w, sel); w.appendChild(b); w.appendChild(sel);
    sel.classList.add('cs-native'); sel.tabIndex = -1; sel.setAttribute('aria-hidden', 'true');
    const sync = () => { const o = sel.options[sel.selectedIndex]; b.querySelector('.cs-val').textContent = o ? o.textContent.trim() : ''; };
    const d = valDesc(HTMLSelectElement.prototype);
    Object.defineProperty(sel, 'value', { get() { return d.get.call(sel); }, set(v) { d.set.call(sel, v); sync(); }, configurable: true });
    sel.addEventListener('change', sync); sync();
    b.onclick = () => openPop(b, b, (menu) => {
      [...sel.options].forEach((o, i) => {
        if (o.hidden) return;
        const it = document.createElement('button'); it.type = 'button'; it.className = 'cs-opt' + (i === sel.selectedIndex ? ' on' : '');
        it.setAttribute('role', 'option'); it.disabled = o.disabled; it.innerHTML = '<span></span>' + CHECK; it.firstChild.textContent = o.textContent.trim();
        it.onclick = () => { sel.value = o.value; sel.dispatchEvent(new Event('input', { bubbles: true })); sel.dispatchEvent(new Event('change', { bubbles: true })); closePop(); b.focus(); };
        menu.appendChild(it);
      });
    });
  }
  const SWATCHES = ['#ffffff', '#fde047', '#fbbf24', '#fb923c', '#ef4444', '#f472b6', '#a78bfa', '#60a5fa', '#22d3ee', '#4ade80', '#9ca3af', '#000000'];
  function enhanceColor(inp) {
    if (inp._cs) return; inp._cs = true;
    const b = document.createElement('button'); b.type = 'button'; b.className = 'cc-btn'; b.setAttribute('aria-haspopup', 'dialog'); b.setAttribute('aria-label', 'Pick a color'); b.innerHTML = '<i></i>';
    inp.parentNode.insertBefore(b, inp); inp.classList.add('cs-native'); inp.tabIndex = -1;
    const sync = () => { b.firstChild.style.background = inp.value; };
    const d = valDesc(HTMLInputElement.prototype);
    Object.defineProperty(inp, 'value', { get() { return d.get.call(inp); }, set(v) { d.set.call(inp, v); sync(); }, configurable: true });
    sync();
    const set = (v) => { inp.value = v; inp.dispatchEvent(new Event('input', { bubbles: true })); inp.dispatchEvent(new Event('change', { bubbles: true })); };
    b.onclick = () => openPop(b, b, (menu) => {
      const g = document.createElement('div'); g.className = 'cc-grid';
      SWATCHES.forEach((c) => {
        const s = document.createElement('button'); s.type = 'button'; s.className = 'cc-sw cs-opt' + (c === inp.value.toLowerCase() ? ' on' : ''); s.style.background = c; s.setAttribute('aria-label', c);
        s.onclick = () => { set(c); closePop(); }; g.appendChild(s);
      });
      const hex = document.createElement('input'); hex.className = 'cc-hex'; hex.maxLength = 7; hex.value = inp.value; hex.setAttribute('aria-label', 'Hex color');
      hex.oninput = () => { if (/^#[0-9a-f]{6}$/i.test(hex.value)) set(hex.value.toLowerCase()); };
      menu.appendChild(g); menu.appendChild(hex);
    }, 'cc-menu');
  }
  const scan = (root) => {
    root.querySelectorAll('select').forEach(enhanceSelect);
    root.querySelectorAll('input[type="color"]').forEach(enhanceColor);
  };
  scan(document);
  new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => { if (n.nodeType === 1) { if (n.matches('select')) enhanceSelect(n); else if (n.matches('input[type="color"]')) enhanceColor(n); else scan(n); } }))).observe(document.body, { childList: true, subtree: true });

  // Confirm dialog (replaces the browser's confirm box)
  window.astraConfirm = (message, o = {}) => new Promise((resolve) => {
    const host = document.fullscreenElement || document.body;
    const scrim = document.createElement('div'); scrim.className = 'dlg-scrim';
    scrim.innerHTML = '<div class="dlg" role="alertdialog" aria-modal="true"><h4></h4><p></p><div class="dlg-act"><button type="button" class="pill-btn dlg-cancel">Cancel</button><button type="button" class="pill-btn dlg-ok"></button></div></div>';
    scrim.querySelector('h4').textContent = o.title || 'Are you sure?';
    scrim.querySelector('p').textContent = message || '';
    const ok = scrim.querySelector('.dlg-ok'); ok.textContent = o.ok || 'Confirm'; ok.classList.add(o.danger ? 'danger' : 'highlight');
    const done = (v) => { document.removeEventListener('keydown', key, true); scrim.classList.remove('on'); setTimeout(() => scrim.remove(), 160); resolve(v); };
    const key = (e) => { if (e.key === 'Escape') { e.stopPropagation(); done(false); } };
    document.addEventListener('keydown', key, true);
    ok.onclick = () => done(true); scrim.querySelector('.dlg-cancel').onclick = () => done(false);
    scrim.addEventListener('pointerdown', (e) => { if (e.target === scrim) done(false); });
    host.appendChild(scrim); requestAnimationFrame(() => scrim.classList.add('on')); scrim.querySelector('.dlg-cancel').focus();
  });
})();


/* ===== v1.21.1: online AI, cover art, next/previous bar, animation switch ===== */
(function v1211() {
  /* --- online AI settings --- */
  const PRESETS = { groq: ['https://api.groq.com/openai/v1', 'whisper-large-v3-turbo'], openai: ['https://api.openai.com/v1', 'whisper-1'] };
  const st = $('onlineAiState'), key = $('oaKey'), base = $('oaBase'), model = $('oaModel'), preset = $('oaPreset');
  let hint = '';
  function paintBase() { $('oaBaseRow').style.display = preset.value === 'custom' ? '' : 'none'; }
  function applyState(c) {
    hint = c.hint || '';
    key.value = ''; key.placeholder = c.configured ? hint + '  (saved, type to replace)' : 'Paste key';
    base.value = c.base; model.value = c.model;
    preset.value = c.base === PRESETS.groq[0] ? 'groq' : c.base === PRESETS.openai[0] ? 'openai' : 'custom'; paintBase();
    st.textContent = c.configured ? 'Ready \u00b7 ' + c.model : 'Not set up. Local whisper.cpp is used instead';
    $('oaRemove').style.display = c.configured ? '' : 'none';
    const on = aiUi.online, row = $('aiOnlineRow');
    on.disabled = !c.configured; $('aiOnlineHint').textContent = c.configured ? '(uses your API)' : '(add key in Settings)';
    if (!c.configured) on.checked = false;
    else if (!aiLocal && !on.checked) on.checked = true;      // nothing local to fall back on
    aiUi.gen.disabled = aiUi.all.disabled = !(aiLocal || c.configured);
    row.classList.toggle('dim', !c.configured);
  }
  function load() { return fetch('/api/ai/online').then((r) => r.json()).then(applyState).catch(() => {}); }
  preset.addEventListener('change', () => { if (PRESETS[preset.value]) { base.value = PRESETS[preset.value][0]; model.value = PRESETS[preset.value][1]; } paintBase(); });
  $('oaShow').onclick = () => { key.type = key.type === 'password' ? 'text' : 'password'; };
  $('oaSave').onclick = async () => {
    const body = { base: base.value.trim(), model: model.value.trim() }; if (key.value.trim()) body.key = key.value.trim();
    try {
      const r = await fetch('/api/ai/online', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const j2 = await r.json(); if (!r.ok) { showToast(j2.error || 'Could not save', 3000); return; }
      key.type = 'password'; applyState(j2); showToast('Online AI saved', 1800);
      if (j2.configured && !aiUi.online.checked) { aiUi.online.checked = true; aiUi.online.dispatchEvent(new Event('change')); }
    } catch (e) { showToast('Could not save', 2500); }
  };
  $('oaRemove').onclick = async () => {
    if (!(await astraConfirm('The saved key is deleted from this device. Local AI still works.', { title: 'Remove API key?', ok: 'Remove', danger: true }))) return;
    try { const r = await fetch('/api/ai/online', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ clear: true }) }); applyState(await r.json()); showToast('Key removed', 1800); } catch (e) {}
  };
  setTimeout(load, 400);

  /* --- animation switch (Settings > Preferences; same rules as Low-memory mode) --- */
  function paintAnim() { document.documentElement.classList.toggle('no-anim', prefs.anim === false); }
  const pa = $('prefAnim');
  if (pa) { pa.checked = prefs.anim !== false; pa.onchange = () => { prefs.anim = pa.checked; savePrefs(); paintAnim(); showToast(pa.checked ? 'Animations on' : 'Animations off', 1800, pa.checked ? 'ok' : 'warn'); }; }
  paintAnim();

  /* --- next / previous --- */
  const pName = $('prevEpName'), nName = $('nextEpName'), pB = $('btnPrevEp'), nB = $('btnNextEp');
  function label(it) { if (!it) return '-'; const p = epCardParts(it); return (p.tag ? p.tag + ' \u00b7 ' : '') + p.title; }
  window.updateNavBar = function () {
    const i = currentVideoList.findIndex(isActiveItem), prev = i > 0 ? currentVideoList[i - 1] : null, next = i >= 0 ? currentVideoList[i + 1] : null;
    pB.disabled = !prev; nB.disabled = !next; pName.textContent = prev ? label(prev) : 'First episode'; nName.textContent = next ? label(next) : 'Last episode';
  };
  pB.onclick = () => playAdjacentEpisode(-1); nB.onclick = () => playAdjacentEpisode(1);
  video.addEventListener('loadedmetadata', updateNavBar);
  const oldRender = renderInlinePlaylist; renderInlinePlaylist = function () { const r = oldRender.apply(this, arguments); updateNavBar(); return r; };
  updateNavBar();

})();

/* ===== v1.24 Nav, Chapter Pill & Paused Info Overlay ===== */
(function initV124Hooks() {
  const ytCenterPauseBadge = $("ytCenterPauseBadge");
  if (ytCenterPauseBadge) ytCenterPauseBadge.onclick = (e) => { e.stopPropagation(); if (!isScreenLocked) togglePlayPause(); };
  const chLbl = $("chapterLabel");
  if (chLbl) chLbl.onclick = (e) => { e.stopPropagation(); toggleChaptersPanel(); };

  function syncPausedOverlay() {
    const paused = video.paused && !!activeVideoPath && !video.ended && !internalPause;
    const chPanel = $("chaptersPanel");
    const panelOpen = settingsModal.classList.contains("open") || playerEpisodesDrawer.classList.contains("open") || (chPanel && chPanel.classList.contains("open"));
    playerWrapper.classList.toggle("is-paused-ui", paused && !panelOpen && !isScreenLocked);

    const fileName = (activeVideoPath || "").split("/").pop() || "";
    const { title, tag } = formatCardHeader(fileName);
    const seriesName = (currentPathTokens[0] || title || "ASTRA PLAYER").toUpperCase();

    if ($("pausedSeriesBadge")) $("pausedSeriesBadge").textContent = seriesName;
    if ($("pausedAnimeTitle")) $("pausedAnimeTitle").textContent = tag ? (title + " · " + tag) : title;

    const epName = findCustomEpInfo(fileName);
    if ($("pausedEpDesc")) $("pausedEpDesc").textContent = epName || "";

    if ($("pausedWatchedPill")) {
      $("pausedWatchedPill").textContent = "Watched: " + formatTime(absoluteTime()) + " / " + formatTime(getDuration());
    }

    const h = video.videoHeight;
    const qStr = h > 0 ? (h + "p") : ($("qualityValue") ? $("qualityValue").textContent : "Auto");
    const fpsStr = (typeof currentVideoFps !== "undefined" && currentVideoFps > 0) ? ("@" + currentVideoFps + "fps") : "";
    const bitStr = sourceIs10Bit ? "10 Bit" : "8 Bit";
    if ($("pausedTechPill")) {
      $("pausedTechPill").textContent = qStr + fpsStr + " • " + bitStr;
    }
  }
  ["play", "playing", "pause", "loadedmetadata", "emptied"].forEach((ev) => video.addEventListener(ev, syncPausedOverlay));
  new MutationObserver(syncPausedOverlay).observe(settingsModal, { attributes: true, attributeFilter: ["class"] });
  new MutationObserver(syncPausedOverlay).observe(playerEpisodesDrawer, { attributes: true, attributeFilter: ["class"] });
  if ($("chaptersPanel")) new MutationObserver(syncPausedOverlay).observe($("chaptersPanel"), { attributes: true, attributeFilter: ["class"] });
})();

/* ===== v1.21.7: Files page, quality 4K, guest mode, button tips ===== */
(function v1217() {
  /* --- guest (friend through a tunnel): hide owner-only controls --- */
  fetch('/api/whoami').then((r) => r.json()).then((d) => { if (d.guest) { document.documentElement.classList.add('guest'); const t = $('tasksSummary'); } }).catch(() => {});

  /* --- Files: folder suggestions while typing, count follows the screen height --- */
  const inp = $('storagePathInputField'), box = $('pathSuggest');
  let sTimer = null, sSeq = 0;
  const maxRows = () => Math.max(3, Math.min(10, Math.floor((window.innerHeight * 0.42) / 46)));
  function hideSuggest() { box.classList.remove('open'); box.innerHTML = ''; }
  async function suggest() {
    const v = inp.value;
    const i = v.lastIndexOf('/');
    const dir = i <= 0 ? '/' : v.slice(0, i), prefix = v.slice(i + 1);
    const seq = ++sSeq;
    try {
      const r = await fetch(`/api/storage/suggest?dir=${encodeURIComponent(dir)}&prefix=${encodeURIComponent(prefix)}&max=${maxRows()}`);
      const d = await r.json();
      if (seq !== sSeq || document.activeElement !== inp) return;
      box.innerHTML = '';
      (d.items || []).forEach((it) => {
        const b = document.createElement('button'); b.type = 'button'; b.className = 'ps-item'; b.setAttribute('role', 'option');
        b.innerHTML = '<svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg><span></span>';
        b.querySelector('span').textContent = it.name;
        b.onpointerdown = (e) => { e.preventDefault(); inp.value = it.fullPath + '/'; hideSuggest(); exploreFolder(it.fullPath); };
        box.appendChild(b);
      });
      box.classList.toggle('open', box.children.length > 0);
    } catch (e) { hideSuggest(); }
  }
  inp.addEventListener('input', () => { clearTimeout(sTimer); sTimer = setTimeout(suggest, 120); });
  inp.addEventListener('focus', () => { clearTimeout(sTimer); sTimer = setTimeout(suggest, 60); });
  inp.addEventListener('blur', () => setTimeout(hideSuggest, 120));
  inp.addEventListener('keydown', (e) => { if (e.key === 'Escape') hideSuggest(); if (e.key === 'Enter') hideSuggest(); });
  if (!inp.value && libraryRoot) inp.value = libraryRoot;

  /* --- quality: 1080p / 4K warning + memory estimate --- */
  const sel = $('prefQuality'), info = $('qualityInfo');
  const Q = {
    fhd: { name: 'Full HD 1080p', mem: 160, rate: '8 Mbps', pre: 40, cpu: 'a fast phone or PC' },
    qhd: { name: '2K 1440p', mem: 300, rate: '12 Mbps', pre: 70, cpu: 'a fast PC (many phones cannot keep up live)' },
    uhd: { name: '4K 2160p', mem: 520, rate: '18 Mbps', pre: 120, cpu: 'a very fast PC (most phones cannot keep up live)' }
  };
  function paintQ() {
    const q = Q[prefs.quality];
    info.style.display = q ? '' : 'none';
    if (!q) return;
    const ram = navigator.deviceMemory ? ` This device reports about ${navigator.deviceMemory} GB RAM.` : '';
    $('qualityInfoTitle').textContent = q.name + ' selected';
    $('qualityInfoText').textContent = `Heavy: about ${q.mem} MB of RAM for decoding plus about ${q.rate} of data. Needs ${q.cpu}.${ram} Applies to 10-bit / HEVC videos that are converted live; 8-bit videos play at their own size.`;
  }
  sel.addEventListener('change', async () => {
    const q = Q[sel.value];
    paintQ();
    if (!q) return;
    const ok = await astraConfirm(`${q.name} needs about ${q.mem} MB of RAM and ${q.rate}. It may stutter on phones. The 10-bit pre-buffer will be raised to ${q.pre} MB so playback has a head start.`, { title: `Use ${q.name}?`, ok: 'Use it', danger: true });
    if (!ok) { prefs.quality = 'auto'; sel.value = 'auto'; savePrefs(); paintQ(); if (isTranscodingMode && activeVideoPath) seekToTargetSecond(absoluteTime(), true, true); return; }
    if ((Number(prefs.preBufMB10) || 0) < q.pre) { prefs.preBufMB10 = q.pre; savePrefs(); document.querySelectorAll('.mem-pick').forEach((p) => p.dispatchEvent(new Event('astra-refresh'))); }
    showToast(`${q.name} on: heavy on memory`, 3200, 'warn');
  });
  paintQ();

  /* --- every button explains itself on hold/hover --- */
  const TIPS = {
    bigPlayBtn: 'Play or pause', closeSubPickerModalBtn: 'Close the subtitle list', openDrawerBtn: 'Open the menu', closeDrawerBtn: 'Close the menu', btnRescanLibrary: 'Scan the library folder again for new videos',
    openClearHistoryModalBtn: 'Delete all watch history', btnTasksClear: 'Remove finished entries from the list', btnTasksStopAll: 'Stop every running job',
    btnPrevEp: 'Play the previous episode', btnNextEp: 'Play the next episode', prevEpBtn: 'Previous episode', nextEpBtn: 'Next episode',
    heroResumeBtn: 'Continue the last video where you stopped', chaptersBtn: 'Show chapters', closeEpisodesDrawerBtn: 'Close the episode list',
    btnSubDownload: 'Save this subtitle as a file', btnSubRemove: 'Remove the selected subtitle', oaSave: 'Save the online AI settings', oaRemove: 'Delete the saved API key', oaShow: 'Show or hide the key'
  };
  function tipFor(b) {
    if (TIPS[b.id]) return TIPS[b.id];
    const t = (b.getAttribute('aria-label') || b.getAttribute('title') || '').trim();
    if (t) return t;
    const sp = (b.textContent || '').replace(/\s+/g, ' ').trim();
    return sp ? sp.charAt(0).toUpperCase() + sp.slice(1) : '';
  }
  function tipAll(root) {
    root.querySelectorAll('button, .icon-btn, .pill-btn, .action-btn, .chip-preset, .mode-card').forEach((b) => {
      if (b.hasAttribute('data-tip') || b.closest('.kp, .cs-menu')) return;
      const t = tipFor(b); if (!t) return;
      b.setAttribute('data-tip', t); if (!b.getAttribute('aria-label') && !(b.textContent || '').trim()) b.setAttribute('aria-label', t);
      b.setAttribute('data-tip-pos', b.closest('.site-header, .upload-zone-bar, .folder-action-bar, .view-header') ? 'b' : 't');
    });
  }
  tipAll(document);
  let tipT = null;
  new MutationObserver(() => { clearTimeout(tipT); tipT = setTimeout(() => tipAll(document), 250); }).observe(document.body, { childList: true, subtree: true });
})();


/* ===== TV Cast & Smart TV Wi-Fi Connect ===== */
(function initTvConnect() {
  const tvBtn = $("tvCastBtn");
  const tvModal = $("tvConnectModal");
  const closeTv = $("closeTvModalBtn");
  const nativeBtn = $("btnNativeCast");
  const scanBtn = $("btnScanTvDevices");
  const devsBox = $("tvDevicesList");
  const urlsBox = $("tvUrlsList");
  if (!tvBtn || !tvModal) return;

  async function scanDevices() {
    if (!devsBox) return;
    devsBox.innerHTML = '<span style="color:var(--muted);">Scanning local Wi-Fi devices...</span>';
    try {
      const data = await (await fetch("/api/network/devices", { cache: "no-store" })).json();
      const connected = data.connected || [];
      const nearby = data.nearby || [];
      devsBox.innerHTML = "";

      connected.forEach((d) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;background:var(--surface-2);padding:7px 10px;border-radius:8px;border:1px solid rgba(46,230,166,0.35);";
        row.innerHTML = `<div><b style="color:#fff;">${escapeHtml(d.label)}</b><div style="font-size:0.7rem;color:var(--muted);">${escapeHtml(d.ip)}${d.isSelf ? " (This Device)" : ""}</div></div>
          <span style="font-size:0.66rem;font-weight:800;color:var(--mint);">CONNECTED</span>`;
        devsBox.appendChild(row);
      });

      nearby.forEach((d) => {
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;background:var(--surface-2);padding:7px 10px;border-radius:8px;border:1px solid var(--line);";
        row.innerHTML = `<div><b style="color:#e2e8f0;">${escapeHtml(d.label)}</b><div style="font-size:0.7rem;color:var(--muted);">${escapeHtml(d.ip)}</div></div>
          <span style="font-size:0.66rem;font-weight:700;color:#60a5fa;">ON WI-FI</span>`;
        devsBox.appendChild(row);
      });

      if (!connected.length && !nearby.length) {
        devsBox.innerHTML = '<span style="color:var(--muted);">Koi external device abhi connected nahi hai.</span>';
      }
    } catch (e) {
      devsBox.textContent = "Device scan failed";
    }
  }

  async function openTvModal() {
    tvModal.classList.add("open");
    scanDevices();
    urlsBox.innerHTML = "Checking Wi-Fi IP...";
    try {
      const data = await (await fetch("/api/network/info")).json();
      const urls = data.urls || [];
      if (!urls.length) {
        urlsBox.innerHTML = '<span style="color:var(--muted);">Wi-Fi ya Hotspot on karein, phir dobara kholein.</span>';
        return;
      }
      urlsBox.innerHTML = "";
      urls.forEach((u) => {
        const epHash = typeof deepLinkFor === "function" && activeVideoPath ? deepLinkFor(activeVideoPath) : "";
        const fullUrl = u.url + epHash;
        const row = document.createElement("div");
        row.style.cssText = "display:flex;align-items:center;justify-content:space-between;gap:8px;background:var(--surface-2);padding:8px 10px;border-radius:8px;border:1px solid var(--line);";
        row.innerHTML = `<code style="font-size:0.78rem;color:#60a5fa;word-break:break-all;">${escapeHtml(fullUrl)}</code>
          <button type="button" class="pill-btn highlight mini">Copy</button>`;
        row.querySelector("button").onclick = () => {
          if (navigator.clipboard) navigator.clipboard.writeText(fullUrl).catch(() => {});
          showToast("TV Link copied!", 1800);
        };
        urlsBox.appendChild(row);
      });
    } catch (e) {
      urlsBox.textContent = "Could not fetch local IP";
    }
  }

  tvBtn.onclick = (e) => {
    e.stopPropagation();
    if (isScreenLocked) return;
    openTvModal();
  };
  if (scanBtn) scanBtn.onclick = () => scanDevices();
  if (closeTv) closeTv.onclick = () => tvModal.classList.remove("open");
  tvModal.addEventListener("pointerdown", (e) => { if (e.target === tvModal) tvModal.classList.remove("open"); });

  if (nativeBtn) {
    nativeBtn.onclick = async () => {
      if (video && video.remote && typeof video.remote.prompt === "function") {
        try {
          await video.remote.prompt();
          tvModal.classList.remove("open");
          return;
        } catch (err) {}
      }
      showToast("Browser cast available nahi hai — neeche wala Wi-Fi link TV browser me kholein", 3500, "warn");
    };
  }
})();


// Save last played video state on play / timeupdate
function saveLastPlayedState(file, time, title) {
  try {
    localStorage.setItem('astra_last_file', file);
    localStorage.setItem('astra_last_time', time);
    localStorage.setItem('astra_last_title', title);
  } catch (e) {}
}

// Restore last played video on page load if available
window.addEventListener('DOMContentLoaded', () => {
  try {
    const lastFile = localStorage.getItem('astra_last_file');
    const lastTime = localStorage.getItem('astra_last_time');
    if (lastFile && typeof loadVideo === 'function' && !window.location.hash.includes('play=')) {
      // Optional: auto load last video or prepare player state
      console.log("Restoring last played state for:", lastFile);
    }
  } catch (e) {}
});


// Persistent Player State Across Reloads and Hash Changes
function saveActivePlayerState(file, title, time, season, episode) {
  try {
    localStorage.setItem('astra_active_file', file || '');
    localStorage.setItem('astra_active_title', title || '');
    localStorage.setItem('astra_active_time', time || 0);
    localStorage.setItem('astra_active_season', season || '');
  } catch(e) {}
}

window.addEventListener('load', () => {
  try {
    const savedFile = localStorage.getItem('astra_active_file');
    const savedTime = localStorage.getItem('astra_active_time');
    if (savedFile && window.location.hash.includes('player') && typeof loadVideo === 'function') {
      // Restore if returning to player
      console.log("Restoring active player state for:", savedFile);
    }
  } catch(e) {}
});


// Playlist Detail View Controller
function openPlaylistView(playlistData) {
  const homeView = document.getElementById('home-view') || document.querySelector('.home-container');
  const playerView = document.getElementById('player-view') || document.querySelector('.player-container');
  const playlistView = document.getElementById('playlist-view');

  if (homeView) homeView.style.display = 'none';
  if (playerView) playerView.style.display = 'none';
  if (playlistView) playlistView.style.display = 'block';

  // Populate Header
  document.getElementById('pl-title').textContent = playlistData.name || 'Unknown Anime';
  if (playlistData.thumbnail) {
    document.getElementById('pl-thumbnail').src = playlistData.thumbnail;
  }

  // Setup Season Tabs & Episodes Grid logic here
  console.log("Opened playlist overview for:", playlistData.name);
}

document.addEventListener('click', (e) => {
  const card = e.target.closest('.playlist-card, .anime-card');
  if (card && typeof openPlaylistView === 'function') {
    // Intercept default direct play and open overview instead
    // e.preventDefault();
    // openPlaylistView({ name: card.dataset.title, thumbnail: card.querySelector('img')?.src });
  }
});


// Hide/Show View Controller
function showView(viewName) {
  const homeView = document.getElementById('home-view') || document.querySelector('.home-container');
  const playerView = document.getElementById('player-view') || document.getElementById('player') || document.querySelector('.player-container');
  const overviewView = document.getElementById('playlist-view') || document.getElementById('overview');

  // Default states
  if (homeView) homeView.style.display = 'none';
  if (playerView) playerView.style.display = 'none';
  if (overviewView) overviewView.style.display = 'none';

  if (viewName === 'home' && homeView) {
    homeView.style.display = 'block';
  } else if (viewName === 'player' && playerView) {
    playerView.style.display = 'block';
  } else if (viewName === 'overview' && overviewView) {
    overviewView.style.display = 'block';
  }
}


// Dedicated Playlist Overview Controller
function openPlaylistOverview(folderName, episodes) {
  console.log("Opening playlist overview for:", folderName);
  const overviewView = document.getElementById('playlist-view');
  if (overviewView) {
    overviewView.style.display = 'block';
  } else {
    alert("Playlist view container missing!");
    return;
  }

  const titleEl = document.getElementById('pl-title');
  const thumbEl = document.getElementById('pl-thumbnail');
  const gridEl = document.getElementById('pl-episodes-grid');

  if (titleEl) titleEl.textContent = folderName;
  
  const firstEp = episodes && episodes[0];
  if (firstEp && thumbEl && typeof attachThumb === 'function') {
    attachThumb(thumbEl, firstEp.relPath || firstEp.fullPath, 'series', folderName);
  }

  if (gridEl && episodes) {
    gridEl.innerHTML = '';
    episodes.forEach((ep) => {
      const epCard = document.createElement('div');
      epCard.style.cssText = "background: #1f2937; padding: 10px; border-radius: 8px; cursor: pointer;";
      const { title } = formatCardHeader(ep.name);
      epCard.innerHTML = `<div style="font-size: 13px; color: #fff; font-weight: 500;">${title}</div>`;
      epCard.onclick = () => {
        if (overviewView) overviewView.style.display = 'none';
        if (typeof inspectMediaAndPlay === 'function') {
          inspectMediaAndPlay(ep.name, ep.relPath || ep.fullPath, 0);
        }
      };
      gridEl.appendChild(epCard);
    });
  }

  const backBtn = document.getElementById('back-to-home');
  if (backBtn) {
    backBtn.onclick = () => {
      if (overviewView) overviewView.style.display = 'none';
    };
  }
}
/* ===== Quality tab (only while a 10-bit / HEVC video is being converted live) + one-line reverb dropdown ===== */
(function () {
  try {
    const QOPTS = [
      ['auto', 'Auto', 'adapts to your phone'],
      ['uhd', '4K', '2160p · very heavy'],
      ['qhd', '2K', '1440p · heavy'],
      ['fhd', '1080p', 'heavy'],
      ['balanced', '720p', 'balanced'],
      ['fast', '480p', 'fast'],
      ['low', '360p', 'lightest']
    ];
    const LBL = { low: '360p', fast: '480p', balanced: '720p', quality: '720p+', fhd: '1080p', qhd: '2K', uhd: '4K' };
    const tabBtn = $('tabBtnQuality'), list = $('qList'), now = $('qNow'), sel = $('prefQuality');
    if (!tabBtn || !list || !sel) return;
    QOPTS.forEach(([k, name, sub]) => {
      const b = document.createElement('div'); b.className = 'opt-row'; b.dataset.q = k;
      b.innerHTML = '<span class="sub-name"></span><span class="qsub"></span>';
      b.firstChild.textContent = name; b.lastChild.textContent = sub;
      b.onclick = () => {
        sel.value = k;
        sel.dispatchEvent(new Event('change', { bubbles: true }));   // saves, asks for heavy ones, restarts the stream
        paint();
        setTimeout(paint, 400);
      };
      list.appendChild(b);
    });
    function paint() {
      const cur = prefs.quality === 'quality' ? 'balanced' : prefs.quality;
      list.querySelectorAll('.opt-row').forEach((r) => r.classList.toggle('selected', r.dataset.q === cur));
      let q = ''; try { q = effectiveQuality(); } catch (e) {}
      now.textContent = q ? 'Now: ' + (LBL[q] || q) : '';
    }
    function sync() {
      const show = !!(isTranscodingMode && isCurrentFile10Bit);
      if (tabBtn.style.display !== (show ? '' : 'none')) {
        tabBtn.style.display = show ? '' : 'none';
        if (!show && tabBtn.classList.contains('active')) {
          const f = document.querySelector('.modal-tabs .tab-btn[data-target="tabFilters"]'); if (f) f.click();
        }
      }
      if (show) paint();
    }
    sel.addEventListener('change', () => setTimeout(paint, 300));
    setInterval(sync, 600);
    sync(); paint();
  } catch (e) { console.warn('quality tab', e); }
})();
