'use strict';

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

const skipIntroBtn = $('skipIntroBtn');
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
const SKIP_INTRO_SECONDS = 85;

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
  const host = document.fullscreenElement || document.body;
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

function cleanMediaTitle(fileName) {
  if (!fileName) return 'Unknown Title';
  const base = String(fileName).replace(/\.(mp4|mkv|webm|avi|mov|ts|m4v)$/i, '');
  const cleaned = base
    .replace(/\[.*?\]|\(.*?\)/g, '')
    .replace(/(\.1080p|\.720p|\.480p|1080p|720p|480p|AMZN|WEB-DL|AAC|H264|H\.264|x264|HEVC|x265|Multi\.Audio|Multimovies).*/i, '')
    .replace(/[\._\-]+/g, ' ')
    .trim();
  // Never end up with an empty title (e.g. "[Group] 1080p.mkv")
  return cleaned || base.replace(/[\._\-]+/g, ' ').trim() || 'Unknown Title';
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
document.addEventListener('visibilitychange', () => { if (document.hidden) triggerAutoPause(); });
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

function hideSubtitle() {
  activeSubSignature = '';
  subDisplayBox.style.display = 'none';
  subDisplayBox.innerHTML = '';
}

let activeSubSignature = '';
let lastSubCheck = 0;

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

  for (let i = 0; i < cues.length; i++) {
    const cue = cues[i];
    if (cue.startTime > t || cue.endTime <= t) continue;
    const raw = cue.text || '';
    if (raw.includes('<position:top>')) {
      topText += formatCueText(raw.replace(/<position:top>/g, '')) + '<br>';
    } else {
      bottomText += formatCueText(raw) + '<br>';
    }
  }

  const signature = `${topText ? 'T' : 'B'}|${topText || bottomText}`;
  if (signature === activeSubSignature) return;

  if (!topText && !bottomText) {
    hideSubtitle();
    return;
  }

  activeSubSignature = signature;
  if (topText) {
    subDisplayBox.style.bottom = 'auto';
    subDisplayBox.style.top = '10%';
    subDisplayBox.innerHTML = topText;
  } else {
    subDisplayBox.style.top = 'auto';
    subDisplayBox.style.bottom = '52px';
    subDisplayBox.innerHTML = bottomText;
  }
  subDisplayBox.style.display = 'inline-block';
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
    saveCurrentSettings();
  };
  subTrackList.appendChild(offRow);

  let autoChoose = null;
  tracks.forEach((s) => {
    const row = document.createElement('div');
    row.className = 'opt-row';
    row.textContent = `${s.title} (${String(s.codec || '').toUpperCase()})`;

    const choose = (silent) => {
      selectOptRow(subTrackList, row);
      preferredSubLang = s.lang && s.lang !== 'und' ? s.lang : '';
      saveCurrentSettings();
      if (!silent) showToast('Loading subtitle…', 1500);
      selectSubtitleUrl(`/api/subs/stream?file=${encodeURIComponent(relPath)}&trackIndex=${s.streamIndex}`);
    };
    row.onclick = () => choose(false);
    subTrackList.appendChild(row);

    // Keep the subtitle language chosen on the previous episode.
    if (!autoChoose && preferredSubLang && s.lang === preferredSubLang) autoChoose = choose;
  });

  if (autoChoose) autoChoose(true);
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
    };
    subTrackList.appendChild(row);
  }
  selectOptRow(subTrackList, row);
  selectSubtitleUrl(url);
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
    document.querySelectorAll('[data-filter]').forEach((b) => b.classList.remove('active'));
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

/* ------------------------------------------------------------------ */
/* Touch gestures                                                      */
/* ------------------------------------------------------------------ */
const tapTracker = { left: 0, center: 0, right: 0 };
function triggerRipple(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('trigger');
  void el.offsetWidth;
  el.classList.add('trigger');
  setTimeout(() => el.classList.remove('trigger'), 300);
}

