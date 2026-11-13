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
let lastRecordedTime = 0;
let currentBrowsingDir = '/sdcard';
let currentParentDir = '';
let activeAudioStreamIndex = '0:a:0';
let isTranscodingMode = false;
let transcodeBaseOffset = 0;
let isCurrentFile10Bit = false;
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
const PREF_DEFAULTS = { v: 4, seekStep: 10, quality: 'auto', preBuffer: 0, autoSkip: false, autoNext: true, thumbs: true, fsRotate: true, fsFill: false, hwEnc: 'off' };
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
function needBuf() { return isTranscodingMode && isCurrentFile10Bit ? Math.max(5, prefs.preBuffer) : prefs.preBuffer; }
let startWatch = null;
let sleepTimerId = null;
let sleepAtEnd = false;

let audioCtx = null, audioSrcNode = null, delayNode = null, bassFilter = null, trebleFilter = null;
let currentAudioOffset = 0.0;
let eqBassDb = 0, eqTrebleDb = 0, eqPreset = 'flat';

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
function showToast(message, ms = 3200) {
  let el = $('astraToast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'astraToast';
    el.className = 'astra-toast';
    el.setAttribute('role', 'status');
  }
  // Fullscreen only paints the fullscreen element's subtree, so move the toast into it.
  const host = toastHost();
  if (el.parentNode !== host) host.appendChild(el);
  el.textContent = message;
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

function initWebAudio() {
  if (audioCtx) { resumeAudio(); return; }
  try {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    audioSrcNode = audioCtx.createMediaElementSource(video);

    delayNode = audioCtx.createDelay(10.0);
    delayNode.delayTime.value = Math.max(0, currentAudioOffset);

    bassFilter = audioCtx.createBiquadFilter();
    bassFilter.type = 'lowshelf';
    bassFilter.frequency.value = 250;
    bassFilter.gain.value = eqBassDb;

    trebleFilter = audioCtx.createBiquadFilter();
    trebleFilter.type = 'highshelf';
    trebleFilter.frequency.value = 3500;
    trebleFilter.gain.value = eqTrebleDb;

    audioSrcNode.connect(delayNode);
    delayNode.connect(bassFilter);
    bassFilter.connect(trebleFilter);
    trebleFilter.connect(audioCtx.destination);
  } catch (e) {}
  resumeAudio();
}

const rngAudioOffset = $('rngAudioOffset');
if (rngAudioOffset) {
  rngAudioOffset.addEventListener('input', (e) => {
    initWebAudio();
    currentAudioOffset = parseFloat(e.target.value);
    $('lblAudioOffset').textContent = `${currentAudioOffset > 0 ? '+' : ''}${currentAudioOffset.toFixed(2)}s`;
    if (delayNode) {
      delayNode.delayTime.value = Math.max(0, currentAudioOffset);
    }
    saveCurrentSettings();
  });
}

const EQ_PRESETS = {
  flat: [0, 0],
  bass: [10, 2],
  vocal: [-4, 6],
  cinema: [6, 5]
};

function applyEq(bass, treble, preset) {
  eqBassDb = clamp(Math.round(Number(bass) || 0), -12, 15);
  eqTrebleDb = clamp(Math.round(Number(treble) || 0), -12, 15);
  eqPreset = preset || '';
  if (eqBassSlider) eqBassSlider.value = eqBassDb;
  if (eqTrebleSlider) eqTrebleSlider.value = eqTrebleDb;
  $('lblBass').textContent = `${eqBassDb} dB`;
  $('lblTreble').textContent = `${eqTrebleDb} dB`;
  if (bassFilter) bassFilter.gain.value = eqBassDb;
  if (trebleFilter) trebleFilter.gain.value = eqTrebleDb;
  document.querySelectorAll('[data-eq]').forEach((b) => {
    b.classList.toggle('active', b.dataset.eq === eqPreset);
  });
}

[eqBassSlider, eqTrebleSlider].forEach((slider) => {
  if (!slider) return;
  slider.addEventListener('input', () => {
    initWebAudio();
    applyEq(eqBassSlider.value, eqTrebleSlider.value, '');
    saveCurrentSettings();
  });
});

document.querySelectorAll('[data-eq]').forEach((btn) => {
  btn.onclick = () => {
    const preset = EQ_PRESETS[btn.dataset.eq] || EQ_PRESETS.flat;
    initWebAudio();
    applyEq(preset[0], preset[1], btn.dataset.eq);
    saveCurrentSettings();
  };
});

const btnToggleSubStylePanel = $('btnToggleSubStylePanel');
const subStyleSection = $('subStyleSection');
if (btnToggleSubStylePanel && subStyleSection) {
  btnToggleSubStylePanel.onclick = () => {
    const isHidden = subStyleSection.style.display === 'none';
    subStyleSection.style.display = isHidden ? 'block' : 'none';
    btnToggleSubStylePanel.classList.toggle('highlight', isHidden);
  };
}

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
    fetch('/api/stream/pause', { method: 'POST' }).catch(() => {});
  }
}