function togglePlayPause() {
  if (video.paused) {
    initWebAudio();
    notifyStreamResume();
    video.play().catch(() => {});
  } else {
    video.pause();
    notifyStreamPause();
  }
}

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
      seekToTargetSecond(Math.max(0, curTime - 10));
      triggerRipple('rippleLeft');
    } else if (side === 'right') {
      seekToTargetSecond(Math.min(dur - 2, curTime + 10));
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
    + `&startTime=${sec}&is10Bit=${isCurrentFile10Bit ? '1' : '0'}`;
}

function updateStreamBadges() {
  if (isTranscodingMode) {
    streamModeBadge.textContent = compatMode ? 'Compat Transcode' : (isCurrentFile10Bit ? '10-Bit Transcode' : 'Direct Audio Pipe');
    if (sourceModePill) sourceModePill.textContent = 'Transcode Stream';
  } else {
    streamModeBadge.textContent = 'Native Direct (8-Bit)';
    if (sourceModePill) sourceModePill.textContent = 'Native Stream';
  }
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
  set('seekbackward', () => seekToTargetSecond(Math.max(0, absoluteTime() - 10)));
  set('seekforward', () => seekToTargetSecond(absoluteTime() + 10));
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
  const token = ++playToken;
  seekTime = Number(seekTime) > 0 ? Number(seekTime) : 0;

  // Fresh state for the new file (nothing may leak over from the previous episode).
  activeVideoPath = relPath;
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
    video.src = transcodeUrl(seekTime);
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
    video.play().catch(() => { manualCenterPlay.style.display = 'flex'; });
    resetHideTimer();
  };
}

/* ------------------------------------------------------------------ */
/* <video> events                                                      */
/* ------------------------------------------------------------------ */
video.addEventListener('canplay', () => { playerBufferingIndicator.classList.remove('show'); });
video.addEventListener('waiting', () => {
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
  playerBufferingIndicator.classList.remove('show');
  manualCenterPlay.style.display = 'none';
  updatePlayButtonIcon(true);
});
video.addEventListener('pause', () => {
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
  playAdjacentEpisode(1, true); // auto-play next episode
});

video.addEventListener('error', () => {
  if (!activeVideoPath || !video.getAttribute('src')) return;
  playerBufferingIndicator.classList.remove('show');

  // The browser could not play the file natively (HEVC, odd codecs, ...): retry once through the transcoder.
  if (!isTranscodingMode && !nativeFallbackTried) {
    nativeFallbackTried = true;
    compatMode = true;
    isCurrentFile10Bit = true; // forces full video transcode to H.264
    showToast('Format not supported natively — switching to compatibility transcode', 4000);
    startTranscodeAt(video.currentTime || 0);
    return;
  }
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
async function toggleFullscreen() {
  if (isScreenLocked) return;
  if (!document.fullscreenElement) {
    await playerWrapper.requestFullscreen().catch(() => {});
    if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
  } else {
    await document.exitFullscreen().catch(() => {});
  }
}
fsBtn.onclick = toggleFullscreen;

// Also covers leaving fullscreen with the system back gesture.
document.addEventListener('fullscreenchange', () => {
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
function setSubDelay(sec, announce = false) {
  subDelay = clamp(Math.round((Number(sec) || 0) * 10) / 10, -10, 10);
  if (rngSubDelay) rngSubDelay.value = subDelay;
  const lbl = $('lblSubDelay');
  if (lbl) lbl.textContent = `${subDelay > 0 ? '+' : ''}${subDelay.toFixed(1)}s`;
  activeSubSignature = '\u0000';
  updateSubtitleDisplay();
  if (announce) showToast(`Subtitle delay ${subDelay > 0 ? '+' : ''}${subDelay.toFixed(1)}s`, 1200);
}
if (rngSubDelay) rngSubDelay.addEventListener('input', (e) => setSubDelay(e.target.value));

/* ---- Skip intro ---- */
function skipIntro() {
  const dur = getDuration() || 99999;
  seekToTargetSecond(Math.min(dur - 2, absoluteTime() + SKIP_INTRO_SECONDS));
  showToast(`Skipped ${SKIP_INTRO_SECONDS}s`, 1200);
}
if (skipIntroBtn) {
  skipIntroBtn.onclick = (e) => { e.stopPropagation(); if (!isScreenLocked) skipIntro(); };
}
volBtn.onclick = () => {
  if (isScreenLocked) return;
  toggleMute();
};

rwBtn.onclick = () => {
  if (isScreenLocked) return;
  seekToTargetSecond(Math.max(0, absoluteTime() - 10));
};
ffBtn.onclick = () => {
  if (isScreenLocked) return;
  const dur = getDuration() || 99999;
  seekToTargetSecond(Math.min(dur - 2, absoluteTime() + 10));
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
      if (settingsModal.classList.contains('open') || playerEpisodesDrawer.classList.contains('open')) return;
      topOverlay.classList.add('hidden');
      bottomOverlay.classList.add('hidden');
    }, 5000);
  }
}

// Touch taps on the video are handled by the tap zones (show/hide toggle). If the wrapper also
// revealed the controls on touchstart, the zone's single-tap toggle would instantly hide them again.
playerWrapper.addEventListener('pointermove', (e) => { if (e.pointerType === 'mouse') resetHideTimer(); });
[topOverlay, bottomOverlay, settingsModal, playerEpisodesDrawer].forEach((el) => {
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
    case 'J': seekToTargetSecond(Math.max(0, absoluteTime() - 10)); break;
    case 'ArrowRight':
    case 'l':
    case 'L': seekToTargetSecond(Math.min((getDuration() || 99999) - 2, absoluteTime() + 10)); break;
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
    case 's':
    case 'S': skipIntro(); break;
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
function navigateTo(hash) {
  let target = String(hash || '').replace(/^#/, '') || 'home';
  if (!$(`view-${target}`)) target = 'home';
  if (target !== 'player') triggerAutoPause();

  currentView = target;
  if (window.location.hash !== `#${target}`) window.location.hash = target;
  document.querySelectorAll('.page-view').forEach((p) => p.classList.remove('active'));
  document.querySelectorAll('.drawer-item').forEach((d) => d.classList.remove('active'));

  const view = $(`view-${target}`);
  const nav = document.querySelector(`.drawer-item[data-hash="${target}"]`);
  if (view) view.classList.add('active');
  if (nav) nav.classList.add('active');
  $('sideDrawer').classList.remove('open');
  $('menuOverlay').classList.remove('open');

  if (target === 'home') { renderDashboard(homeQuickSearch ? homeQuickSearch.value.trim() : ''); renderHistory(); }
  if (target === 'player') renderInlinePlaylist();
  if (target === 'library') exploreFolder(currentBrowsingDir || '/sdcard');
}
window.addEventListener('hashchange', () => {
  const t = (window.location.hash || '').replace(/^#/, '') || 'home';
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
// Seamless session restore on reload (runs once, never when the library is merely reloaded)
function restoreSessionState() {
  if (sessionRestoreDone) return;
  sessionRestoreDone = true;
  const raw = lsGet('astra_active_playback_state');
  if (!raw) return;
  try {
    const s = JSON.parse(raw);
    if (!s || !s.relPath) return;
    currentPathTokens = s.folderTokens || [];

    navigateTo('player');
    inspectMediaAndPlay(s.title || 'Episode', s.relPath, s.time || 0);
  } catch (e) {}
}

async function loadLibrary(refresh = false) {
  try {
    const res = await fetch(`/api/library${refresh ? '?refresh=1' : ''}`);
    const data = await res.json();
    fullLibrary = data.library || {};
    libraryRoot = data.root || '';
    renderDashboard();
    renderHistory();
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
        <div class="history-name">${escapeHtml(cleanMediaTitle(item.name))}</div>
        <div class="history-time-tag">${formatTime(item.time)} / ${formatTime(item.dur)} (${Number(item.percent) || 0}%)</div>
        <button class="pill-btn highlight mini" style="margin-top:6px;">Resume</button>
      `;
      card.querySelector('button').onclick = () => {
        inspectMediaAndPlay(item.name, k, resumeStartTime(item));
        navigateTo('player');
      };
      historyGrid.appendChild(card);
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
/* Boot                                                                */
/* ------------------------------------------------------------------ */
loadSavedSettings();
loadLibrary(true);
if (!lsGet('astra_active_playback_state')) {
  navigateTo(window.location.hash || 'home');
}