function notifyStreamResume() {
  if (isTranscodingMode) {
    fetch('/api/stream/resume', { method: 'POST' }).catch(() => {});
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
window.addEventListener('blur', triggerAutoPause);
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

    if (saved.eqBass !== undefined || saved.eqTreble !== undefined) {
      applyEq(saved.eqBass, saved.eqTreble, saved.eqPreset);
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
    if (saved.filterChip) {
      document.querySelectorAll('#tabFilters [data-filter], #tabFilters [data-mine]').forEach((c) => c.classList.remove('active'));
      const sel = saved.filterChip[0] === 'f' ? `[data-filter="${saved.filterChip.slice(2)}"]` : `[data-mine="${saved.filterChip.slice(2)}"]`;
      const c = document.querySelector(`#tabFilters ${sel}`); if (c) c.classList.add('active');
    }
    try {
      if (saved.aiLang && [...aiUi.lang.options].some((o) => o.value === saved.aiLang)) aiUi.lang.value = saved.aiLang;
      if (saved.aiTr !== undefined) aiUi.tr.checked = !!saved.aiTr;
      if (saved.aiMode) setAiMode(saved.aiMode, false);
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
    sharpness: $('sharpStrength').value,
    bright: $('rngBright').value,
    contrast: $('rngContrast').value,
    sat: $('rngSat').value,
    hue: $('rngHue').value,
    warm: $('rngWarm').value,
    audioOffset: currentAudioOffset,
    eqBass: eqBassDb,
    eqTreble: eqTrebleDb,
    eqPreset,
    preferredLang: preferredDefaultLang,
    subLang: preferredSubLang,
    speed: playbackSpeed,
    volume: video.volume,
    muted: video.muted
  };
  const chip = document.querySelector('#tabFilters [data-filter].active, #tabFilters [data-mine].active');
  settings.filterChip = chip ? (chip.dataset.filter ? `f:${chip.dataset.filter}` : `m:${chip.dataset.mine}`) : '';
  try { settings.aiLang = aiUi.lang.value; settings.aiTr = aiUi.tr.checked; settings.aiMode = aiMode; } catch (e) {}
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
function updateSubtitleStyles() {
  const size = $('rngSubSize').value;
  const scale = $('rngSubScale').value;
  const isBold = $('chkSubBold').checked;
  const hasShadow = $('chkSubShadow').checked;
  const hasBorder = $('chkSubBorder').checked;
  const hasBg = $('chkSubBg').checked;
  const textColor = $('colSubText').value;
  const borderColor = $('colSubBorder').value;

  $('lblSubSize').textContent = `${size}px`;
  $('lblSubScale').textContent = `${scale}%`;

  subDisplayBox.style.fontSize = `${size}px`;
  subDisplayBox.style.transform = `scale(${scale / 100})`;
  subDisplayBox.style.fontWeight = isBold ? '700' : '400';
  subDisplayBox.style.color = textColor;
  subDisplayBox.style.backgroundColor = hasBg ? 'rgba(0, 0, 0, 0.65)' : 'transparent';
  subDisplayBox.style.padding = hasBg ? '4px 8px' : '0px';
  subDisplayBox.style.borderRadius = hasBg ? '4px' : '0px';

  const shadows = [];
  if (hasBorder) {
    shadows.push(`-1px -1px 0 ${borderColor}`, `1px -1px 0 ${borderColor}`, `-1px 1px 0 ${borderColor}`, `1px 1px 0 ${borderColor}`);
  }
  if (hasShadow) {
    shadows.push('2px 2px 4px rgba(0,0,0,0.9)', '0 0 8px rgba(0,0,0,0.8)');
  }
  subDisplayBox.style.textShadow = shadows.length > 0 ? shadows.join(', ') : 'none';
  if (typeof syncTopBoxStyle === 'function') syncTopBoxStyle();
  saveCurrentSettings();
}

['rngSubSize', 'rngSubScale', 'chkSubBold', 'chkSubShadow', 'chkSubBorder', 'chkSubBg', 'colSubText', 'colSubBorder'].forEach((id) => {
  const el = $(id);
  if (el) el.addEventListener('input', updateSubtitleStyles);
});

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
  ['fontSize', 'transform', 'fontWeight', 'color', 'backgroundColor', 'padding', 'borderRadius', 'textShadow'].forEach((k) => { subTopBox.style[k] = subDisplayBox.style[k]; });
}
syncTopBoxStyle();

function hideSubtitle() {
  activeSubSignature = '';
  subDisplayBox.style.display = 'none';
  subDisplayBox.innerHTML = '';
  subTopBox.style.display = 'none';
  subTopBox.innerHTML = '';
  subPosLayer.textContent = '';
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

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (cue.startTime > t || cue.endTime <= t) continue;
    const raw = cue.text || '';
    const pm = POS_RE.exec(raw);
    if (pm) {
      placed.push({ x: +pm[1], y: +pm[2], an: +pm[3], fs: pm[4] ? +pm[4] : 0, c1: pm[5], c3: pm[6], html: formatCueText(raw.slice(pm[0].length)) });
    } else if (raw.includes('<position:top>')) {
      topText += formatCueText(raw.replace(/<position:top>/g, '')) + '<br>';
    } else {
      bottomText += formatCueText(raw) + '<br>';
    }
  }

  const rect = placed.length ? pictureRect() : null;
  const signature = `${topText ? 'T' : 'B'}|${topText || bottomText}|${placed.map((p) => `${p.x},${p.y},${p.an},${p.fs},${p.c1},${p.html}`).join(';')}|${rect ? Math.round(rect.w) + 'x' + Math.round(rect.h) : ''}`;
  if (signature === activeSubSignature) return;

  if (!topText && !bottomText && !placed.length) {
    hideSubtitle();
    return;
  }

  activeSubSignature = signature;
  subTopBox.style.bottom = 'auto'; subTopBox.style.top = '8%';
  subTopBox.innerHTML = topText;
  subTopBox.style.display = topText ? 'inline-block' : 'none';
  subDisplayBox.style.top = 'auto'; subDisplayBox.style.bottom = '52px';
  subDisplayBox.innerHTML = bottomText;
  subDisplayBox.style.display = bottomText ? 'inline-block' : 'none';

  subPosLayer.textContent = '';
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
  glReady = false;
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

function renderGLFrame() {
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
  saveCurrentSettings();
}

['rngBright', 'rngContrast', 'rngSat', 'rngHue', 'rngWarm'].forEach((id) => {
  $(id).addEventListener('input', applyCombinedFilters);
});

$('sharpStrength').addEventListener('input', (e) => {
  currentSharpness = parseFloat(e.target.value) / 100;
  $('lblSharp').textContent = currentSharpness > 0 ? `${e.target.value}%` : 'Off';
  glDirty = true;
  saveCurrentSettings();
});

function setActiveFilterChip(name) {
  document.querySelectorAll('[data-filter]').forEach((b) => b.classList.toggle('active', b.dataset.filter === name));
}

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

document.querySelectorAll('[data-filter]').forEach((btn) => {
  btn.onclick = () => {
    document.querySelectorAll('[data-filter],[data-mine]').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    const f = btn.dataset.filter;
    if (f === 'vivid') {
      $('rngBright').value = 108; $('rngContrast').value = 120; $('rngSat').value = 145; $('rngHue').value = 0; $('rngWarm').value = 0;
      $('sharpStrength').value = 80; currentSharpness = 0.8; $('lblSharp').textContent = '80%';
    } else if (f === 'cyberpunk') {
      $('rngBright').value = 105; $('rngContrast').value = 135; $('rngSat').value = 160; $('rngHue').value = 15; $('rngWarm').value = 0;
      $('sharpStrength').value = 120; currentSharpness = 1.2; $('lblSharp').textContent = '120%';
    } else if (f === 'sunset') {
      $('rngBright').value = 102; $('rngContrast').value = 110; $('rngSat').value = 125; $('rngHue').value = 0; $('rngWarm').value = 35;
      $('sharpStrength').value = 40; currentSharpness = 0.4; $('lblSharp').textContent = '40%';
    } else if (f === 'oled') {
      $('rngBright').value = 92; $('rngContrast').value = 145; $('rngSat').value = 110; $('rngHue').value = 0; $('rngWarm').value = 0;
      $('sharpStrength').value = 60; currentSharpness = 0.6; $('lblSharp').textContent = '60%';
    } else if (f === 'eyecare') {
      $('rngBright').value = 85; $('rngContrast').value = 95; $('rngSat').value = 85; $('rngHue').value = 0; $('rngWarm').value = 50;
      $('sharpStrength').value = 0; currentSharpness = 0; $('lblSharp').textContent = 'Off';
    } else if (f === 'manga') {
      $('rngBright').value = 110; $('rngContrast').value = 140; $('rngSat').value = 0; $('rngHue').value = 0; $('rngWarm').value = 0;
      $('sharpStrength').value = 100; currentSharpness = 1.0; $('lblSharp').textContent = '100%';
    } else {
      $('rngBright').value = 100; $('rngContrast').value = 100; $('rngSat').value = 100; $('rngHue').value = 0; $('rngWarm').value = 0;
      $('sharpStrength').value = 0; currentSharpness = 0; $('lblSharp').textContent = 'Off';
    }
    applyCombinedFilters();
  };
});

/* Saved (named) filters ------------------------------------------------ */
const FILTERS_KEY = 'astra_saved_filters';
function loadSavedFilters() { try { const v = JSON.parse(localStorage.getItem(FILTERS_KEY) || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } }
function storeSavedFilters(list) { try { localStorage.setItem(FILTERS_KEY, JSON.stringify(list)); } catch (e) {} }
function currentFilterValues() {
  return { b: +$('rngBright').value, c: +$('rngContrast').value, s: +$('rngSat').value, h: +$('rngHue').value, w: +$('rngWarm').value, sh: +$('sharpStrength').value };
}
function applyFilterValues(v) {
  $('rngBright').value = v.b; $('rngContrast').value = v.c; $('rngSat').value = v.s; $('rngHue').value = v.h; $('rngWarm').value = v.w;
  $('sharpStrength').value = v.sh; currentSharpness = v.sh / 100; $('lblSharp').textContent = v.sh > 0 ? `${v.sh}%` : 'Off';
  applyCombinedFilters();
}
function renderSavedFilters() {
  const box = $('savedFilters'), list = loadSavedFilters();
  $('savedFiltersEmpty').style.display = list.length ? 'none' : '';
  box.textContent = '';
  list.forEach((f, i) => {
    const b = document.createElement('button');
    b.className = 'chip-preset'; b.dataset.mine = String(i);
    const nm = document.createElement('span'); nm.textContent = f.name;
    const x = document.createElement('span'); x.className = 'x'; x.textContent = '\u00d7'; x.title = 'Delete';
    b.append(nm, x);
    b.onclick = (e) => {
      if (e.target === x) { const l = loadSavedFilters(); l.splice(i, 1); storeSavedFilters(l); renderSavedFilters(); return; }
      document.querySelectorAll('[data-filter],[data-mine]').forEach((c) => c.classList.remove('active'));
      b.classList.add('active'); applyFilterValues(f);
      showToast(`Filter: ${f.name}`, 1200);
    };
    box.appendChild(b);
  });
}
$('btnSaveFilter').onclick = () => {
  const inp = $('filterName'); const name = inp.value.trim().slice(0, 24);
  if (!name) { inp.focus(); showToast('Type a name for this filter', 1500); return; }
  const list = loadSavedFilters().filter((f) => f.name.toLowerCase() !== name.toLowerCase());
  list.push({ name, ...currentFilterValues() });
  storeSavedFilters(list.slice(-12)); inp.value = ''; renderSavedFilters();
  showToast(`Saved filter \u201c${name}\u201d`, 1500);
};
$('filterName').addEventListener('keydown', (e) => { e.stopPropagation(); if (e.key === 'Enter') $('btnSaveFilter').click(); });
$('filterName').addEventListener('keyup', (e) => e.stopPropagation());
renderSavedFilters();

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
    // Locked: a tap only brings the unlock button back into view.
    resetHideTimer();
    return;
  }
  const now = Date.now();
  if (now - tapTracker[side] < 280) {
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
    tapTracker[side] = 0;
  } else {
    tapTracker[side] = now;
    setTimeout(() => {
      if (Date.now() - tapTracker[side] >= 270 && tapTracker[side] !== 0) {
        const isHidden = topOverlay.classList.contains('hidden');
        if (isHidden) resetHideTimer();
        else {
          topOverlay.classList.add('hidden');
          bottomOverlay.classList.add('hidden');
        }
      }
    }, 280);
  }
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
    + `&startTime=${sec}&is10Bit=${isCurrentFile10Bit ? '1' : '0'}&q=${effectiveQuality()}${prefs.hwEnc === 'auto' ? '&enc=hw' : ''}`;
}

function updateQualityReadout() {
  const qv = $('qualityValue'), qt = $('qualityType');
  if (!qv || !qt) return;
  const h = video.videoHeight;
  qv.textContent = h > 0 ? `${h}p` : (playerResBadge.textContent || 'Auto');
  const ten = !!isCurrentFile10Bit;
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

  isTranscodingMode = true;
  transcodeBaseOffset = sec;
  updateStreamBadges();
  video.src = transcodeUrl(sec);
  video.load();
  armStartWatch();
  video.play().catch(() => {});
}

function seekToTargetSecond(targetSec) {
  const dur = getDuration() || 1;
  const clampedSec = Math.max(0, Math.min(dur - 1, targetSec));

  if (!isTranscodingMode) {
    video.currentTime = clampedSec;
    savePlaybackState();
    setupSubtitleCues();
    return;
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

async function inspectMediaAndPlay(rawTitle, relPath, seekTime = 0) {
  autoLevel = 0; autoSlowHits = 0;
  const token = ++playToken;
  seekTime = Number(seekTime) > 0 ? Number(seekTime) : 0;

  // Fresh state for the new file (nothing may leak over from the previous episode).
  activeVideoPath = relPath;
  setChapters([]);
  nativeFallbackTried = false;
  compatMode = false;
  isCurrentFile10Bit = false;
  isTranscodingMode = false;
  currentExplicitDuration = 0;
  activeAudioStreamIndex = '0:a:0';
  transcodeBaseOffset = 0;
  lastRecordedTime = 0;
  manualCenterPlay.style.display = 'none';
  resetSubtitleState();
  resetTimelineUI();
  setSubDelay(0);

  playerCurrentTitle.textContent = cleanMediaTitle(rawTitle);

  if (!currentVideoList.some(isActiveItem)) {
    const folder = findFolderForPath(relPath, rawTitle);
    if (folder !== null) {
      currentPathTokens = folder === 'Anime Root' ? [] : folder.split(' / ');
      currentVideoList = fullLibrary[folder];
    }
  }

  const folderLabel = currentPathTokens.join(' / ') || 'Anime';
  playerCurrentFolder.textContent = folderLabel;
  if (epDrawerFolderName) epDrawerFolderName.textContent = folderLabel;
  renderFloatingEpisodes();
  renderInlinePlaylist();
  updateMediaSession();
  syncDeepLink(relPath);

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
    playerDurationBadge.textContent = formatTime(currentExplicitDuration);
    isCurrentFile10Bit = !!meta.is10BitHevc;
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
    if (isTranscodingMode && needBuf() > 0 && !internalPause) { video.pause(); startRebuffer(); }
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
video.addEventListener('error', () => {
  if (!activeVideoPath || !video.getAttribute('src')) return;
  playerBufferingIndicator.classList.remove('show');

  // The browser could not play the file natively (HEVC, odd codecs, ...): retry once through the transcoder.
  if (fallbackToTranscode('Format not supported natively — switching to compatibility transcode')) return;
  showToast('Playback failed. The file may be missing or unsupported.', 4500);
});

function updatePlayButtonIcon(isPlaying) {
  if (isPlaying) {
    playBtn.classList.add('playing');
    playIconSvg.innerHTML = '<rect x="6" y="4" width="4" height="16" fill="currentColor"/><rect x="14" y="4" width="4" height="16" fill="currentColor"/>';
  } else {
    playBtn.classList.remove('playing');
    playIconSvg.innerHTML = '<polygon points="6 4 20 12 6 20 6 4" fill="currentColor"/>';
  }
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
setInterval(() => {
  if (!video.paused && subsOn) updateSubtitleDisplay();
}, 120);

// Dragging only previews the position; the (expensive) seek happens on release.
timelineSlider.addEventListener('input', () => {
  if (isScreenLocked) return;
  const dur = getDuration();
  if (!dur) return;
  isScrubbing = true;
  const target = (timelineSlider.value / 100) * dur;
  trackPlayed.style.width = `${timelineSlider.value}%`;
  timeLabel.textContent = `${formatTime(target)} / ${formatTime(dur)}`;
  const ch = chapterAt(target); if (chapterLabel) chapterLabel.textContent = ch ? ch.title : '';
});
timelineSlider.addEventListener('change', () => {
  const wasScrubbing = isScrubbing;
  isScrubbing = false;
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
window.addEventListener('resize', () => { if (fakeFs && window.innerWidth > window.innerHeight) { setFakeFs(false); rotatedLandscape = false; } });
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
  volIconSvg.innerHTML = video.muted
    ? '<line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'
    : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/>';
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

  lockBtn.innerHTML = isScreenLocked
    ? '<svg width="20" height="20" viewBox="0 0 24 24" fill="#fb7185" stroke="#fb7185" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>'
    : '<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>';

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
settingsBtn.onclick = () => {
  if (isScreenLocked) return;
  playerEpisodesDrawer.classList.remove('open');
  settingsModal.classList.toggle('open');
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
  clearTimeout(hideTimer);

  if (!video.paused) {
    hideTimer = setTimeout(() => {
      if (settingsModal.classList.contains('open') || playerEpisodesDrawer.classList.contains('open') || $('chaptersPanel').classList.contains('open')) return;
      topOverlay.classList.add('hidden');
      bottomOverlay.classList.add('hidden');
    }, 5000);
  }
}

// Touch taps on the video are handled by the tap zones (show/hide toggle). If the wrapper also
// revealed the controls on touchstart, the zone's single-tap toggle would instantly hide them again.
playerWrapper.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') resetHideTimer(); });
[topOverlay, bottomOverlay, settingsModal, playerEpisodesDrawer, $('chaptersPanel')].forEach((el) => {
  ['pointerdown', 'click'].forEach((evt) => el.addEventListener(evt, resetHideTimer));
});

floatingEpisodesBtn.onclick = () => {
  if (isScreenLocked) return;
  settingsModal.classList.remove('open');
  renderFloatingEpisodes();
  playerEpisodesDrawer.classList.toggle('open');
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
  if (currentVideoList.length === 0) {
    episodesDrawerList.innerHTML = '<div class="empty-hint">No queue active. Pick a series from dashboard!</div>';
    return;
  }
  currentVideoList.forEach((item) => {
    const row = document.createElement('div');
    const isPlaying = isActiveItem(item);
    row.className = `drawer-ep-row ${isPlaying ? 'active' : ''}`;
    row.innerHTML = `<div><div class="drawer-ep-title">${escapeHtml(cleanMediaTitle(item.name))}</div><div class="drawer-ep-sub">${subLine(item)}</div></div>`;
    row.onclick = () => {
      inspectMediaAndPlay(item.name, item.relPath || item.fullPath, 0);
      playerEpisodesDrawer.classList.remove('open');
      renderInlinePlaylist();
    };
    episodesDrawerList.appendChild(row);
  });
}

function renderInlinePlaylist() {
  playerInlinePlaylist.innerHTML = '';
  if (currentVideoList.length === 0) {
    playerInlinePlaylist.innerHTML = '<div class="empty-hint">Select a series to view episodes</div>';
    return;
  }
  playerShelfTitle.textContent = currentPathTokens.join(' / ') || 'Active Queue';

  currentVideoList.forEach((item) => {
    const row = document.createElement('div');
    const isPlaying = isActiveItem(item);
    row.className = `explorer-row ${isPlaying ? 'active-row' : ''}`;
    row.innerHTML = `
      <div class="row-left">
        <svg width="16" height="16" viewBox="0 0 24 24" fill="${isPlaying ? '#3b82f6' : 'currentColor'}"><polygon points="6 4 20 12 6 20 6 4"/></svg>
        <div>
          <div class="row-title">${escapeHtml(cleanMediaTitle(item.name))}</div>
          <div class="row-sub">${subLine(item)}</div>
        </div>
      </div>
      <span class="row-badge">${isPlaying ? 'Playing' : 'Play'}</span>
    `;
    row.onclick = () => {
      inspectMediaAndPlay(item.name, item.relPath || item.fullPath, 0);
      renderInlinePlaylist();
    };
    playerInlinePlaylist.appendChild(row);
  });
}

/* ------------------------------------------------------------------ */
/* Subtitle file picker                                                */
/* ------------------------------------------------------------------ */
async function openSubFolderPicker(dir = '') {
  $('subPickerModal').classList.add('open');
  const list = $('subPickerList');
  try {
    const targetDir = dir || currentBrowsingDir || '/sdcard';
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
    const targetDir = dirPath || currentBrowsingDir || '/sdcard';
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
      row.className = 'explorer-row';
      row.innerHTML = `
        <div class="row-left">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="${f.type === 'video' ? '#10b981' : '#f59e0b'}"><polygon points="6 4 20 12 6 20 6 4"/></svg>
          <div class="row-title">${escapeHtml(cleanMediaTitle(f.name))}</div>
        </div>
        <span class="row-badge">${f.type === 'video' ? 'Play' : 'Attach'}</span>
      `;
      row.onclick = () => {
        if (f.type === 'video') {
          playFromExplorer(f, videosHere, data.current);
        } else {
          addExternalSubtitle(f.name, f.fullPath);
          showToast(`Subtitle attached: ${f.name}`, 2000);
        }
      };
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
  exploreFolder(currentBrowsingDir || '/sdcard');
  navigateTo('library');
};

/* ------------------------------------------------------------------ */
/* Hardware telemetry (only polled while the Metrics page is open)     */
/* ------------------------------------------------------------------ */
const ramDataPoints = new Array(30).fill(15);
const cpuDataPoints = new Array(30).fill(10);
let telemetryBusy = false;

async function pulseHardwareGraph() {
  if (currentView !== 'settings' || document.hidden || telemetryBusy) return;
  telemetryBusy = true;
  try {
    const res = await fetch('/api/system/status');
    const data = await res.json();

    if (ramStatsText) {
      ramStatsText.textContent = `CPU: ${data.cpuPercent}% | RAM: ${data.ramUsedMB} MB (${data.usedSysMemMB}/${data.totalSysMemMB} MB Sys)`;
    }

    ramDataPoints.push(parseFloat(data.ramUsedMB));
    ramDataPoints.shift();

    cpuDataPoints.push(parseFloat(data.cpuPercent));
    cpuDataPoints.shift();

    if (ramGraphCanvas) {
      const ctx = ramGraphCanvas.getContext('2d');
      const W = ramGraphCanvas.width;
      const H = ramGraphCanvas.height;

      ctx.clearRect(0, 0, W, H);

      ctx.fillStyle = '#070a12';
      ctx.fillRect(0, 0, W, H);

      ctx.strokeStyle = 'rgba(70, 95, 140, 0.25)';
      ctx.lineWidth = 1;

      for (let y = 15; y < H; y += 28) {
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(W, y);
        ctx.stroke();
      }
      for (let x = 20; x < W; x += 35) {
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, H);
        ctx.stroke();
      }

      ctx.strokeStyle = '#f59e0b';
      ctx.lineWidth = 2;
      ctx.beginPath();
      cpuDataPoints.forEach((val, idx) => {
        const x = (idx / (cpuDataPoints.length - 1)) * W;
        const y = H - (val / 100) * (H - 25) - 10;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();

      const maxRam = Math.max(...ramDataPoints, 120);
      ctx.strokeStyle = '#38bdf8';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ramDataPoints.forEach((val, idx) => {
        const x = (idx / (ramDataPoints.length - 1)) * W;
        const y = H - (val / maxRam) * (H - 25) - 10;
        if (idx === 0) ctx.moveTo(x, y);
        else ctx.lineTo(x, y);
      });
      ctx.stroke();
    }
  } catch (e) {
    /* server unreachable - try again next tick */
  } finally {
    telemetryBusy = false;
  }
}
setInterval(pulseHardwareGraph, 500);

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
  if (target === 'player') { renderInlinePlaylist(); if (activeVideoPath) syncDeepLink(activeVideoPath); }
  if (target === 'library') exploreFolder(currentBrowsingDir || '/sdcard');
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

    const card = document.createElement('div');
    card.className = 'anime-deck-card';
    card.innerHTML = `
      <div class="deck-thumb"></div>
      <h4 class="deck-title">${escapeHtml(cleanMediaTitle(folder))}</h4>
      <span class="deck-sub">${eps.length} Episodes</span>
    `;
    card.onclick = () => {
      currentPathTokens = folder === 'Anime Root' ? [] : folder.split(' / ');
      currentVideoList = eps;
      const start = pickSeriesStart(eps);
      renderInlinePlaylist();
      inspectMediaAndPlay(start.ep.name, start.ep.relPath || start.ep.fullPath, start.time);
      navigateTo('player');
    };
    seriesCardsGrid.appendChild(card);
    attachThumb(card.querySelector('.deck-thumb'), eps[0].relPath || eps[0].fullPath, 'series', folder);
  });

  if (shown === 0) {
    const hint = document.createElement('span');
    hint.className = 'empty-hint';
    hint.textContent = q
      ? `No results for "${query}"`
      : `No videos found${libraryRoot ? ` in ${libraryRoot}` : ''}. Pick a folder in Folder Explorer and tap "Set as Media Root".`;
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

    if (keys.length > 0) {
      const topKey = keys[0];
      const topItem = historyCache[topKey];
      heroTitle.textContent = cleanMediaTitle(topItem.name);
      heroProgressPill.textContent = `${topItem.percent}% Completed`;
      heroSynopsis.textContent = `Resume from ${formatTime(topItem.time)} / ${formatTime(topItem.dur)} • Hardware Saved`;
      if (heroResumeLabel) heroResumeLabel.textContent = 'Resume Playback';
      heroResumeBtn.onclick = () => {
        inspectMediaAndPlay(topItem.name, topKey, resumeStartTime(topItem));
        navigateTo('player');
      };
    } else {
      // Nothing watched (or history just cleared): don't keep showing a stale title.
      heroTitle.textContent = 'No active anime';
      heroProgressPill.textContent = '0%';
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
      return;
    }

    keys.forEach((k) => {
      const item = historyCache[k];
      const card = document.createElement('div');
      card.className = 'history-deck-card';
      card.innerHTML = `
        <div class="history-thumb"><div class="history-bar" style="width:${Math.min(100, Number(item.percent) || 0)}%"></div></div>
        <div class="history-name">${escapeHtml(cleanMediaTitle(item.name))}</div>
        <div class="history-time-tag">${formatTime(item.time)} / ${formatTime(item.dur)} (${Number(item.percent) || 0}%)</div>
        <button class="pill-btn highlight mini" style="margin-top:6px;">Resume</button>
      `;
      card.querySelector('button').onclick = () => {
        inspectMediaAndPlay(item.name, k, resumeStartTime(item));
        navigateTo('player');
      };
      historyGrid.appendChild(card);
      attachThumb(card.querySelector('.history-thumb'), k, 'video', item.name);
    });
  } catch (e) {}
}

async function clearHistory() {
  if (!window.confirm('Clear all watch history?')) return;
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
  if (chapterLabel) chapterLabel.textContent = '';
  if (skipChapterBtn) skipChapterBtn.style.display = 'none';
  if (chaptersPanel) chaptersPanel.classList.remove('open');
  renderChapterMarks();
  renderChapterList();
}

function onChapterTick(t) {
  if (!chapters.length) return;
  const cur = chapterAt(t);
  const idx = cur ? chapters.indexOf(cur) : -1;
  if (idx === chapterIdx) return;
  chapterIdx = idx;
  if (chapterLabel) chapterLabel.textContent = cur ? cur.title : '';
  chaptersList.querySelectorAll('.chapter-row').forEach((r) => r.classList.toggle('current', Number(r.dataset.i) === idx));
  const hasNext = idx >= 0 && idx < chapters.length - 1;
  const skippable = cur && SKIPPABLE.test(cur.title);
  if (skipChapterBtn) {
    skipChapterBtn.style.display = hasNext ? '' : 'none';
    skipChapterText.textContent = skippable ? `Skip ${cur.title.length > 18 ? cur.title.slice(0, 16) + '…' : cur.title}` : 'Next chapter';
    skipChapterBtn.classList.toggle('highlight', !!skippable);
  }
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
if (skipChapterBtn) skipChapterBtn.onclick = (e) => { e.stopPropagation(); stepChapter(1); };
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
togglePlayPause = function () { if (internalPause) { endRebuffer(true); return; } _togglePlayPause(); };

/* Name tips: long-press (touch) or hover (mouse) on any [data-tip] button */
(function () {
  let timer = null, cur = null, hideT = null, justShown = null;
  const hide = () => { clearTimeout(hideT); if (cur) cur.classList.remove('tip-on'); cur = null; };
  const show = (b) => { hide(); b.classList.add('tip-on'); cur = b; hideT = setTimeout(hide, 1800); };
  document.addEventListener('pointerdown', (e) => {
    const b = e.target.closest && e.target.closest('[data-tip]');
    hide(); clearTimeout(timer);
    if (!b || e.pointerType === 'mouse') return;
    timer = setTimeout(() => { show(b); justShown = b; }, 420);
  }, true);
  ['pointerup', 'pointercancel', 'pointerleave', 'scroll'].forEach((ev) => document.addEventListener(ev, () => clearTimeout(timer), true));
  document.addEventListener('click', (e) => {          // the release of a long-press must not trigger the button
    const b = e.target.closest && e.target.closest('[data-tip]');
    if (b && b === justShown) { e.preventDefault(); e.stopPropagation(); }
    justShown = null;
  }, true);
  document.addEventListener('contextmenu', (e) => { if (e.target.closest && e.target.closest('[data-tip]')) e.preventDefault(); });
  document.addEventListener('mouseover', (e) => {
    const b = e.target.closest && e.target.closest('[data-tip]');
    clearTimeout(timer);
    if (!b) { hide(); return; }
    if (b === cur) return;
    timer = setTimeout(() => show(b), 450);
  });
})();

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
      seekToTargetSecond(absoluteTime());
    }
  } catch (e) {}
}, 2500);

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
async function loadThumb(job) {
  const { el, file, kind } = job;
  if (!el.isConnected) return;
  const key = `${kind}:${file}`;
  let url = thumbCache.get(key);
  if (!url) {
    try {
      const res = await fetch(`/api/thumb?file=${encodeURIComponent(file)}&kind=${kind}`);
      if (res.status === 200) {
        url = URL.createObjectURL(await res.blob());
        thumbCache.set(key, url);
      } else if (res.status === 204 && (job.tries = (job.tries || 0) + 1) <= 3) {
        setTimeout(() => { if (el.isConnected) { thumbQueue.push(job); pumpThumbs(); } }, 20000);
        return;
      }
    } catch (e) { return; }
  }
  if (url && el.isConnected) {
    el.style.backgroundImage = `url("${url}")`;
    el.classList.add('has-img');
  }
}
function attachThumb(el, file, kind, label) {
  if (!el) return;
  el.dataset.initial = (cleanMediaTitle(label || '').trim()[0] || '▶').toUpperCase();
  if (!prefs.thumbs || !file) return;
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
  bind('prefSeek', 'seekStep', true); bind('prefQuality', 'quality'); bind('prefBuffer', 'preBuffer', true);
  bind('prefAutoSkip', 'autoSkip'); bind('prefFsRotate', 'fsRotate'); bind('prefAutoNext', 'autoNext');
  bind('prefHw', 'hwEnc');
  bind('prefFsFill', 'fsFill'); $('prefFsFill').addEventListener('change', applyFill); applyFill();
  const th = $('prefThumbs');
  if (th) { th.checked = !!prefs.thumbs; th.onchange = () => { prefs.thumbs = th.checked; savePrefs(); renderDashboard(); renderHistory(); }; }
  $('prefSleep').onchange = (e) => setSleep(Number(e.target.value));
  $('prefQuality').addEventListener('change', () => {
    if (isTranscodingMode && activeVideoPath) { showToast('Applying quality...', 1500); seekToTargetSecond(absoluteTime()); }
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
  gen: $('aiGenBtn'), all: $('aiGenAllBtn'), cancel: $('aiCancelBtn'), lang: $('aiLang'), tr: $('aiTranslate'), files: $('aiFiles')
};
let aiMode = 'quick';
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
    + `&lang=${aiUi.lang.value}&translate=${aiUi.tr.checked ? 1 : 0}&mode=${aiMode}`;
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
    body: JSON.stringify({ file, audioTrack: activeAudioStreamIndex, lang: aiUi.lang.value, translate: aiUi.tr.checked, mode: aiMode, priority: !!priority, from: priority ? Math.floor(absoluteTime() || 0) : 0 })
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
[aiUi.lang, aiUi.tr].forEach((el) => el.addEventListener('change', () => { if (activeVideoPath) aiCheck(activeVideoPath, false); }));
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
  if (!key) { showToast('Episode not found in the library', 2500); return; }
  const ep = fullLibrary[key].find((e) => (e.relPath || e.fullPath) === relPath);
  currentPathTokens = key === 'Anime Root' ? [] : key.split(' / ');
  currentVideoList = fullLibrary[key];
  const h = historyCache[relPath];
  navigateTo('player');
  inspectMediaAndPlay(ep.name, relPath, h ? resumeStartTime(h) : 0);
}
function taskCard(t) {
  const live = t.canStop;
  const card = document.createElement('div');
  card.className = `task-card ${t.state}`;
  const pct = t.pct == null ? null : Math.max(0, Math.min(100, t.pct));
  const stateTxt = { queued: 'Waiting', transcribing: 'Running', extracting: 'Running', running: 'Running', paused: 'Paused', done: 'Finished', error: 'Failed', cancelled: 'Stopped' }[t.state] || t.state;
  card.innerHTML = `
    <div class="task-top">
      <span class="task-kind">${escapeHtml(t.label)}</span>
      <span class="task-state ${t.state}">${stateTxt}${pct != null && live ? ` \u00b7 ${Math.round(pct)}%` : ''}</span>
    </div>
    <div class="task-title"></div>
    <div class="task-bar ${pct == null && live ? 'indeterminate' : ''}"><i style="width:${pct == null ? (live ? 40 : 0) : pct}%"></i></div>
    <div class="task-detail"></div>
    <div class="task-live"></div>
    <div class="task-btns"></div>`;
  card.querySelector('.task-title').textContent = cleanMediaTitle(t.title || t.file || '');
  card.querySelector('.task-detail').textContent = [t.detail, t.meta, t.elapsed ? `${fmtMin(t.elapsed)} elapsed` : ''].filter(Boolean).join('  \u00b7  ');
  const liveEl = card.querySelector('.task-live');
  if (t.state === 'error' && t.msg) { liveEl.textContent = t.msg; liveEl.classList.add('err'); }
  else if (t.last && live) liveEl.textContent = `\u201c${t.last}\u201d`;
  const btns = card.querySelector('.task-btns');
  const mk = (txt, cls, fn) => { const b = document.createElement('button'); b.className = `pill-btn ${cls || ''}`; b.textContent = txt; b.onclick = fn; btns.appendChild(b); };
  if (live) mk('Stop', 'danger', async () => { await fetch('/api/tasks/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: t.id }) }); refreshTasks(); });
  if (t.type === 'ai' && t.file) {
    mk('Open episode', '', () => openByPath(t.file));
    if (t.state === 'error' || t.state === 'cancelled') mk('Retry', 'highlight', async () => {
      await fetch('/api/ai/subs', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ file: t.file, ...t.opts, priority: true }) });
      refreshTasks();
    });
  }
  return card;
}
function renderTasks() {
  const live = tasksData.filter((t) => t.canStop), rest = tasksData.filter((t) => !t.canStop);
  $('tasksSummary').textContent = live.length ? `${live.length} running or waiting` : (rest.length ? 'Nothing running' : 'No tasks yet');
  $('btnTasksStopAll').disabled = !live.length;
  $('btnTasksClear').disabled = !rest.length;
  tasksList.textContent = '';
  if (!tasksData.length) {
    const e = document.createElement('div'); e.className = 'empty-hint';
    e.textContent = 'Subtitle generation, live video conversion and thumbnail jobs appear here.';
    tasksList.appendChild(e); return;
  }
  [...live, ...rest].forEach((t) => tasksList.appendChild(taskCard(t)));
}
function updateTaskBadge(n) {
  const b = $('taskBadge'); if (!b) return;
  b.textContent = n; b.style.display = n ? '' : 'none';
}
async function refreshTasks() {
  try {
    const d = await (await fetch('/api/tasks')).json();
    tasksData = d.tasks || [];
    updateTaskBadge(d.activeCount || 0);
    if (currentView === 'tasks') renderTasks();
  } catch (e) {}
}
$('btnTasksStopAll').onclick = async () => {
  if (!window.confirm('Stop all running tasks?')) return;
  await fetch('/api/tasks/stop', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'all' }) });
  refreshTasks();
};
$('btnTasksClear').onclick = async () => { await fetch('/api/tasks/clear', { method: 'POST' }); refreshTasks(); };
setInterval(() => { if (!document.hidden) refreshTasks(); }, 2000);   // light JSON call; also keeps the drawer badge current
refreshTasks();

/* Every control in the settings panel is saved (debounced) so nothing is lost on reload */
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
    if (rng.parentElement.classList.contains('rng-wrap')) return;
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
