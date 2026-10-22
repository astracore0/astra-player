const $ = (id) => document.getElementById(id);

const video = $('videoElement');
const embedFrame = $('embedFrame');
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
const lockIndicatorBtn = $('lockIndicatorBtn');
const playerCurrentTitle = $('playerCurrentTitle');
const playerCurrentFolder = $('playerCurrentFolder');
const playerResBadge = $('playerResBadge');
const playerDurationBadge = $('playerDurationBadge');
const settingsBtn = $('settingsBtn');
const settingsModal = $('settingsModal');
const autoplayCheckbox = $('autoplayCheckbox');
const manualCenterPlay = $('manualCenterPlay');
const bigPlayBtn = $('bigPlayBtn');
const mainTrack = $('mainTrack');
const sourceModePill = $('sourceModePill');

const playerEpisodesDrawer = $('playerEpisodesDrawer');
const floatingEpisodesBtn = $('floatingEpisodesBtn');
const closeEpisodesDrawerBtn = $('closeEpisodesDrawerBtn');
const episodesDrawerList = $('episodesDrawerList');
const epDrawerFolderName = $('epDrawerFolderName');
const playerInlinePlaylist = $('playerInlinePlaylist');
const playerShelfTitle = $('playerShelfTitle');

const heroBanner = $('heroBanner');
const heroTitle = $('heroTitle');
const heroSynopsis = $('heroSynopsis');
const heroProgressPill = $('heroProgressPill');
const heroResumeBtn = $('heroResumeBtn');
const heroResumeLabel = $('heroResumeLabel');
const seriesCardsGrid = $('seriesCardsGrid');
const historyGrid = $('historyGrid');
const statSeriesCount = $('statSeriesCount');
const statEpCount = $('statEpCount');
const statPlatformMode = $('statPlatformMode');
const homeQuickSearch = $('homeQuickSearch');
const clearSearchBtn = $('clearSearchBtn');

const btnUploadFiles = $('btnUploadFiles');
const btnUploadFolder = $('btnUploadFolder');
const btnUploadSubtitle = $('btnUploadSubtitle');
const localVideoPicker = $('localVideoPicker');
const localFolderPicker = $('localFolderPicker');
const localSubPicker = $('localSubPicker');

const confirmModal = $('confirmModal');
const confirmModalCancelBtn = $('confirmModalCancelBtn');
const confirmModalOkBtn = $('confirmModalOkBtn');
const openClearHistoryModalBtn = $('openClearHistoryModalBtn');

const isDesktop = !('ontouchstart' in window || navigator.maxTouchPoints > 0);
if (statPlatformMode) statPlatformMode.textContent = isDesktop ? 'PC Desktop' : 'Mobile Touch';

let fullLibrary = {};
let currentPathTokens = [];
let currentVideoList = [];
let activeVideoPath = '';
let historyCache = {};
let lastSavedTime = 0;
let currentSubProvider = 'animetosho';

let audioCtx = null;
let audioSource = null;
let gainNode = null;
let liveDiagTimer = null;

function initAudioBooster() {
  if (!audioCtx) {
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    audioCtx = new AudioContext();
    audioSource = audioCtx.createMediaElementSource(video);
    gainNode = audioCtx.createGain();
    audioSource.connect(gainNode);
    gainNode.connect(audioCtx.destination);
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

const sideDrawer = $('sideDrawer');
const menuOverlay = $('menuOverlay');
const openDrawerBtn = $('openDrawerBtn');
const closeDrawerBtn = $('closeDrawerBtn');

function toggleDrawer(open) {
  if (sideDrawer) sideDrawer.classList.toggle('open', open);
  if (menuOverlay) menuOverlay.classList.toggle('open', open);
}

if (openDrawerBtn) openDrawerBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleDrawer(true); });
if (closeDrawerBtn) closeDrawerBtn.addEventListener('click', (e) => { e.stopPropagation(); toggleDrawer(false); });
if (menuOverlay) menuOverlay.addEventListener('click', () => toggleDrawer(false));

function pauseIfLeavingPlayer(targetHash) {
  if (targetHash !== 'player' && video && !video.paused) {
    if (activeVideoPath) {
      syncHistoryToServer(activeVideoPath, playerCurrentTitle ? playerCurrentTitle.textContent : '', video.currentTime, video.duration);
    }
    video.pause();
  }
}

document.addEventListener('visibilitychange', () => {
  if (document.hidden && video && !video.paused) {
    if (activeVideoPath) {
      syncHistoryToServer(activeVideoPath, playerCurrentTitle ? playerCurrentTitle.textContent : '', video.currentTime, video.duration);
    }
    video.pause();
  }
});

function startLiveDiagnostics() {
  stopLiveDiagnostics();
  loadSettingsDiagnostics();
  liveDiagTimer = setInterval(loadSettingsDiagnostics, 2000);
}

function stopLiveDiagnostics() {
  if (liveDiagTimer) {
    clearInterval(liveDiagTimer);
    liveDiagTimer = null;
  }
}

function navigateToHash(hash) {
  let targetHash = hash.replace(/^#/, '') || 'home';

  if (targetHash === 'player' && !activeVideoPath && (!video || !video.src)) {
    const lastSession = localStorage.getItem('astra_last_active_session');
    if (lastSession) {
      try {
        const parsed = JSON.parse(lastSession);
        if (parsed.relPath && parsed.name) {
          resumeEpisode(parsed.relPath, { name: parsed.name, time: parsed.time || 0 });
          return;
        }
      } catch (e) {}
    }
    window.location.hash = 'home';
    targetHash = 'home';
  }

  window.location.hash = targetHash;
  pauseIfLeavingPlayer(targetHash);

  document.querySelectorAll('.page-view').forEach(p => p.classList.remove('active'));
  document.querySelectorAll('.drawer-item').forEach(d => d.classList.remove('active'));

  const viewEl = document.getElementById(`view-${targetHash}`);
  const navItem = document.querySelector(`.drawer-item[data-hash="${targetHash}"]`);

  if (viewEl) viewEl.classList.add('active');
  if (navItem) navItem.classList.add('active');

  toggleDrawer(false);

  if (targetHash === 'settings') {
    startLiveDiagnostics();
  } else {
    stopLiveDiagnostics();
  }

  if (targetHash === 'home') renderDashboard();
  if (targetHash === 'library') renderFolderLevel();
  if (targetHash === 'search') loadLocalSubtitles();
  if (targetHash === 'stream') renderStreamPage();
}

window.addEventListener('hashchange', () => navigateToHash(window.location.hash));
document.querySelectorAll('.drawer-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.stopPropagation();
    navigateToHash(item.dataset.hash);
  });
});

function formatTime(sec) {
  if (isNaN(sec) || sec <= 0) return '0:00';
  const m = Math.floor(sec / 60);
  const s = Math.floor(sec % 60).toString().padStart(2, '0');
  if (m >= 60) {
    const h = Math.floor(m / 60);
    const rm = (m % 60).toString().padStart(2, '0');
    return `${h}:${rm}:${s}`;
  }
  return `${m}:${s}`;
}

let controlsHideTimer = null;

function resetControlsHideTimer() {
  if (topOverlay) topOverlay.classList.remove('hidden');
  if (bottomOverlay) bottomOverlay.classList.remove('hidden');

  clearTimeout(controlsHideTimer);
  if (video && !video.paused) {
    controlsHideTimer = setTimeout(() => {
      if (settingsModal && settingsModal.classList.contains('open')) return;
      if (playerEpisodesDrawer && playerEpisodesDrawer.classList.contains('open')) return;
      if (topOverlay) topOverlay.classList.add('hidden');
      if (bottomOverlay) bottomOverlay.classList.add('hidden');
    }, 5000);
  }
}

['mousemove', 'touchstart', 'click', 'keydown'].forEach(evt => {
  if (playerWrapper) {
    playerWrapper.addEventListener(evt, () => {
      if (!topOverlay.classList.contains('hidden')) {
        resetControlsHideTimer();
      }
    }, { passive: true });
  }
});

if (btnUploadFiles) btnUploadFiles.addEventListener('click', () => localVideoPicker.click());
if (btnUploadFolder) btnUploadFolder.addEventListener('click', () => localFolderPicker.click());
if (btnUploadSubtitle) btnUploadSubtitle.addEventListener('click', () => localSubPicker.click());

function handleDirectFiles(files) {
  const list = Array.from(files).filter(f => f.type.startsWith('video/') || /\.(mp4|mkv|webm|avi|mov)$/i.test(f.name));
  if (list.length === 0) return;

  currentVideoList = list.map(f => ({
    name: f.name,
    relPath: f.name,
    size: (f.size / (1024 * 1024)).toFixed(1) + ' MB',
    blobUrl: URL.createObjectURL(f)
  }));

  if (sourceModePill) sourceModePill.textContent = 'Local File';
  currentPathTokens = ['Direct Loaded'];
  renderFloatingEpisodesList();
  renderInlinePlayerPlaylist();
  startPlayback(currentVideoList[0].name, currentVideoList[0].relPath, 0, currentVideoList[0].blobUrl);
  navigateToHash('player');
}

if (localVideoPicker) localVideoPicker.addEventListener('change', (e) => handleDirectFiles(e.target.files));
if (localFolderPicker) localFolderPicker.addEventListener('change', (e) => handleDirectFiles(e.target.files));
if (localSubPicker) {
  localSubPicker.addEventListener('change', (e) => {
    if (e.target.files && e.target.files.length > 0) attachSubtitleBlob(e.target.files[0]);
  });
}

function attachSubtitleBlob(file) {
  if (!mainTrack) return;
  mainTrack.src = URL.createObjectURL(file);
  mainTrack.mode = 'showing';
  if ($('activeSubName'))$('activeSubName').textContent = file.name;
}

const btnAttachLocalSubDirect = $('btnAttachLocalSubDirect');
if (btnAttachLocalSubDirect) btnAttachLocalSubDirect.onclick = () => localSubPicker.click();

if (floatingEpisodesBtn) {
  floatingEpisodesBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (settingsModal) settingsModal.classList.remove('open');
    renderFloatingEpisodesList();
    if (playerEpisodesDrawer) playerEpisodesDrawer.classList.toggle('open');
    resetControlsHideTimer();
  });
}

if (closeEpisodesDrawerBtn) {
  closeEpisodesDrawerBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (playerEpisodesDrawer) playerEpisodesDrawer.classList.remove('open');
    resetControlsHideTimer();
  });
}

function renderFloatingEpisodesList() {
  if (!episodesDrawerList) return;
  episodesDrawerList.innerHTML = '';

  if (currentVideoList.length === 0 && activeVideoPath) {
    for (const f in fullLibrary) {
      if (fullLibrary[f].some(e => e.relPath === activeVideoPath)) {
        currentVideoList = fullLibrary[f];
        currentPathTokens = f.split(' / ');
        break;
      }
    }
  }

  if (epDrawerFolderName) epDrawerFolderName.textContent = currentPathTokens.join(' / ') || 'Queue';

  if (currentVideoList.length === 0) {
    episodesDrawerList.innerHTML = '<div class="loading-state">No episodes loaded. Select from storage!</div>';
    return;
  }

  currentVideoList.forEach(fileObj => {
    const row = document.createElement('div');
    const isPlaying = fileObj.relPath === activeVideoPath;
    row.className = `drawer-ep-row ${isPlaying ? 'active' : ''}`;
    
    const saved = historyCache[fileObj.relPath];
    const watchHint = saved ? ` • ${formatTime(saved.time)} / ${formatTime(saved.dur)} (${saved.percent}%)` : '';

    row.innerHTML = `
      <div>
        <div class="drawer-ep-title">${fileObj.name}</div>
        <div class="drawer-ep-sub">${fileObj.size || ''}${watchHint}</div>
      </div>
      <span class="row-badge">${isPlaying ? 'Playing' : 'Play'}</span>
    `;

    row.addEventListener('click', () => {
      startPlayback(fileObj.name, fileObj.relPath, saved ? saved.time : 0, fileObj.blobUrl);
      if (playerEpisodesDrawer) playerEpisodesDrawer.classList.remove('open');
    });
    episodesDrawerList.appendChild(row);
  });
}

function renderInlinePlayerPlaylist() {
  if (!playerInlinePlaylist) return;
  playerInlinePlaylist.innerHTML = '';
  if (playerShelfTitle) playerShelfTitle.textContent = currentPathTokens.join(' / ') || 'Active Queue';

  if (currentVideoList.length === 0) {
    playerInlinePlaylist.innerHTML = '<div class="empty-hint">Load a video or select an anime to view playlist</div>';
    return;
  }

  currentVideoList.forEach(fileObj => {
    const row = document.createElement('div');
    const isPlaying = fileObj.relPath === activeVideoPath;
    row.className = 'explorer-row';
    const saved = historyCache[fileObj.relPath];
    const watchHint = saved ? ` • ${formatTime(saved.time)} (${saved.percent}%)` : '';

    row.innerHTML = `
      <div class="row-left">
        <div class="deck-play-icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor"><polygon points="6 4 20 12 6 20 6 4"/></svg>
        </div>
        <div>
          <div class="row-title">${fileObj.name}</div>
          <div class="row-sub">${fileObj.size || ''}${watchHint}</div>
        </div>
      </div>
      <span class="row-badge">${isPlaying ? 'Playing' : 'Play'}</span>
    `;
    row.addEventListener('click', () => {
      startPlayback(fileObj.name, fileObj.relPath, saved ? saved.time : 0, fileObj.blobUrl);
    });
    playerInlinePlaylist.appendChild(row);
  });
}

let tapTracker = { left: 0, center: 0, right: 0 };
function triggerRipple(id) {
  const el = $(id);
  if (!el) return;
  el.classList.remove('trigger');
  void el.offsetWidth;
  el.classList.add('trigger');
  setTimeout(() => el.classList.remove('trigger'), 250);
}

function handleTap(side) {
  if (!video || !playerWrapper) return;
  if (playerWrapper.classList.contains('is-locked') || playerWrapper.classList.contains('is-embed')) return;
  const now = Date.now();

  if (now - tapTracker[side] < 280) {
    if (side === 'left') {
      video.currentTime = Math.max(0, video.currentTime - 10);
      triggerRipple('rippleLeft');
    } else if (side === 'right') {
      video.currentTime = Math.min(video.duration, video.currentTime + 10);
      triggerRipple('rippleRight');
    } else if (side === 'center') {
      const centerIcon = $('centerWaveIcon');
      if (video.paused) {
        video.play();
        if (centerIcon) centerIcon.innerHTML = '<polygon points="6 4 20 12 6 20 6 4"/>';
      } else {
        video.pause();
        if (centerIcon) centerIcon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
      }
      triggerRipple('rippleCenter');
    }
    resetControlsHideTimer();
    tapTracker[side] = 0;
  } else {
    tapTracker[side] = now;
    setTimeout(() => {
      if (Date.now() - tapTracker[side] >= 270 && tapTracker[side] !== 0) {
        const isHidden = topOverlay.classList.contains('hidden');
        if (isHidden) {
          resetControlsHideTimer();
        } else {
          topOverlay.classList.add('hidden');
          bottomOverlay.classList.add('hidden');
          clearTimeout(controlsHideTimer);
        }
      }
    }, 280);
  }
}

if ($('touchLeft')) $('touchLeft').addEventListener('click', (e) => { e.stopPropagation(); handleTap('left'); });
if ($('touchCenter')) $('touchCenter').addEventListener('click', (e) => { e.stopPropagation(); handleTap('center'); });
if ($('touchRight')) $('touchRight').addEventListener('click', (e) => { e.stopPropagation(); handleTap('right'); });

if (lockBtn) {
  lockBtn.addEventListener('click', (e) => { 
    e.stopPropagation(); 
    if (playerEpisodesDrawer) playerEpisodesDrawer.classList.remove('open');
    if (playerWrapper) playerWrapper.classList.add('is-locked'); 
  });
}
if (lockIndicatorBtn) {
  lockIndicatorBtn.addEventListener('click', (e) => { 
    e.stopPropagation(); 
    if (playerWrapper) playerWrapper.classList.remove('is-locked'); 
    resetControlsHideTimer();
  });
}

async function toggleFullScreen() {
  if (!playerWrapper) return;
  if (!document.fullscreenElement) {
    try {
      if (playerWrapper.requestFullscreen) await playerWrapper.requestFullscreen();
      else if (playerWrapper.webkitRequestFullscreen) await playerWrapper.webkitRequestFullscreen();
      if (screen.orientation && screen.orientation.lock) screen.orientation.lock('landscape').catch(() => {});
    } catch (e) {}
  } else {
    if (document.exitFullscreen) await document.exitFullscreen();
    if (screen.orientation && screen.orientation.unlock) screen.orientation.unlock();
  }
  resetControlsHideTimer();
}
if (fsBtn) fsBtn.addEventListener('click', toggleFullScreen);

function updatePlayIcon(isPlaying) {
  if (!playIconSvg) return;
  if (isPlaying) {
    playIconSvg.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
  } else {
    playIconSvg.innerHTML = '<polygon points="6 4 20 12 6 20 6 4"/>';
  }
}

if (playBtn) {
  playBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!video || !video.src) return;
    initAudioBooster();
    if (video.paused) video.play(); else video.pause();
    resetControlsHideTimer();
  });
}

if (video) {
  video.addEventListener('play', () => {
    if (manualCenterPlay) manualCenterPlay.style.display = 'none';
    updatePlayIcon(true);
    resetControlsHideTimer();
  });
  video.addEventListener('pause', () => {
    updatePlayIcon(false);
    resetControlsHideTimer();
  });
  video.addEventListener('ended', () => {
    syncHistoryToServer(activeVideoPath, playerCurrentTitle ? playerCurrentTitle.textContent : '', video.duration, video.duration);
    const canAuto = autoplayCheckbox ? autoplayCheckbox.checked : true;
    if (canAuto && currentVideoList.length > 0) {
      const idx = currentVideoList.findIndex(f => f.relPath === activeVideoPath);
      if (idx !== -1 && idx + 1 < currentVideoList.length) {
        const nextEp = currentVideoList[idx + 1];
        startPlayback(nextEp.name, nextEp.relPath, 0, nextEp.blobUrl);
      }
    } else {
      if (manualCenterPlay) manualCenterPlay.style.display = 'flex';
      updatePlayIcon(false);
    }
  });
}

if (rwBtn) rwBtn.addEventListener('click', (e) => { e.stopPropagation(); if (video) video.currentTime = Math.max(0, video.currentTime - 10); resetControlsHideTimer(); });
if (ffBtn) ffBtn.addEventListener('click', (e) => { e.stopPropagation(); if (video) video.currentTime = Math.min(video.duration, video.currentTime + 10); resetControlsHideTimer(); });

if (volBtn) {
  volBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!video) return;
    video.muted = !video.muted;
    if (volIconSvg) {
      volIconSvg.innerHTML = video.muted
        ? '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><line x1="23" y1="9" x2="17" y2="15"/><line x1="17" y1="9" x2="23" y2="15"/>'
        : '<polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14M15.54 8.46a5 5 0 0 1 0 7.07"/>';
    }
    resetControlsHideTimer();
  });
}

if (bigPlayBtn) {
  bigPlayBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    initAudioBooster();
    if (manualCenterPlay) manualCenterPlay.style.display = 'none';
    if (video) video.play();
  });
}

if (settingsBtn) {
  settingsBtn.addEventListener('click', (e) => {
    e.stopPropagation();
    if (playerEpisodesDrawer) playerEpisodesDrawer.classList.remove('open');
    if (settingsModal) settingsModal.classList.toggle('open');
    resetControlsHideTimer();
  });
}

document.querySelectorAll('.modal-tabs .tab-btn').forEach(btn => {
  btn.addEventListener('click', (e) => {
    e.stopPropagation();
    document.querySelectorAll('.modal-tabs .tab-btn').forEach(b => b.classList.remove('active'));
    document.querySelectorAll('.tab-body').forEach(b => b.classList.remove('show'));
    btn.classList.add('active');
    const target = $(btn.dataset.target);
    if (target) target.classList.add('show');
    resetControlsHideTimer();
  });
});

document.querySelectorAll('#tabAspect .opt-row').forEach(row => {
  row.addEventListener('click', (e) => {
    e.stopPropagation();
    if (video) video.className = row.dataset.aspect;
    document.querySelectorAll('#tabAspect .opt-row').forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
    if (settingsModal) settingsModal.classList.remove('open');
  });
});

document.querySelectorAll('#tabSpeed .opt-row').forEach(row => {
  row.addEventListener('click', (e) => {
    e.stopPropagation();
    if (video) video.playbackRate = parseFloat(row.dataset.speed);
    document.querySelectorAll('#tabSpeed .opt-row').forEach(r => r.classList.remove('selected'));
    row.classList.add('selected');
    if (settingsModal) settingsModal.classList.remove('open');
  });
});

document.querySelectorAll('#tabAudio .chip-preset').forEach(chip => {
  chip.addEventListener('click', (e) => {
    e.stopPropagation();
    initAudioBooster();
    document.querySelectorAll('#tabAudio .chip-preset').forEach(c => c.classList.remove('active'));
    chip.classList.add('active');
    const boost = parseFloat(chip.dataset.boost || 1.0);
    if (gainNode) gainNode.gain.value = boost;
  });
});

const rB = $('rngBright'), rC = $('rngContrast'), rS = $('rngSat');
function updateFilters() {
  if (!video || !rB || !rC || !rS) return;
  video.style.filter = `brightness(${rB.value}%) contrast(${rC.value}%) saturate(${rS.value}%)`;
  if ($('lblBright')) $('lblBright').textContent = `${rB.value}%`;
  if ($('lblContrast')) $('lblContrast').textContent = `${rC.value}%`;
  if ($('lblSat')) $('lblSat').textContent = `${rS.value}%`;
}
[rB, rC, rS].forEach(inp => { if (inp) inp.addEventListener('input', updateFilters); });
if ($('pReset')) $('pReset').onclick = () => { if (rB&&rC&&rS) { rB.value = 100; rC.value = 100; rS.value = 100; updateFilters(); } };
if ($('pAnimeVivid')) $('pAnimeVivid').onclick = () => { if (rB&&rC&&rS) { rB.value = 108; rC.value = 118; rS.value = 145; updateFilters(); } };
if ($('pDarkHDR')) $('pDarkHDR').onclick = () => { if (rB&&rC&&rS) { rB.value = 125; rC.value = 112; rS.value = 110; updateFilters(); } };
if ($('pCrimsonShift')) $('pCrimsonShift').onclick = () => { if (rB&&rC&&rS) { rB.value = 105; rC.value = 115; rS.value = 130; updateFilters(); } };
if ($('pOledBlack')) $('pOledBlack').onclick = () => { if (rB&&rC&&rS) { rB.value = 95; rC.value = 140; rS.value = 105; updateFilters(); } };
if ($('pNightDim')) $('pNightDim').onclick = () => { if (rB&&rC&&rS) { rB.value = 65; rC.value = 90; rS.value = 85; updateFilters(); } };

let subOffsetSeconds = 0;
function adjustSubOffset(delta) {
  subOffsetSeconds += delta;
  if ($('subOffsetVal')) $('subOffsetVal').textContent = `${subOffsetSeconds > 0 ? '+' : ''}${subOffsetSeconds.toFixed(1)}s`;
  if (mainTrack && mainTrack.track && mainTrack.track.cues) {
    for (let i = 0; i < mainTrack.track.cues.length; i++) {
      mainTrack.track.cues[i].startTime += delta;
      mainTrack.track.cues[i].endTime += delta;
    }
  }
}
if ($('subDelayMinus')) $('subDelayMinus').onclick = () => adjustSubOffset(-0.5);
if ($('subDelayMinusSmall')) $('subDelayMinusSmall').onclick = () => adjustSubOffset(-0.1);
if ($('subDelayPlusSmall')) $('subDelayPlusSmall').onclick = () => adjustSubOffset(+0.1);
if ($('subDelayPlus')) $('subDelayPlus').onclick = () => adjustSubOffset(+0.5);

if ($('subOffOpt')) {
  $('subOffOpt').onclick = () => {
    if (mainTrack) { mainTrack.mode = 'disabled'; mainTrack.src = ''; }
    if ($('activeSubName')) $('activeSubName').textContent = 'None';
  };
}

if (video) {
  video.addEventListener('loadedmetadata', () => {
    if (playerDurationBadge) playerDurationBadge.textContent = formatTime(video.duration);
    if (playerResBadge) {
      const h = video.videoHeight;
      if (h >= 1080) playerResBadge.textContent = '1080p FHD';
      else if (h >= 720) playerResBadge.textContent = '720p HD';
      else if (h > 0) playerResBadge.textContent = `${h}p SD`;
      else playerResBadge.textContent = 'Auto';
    }
  });

  video.addEventListener('timeupdate', () => {
    if (!video.duration) return;
    const pct = (video.currentTime / video.duration) * 100;
    if (trackPlayed) trackPlayed.style.width = `${pct}%`;
    if (timelineSlider) timelineSlider.value = pct;

    if (video.buffered.length > 0 && trackBuffer) {
      for (let i = video.buffered.length - 1; i >= 0; i--) {
        if (video.buffered.start(i) <= video.currentTime) {
          trackBuffer.style.width = `${(video.buffered.end(i) / video.duration) * 100}%`;
          break;
        }
      }
    }

    if (timeLabel) timeLabel.textContent = `${formatTime(video.currentTime)} / ${formatTime(video.duration)}`;

    const currentSec = Math.floor(video.currentTime);
    if (currentSec > 0 && currentSec % 4 === 0 && currentSec !== lastSavedTime && activeVideoPath) {
      lastSavedTime = currentSec;
      syncHistoryToServer(activeVideoPath, playerCurrentTitle ? playerCurrentTitle.textContent : '', video.currentTime, video.duration);
      localStorage.setItem('astra_last_active_session', JSON.stringify({
        relPath: activeVideoPath,
        name: playerCurrentTitle ? playerCurrentTitle.textContent : '',
        time: currentSec
      }));
    }
  });
}

if (timelineSlider && video) {
  timelineSlider.addEventListener('input', () => {
    if (!video.duration) return;
    video.currentTime = (timelineSlider.value / 100) * video.duration;
  });
}

function resumeEpisode(key, item) {
  let matchedFolder = 'Anime Root';
  let matchedEpisodes = [];

  for (const [fKey, eps] of Object.entries(fullLibrary)) {
    if (eps.some(e => e.relPath === key || e.name === item.name)) {
      matchedFolder = fKey;
      matchedEpisodes = eps;
      break;
    }
  }

  currentPathTokens = matchedFolder === 'Anime Root' ? [] : matchedFolder.split(' / ');
  currentVideoList = matchedEpisodes.length > 0 ? matchedEpisodes : [{ name: item.name, relPath: key, size: '' }];

  if (sourceModePill) sourceModePill.textContent = 'Storage File';
  renderFloatingEpisodesList();
  renderInlinePlayerPlaylist();
  startPlayback(item.name, key, item.time);
  navigateToHash('player');
}

function fuzzyMatch(text, query) {
  if (!query) return true;
  text = text.toLowerCase();
  query = query.toLowerCase().trim();
  if (text.includes(query)) return true;

  const words = query.split(/\s+/);
  if (words.every(w => text.includes(w))) return true;

  let tIdx = 0, qIdx = 0;
  while (tIdx < text.length && qIdx < query.length) {
    if (text[tIdx] === query[qIdx]) qIdx++;
    tIdx++;
  }
  return qIdx === query.length;
}

async function fetchLibraryData() {
  try {
    const res = await fetch('/api/library');
    const data = await res.json();
    fullLibrary = data.library || {};
    if ($('cfgStorageInput')) $('cfgStorageInput').value = data.root;
    renderDashboard();
    renderFolderLevel();
    fetchHistory();
  } catch (e) {
    if (seriesCardsGrid) seriesCardsGrid.innerHTML = '<div class="loading-state">Error scanning storage</div>';
  }
}

function renderDashboard(filterQuery = '') {
  if (!seriesCardsGrid) return;
  seriesCardsGrid.innerHTML = '';
  const folders = Object.keys(fullLibrary);
  if (statSeriesCount) statSeriesCount.textContent = folders.length;

  let totalEpisodes = 0;
  folders.forEach(k => { totalEpisodes += fullLibrary[k].length; });
  if (statEpCount) statEpCount.textContent = totalEpisodes;

  const historyKeys = Object.keys(historyCache).sort((a, b) => historyCache[b].updated - historyCache[a].updated);
  if (historyKeys.length > 0) {
    const lastKey = historyKeys[0];
    const lastItem = historyCache[lastKey];
    if (heroTitle) heroTitle.textContent = lastItem.name;
    if (heroProgressPill) heroProgressPill.textContent = `${lastItem.percent}% Completed`;
    if (heroSynopsis) heroSynopsis.textContent = `Timestamp: ${formatTime(lastItem.time)} / ${formatTime(lastItem.dur)} • Direct hardware stream`;
    if (heroResumeLabel) heroResumeLabel.textContent = `Resume from ${formatTime(lastItem.time)}`;

    if (heroResumeBtn) {
      heroResumeBtn.onclick = () => resumeEpisode(lastKey, lastItem);
    }
  }

  let count = 0;
  for (const fKey of folders) {
    const eps = fullLibrary[fKey];
    if (!eps || eps.length === 0) continue;

    const matchesFolder = fuzzyMatch(fKey, filterQuery);
    const matchingEps = eps.filter(e => fuzzyMatch(e.name, filterQuery));

    if (filterQuery && !matchesFolder && matchingEps.length === 0) continue;

    count++;
    const firstEp = matchingEps.length > 0 ? matchingEps[0] : eps[0];
    const card = document.createElement('div');
    card.className = 'anime-deck-card';

    const pathParts = fKey.split(' / ');
    const mainTitle = pathParts[0];
    const subTitle = pathParts.length > 1 ? pathParts.slice(1).join(' • ') : 'Standard Season';

    card.innerHTML = `
      <div class="deck-card-top">
        <div class="deck-icon-badge">
          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h7"/></svg>
        </div>
        <span class="deck-count-pill">${eps.length} Eps</span>
      </div>
      <div class="deck-card-info">
        <h4 class="deck-title">${mainTitle}</h4>
        <span class="deck-sub">${subTitle}</span>
      </div>
      <div class="deck-card-foot">
        <span class="deck-action-label">Open Queue</span>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5"><polyline points="9 18 15 12 9 6"/></svg>
      </div>
    `;

    card.addEventListener('click', () => {
      currentPathTokens = fKey === 'Anime Root' ? [] : fKey.split(' / ');
      currentVideoList = eps;
      if (sourceModePill) sourceModePill.textContent = 'Storage File';
      renderFloatingEpisodesList();
      renderInlinePlayerPlaylist();
      startPlayback(firstEp.name, firstEp.relPath, 0);
      navigateToHash('player');
    });

    seriesCardsGrid.appendChild(card);
  }

  if (count === 0) {
    seriesCardsGrid.innerHTML = '<div class="loading-state">No matching anime series found</div>';
  }

  renderHistoryGrid();
}

if (homeQuickSearch) {
  homeQuickSearch.addEventListener('input', (e) => {
    const val = e.target.value;
    if (clearSearchBtn) clearSearchBtn.classList.toggle('show', val.length > 0);
    renderDashboard(val);
  });
  homeQuickSearch.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      renderDashboard(homeQuickSearch.value);
    }
  });
}

if (clearSearchBtn) {
  clearSearchBtn.onclick = () => {
    homeQuickSearch.value = '';
    clearSearchBtn.classList.remove('show');
    renderDashboard('');
  };
}

function renderHistoryGrid() {
  if (!historyGrid) return;
  const keys = Object.keys(historyCache).sort((a, b) => historyCache[b].updated - historyCache[a].updated);
  if (keys.length === 0) {
    historyGrid.innerHTML = '<span class="empty-hint">No watch history yet</span>';
    return;
  }
  historyGrid.innerHTML = '';
  keys.forEach(key => {
    const item = historyCache[key];
    const card = document.createElement('div');
    card.className = 'history-deck-card';

    card.innerHTML = `
      <div class="history-top-row">
        <div class="deck-title-wrap">
          <div class="deck-status-dot"></div>
          <div class="history-name">${item.name}</div>
        </div>
        <button class="icon-btn mini delete-item-btn" title="Delete">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>
        </button>
      </div>
      <div class="history-time-tag">${formatTime(item.time)} / ${formatTime(item.dur)} • <strong>${item.percent}%</strong></div>
      <div class="history-sub-bar">
        <div class="history-sub-fill" style="width:${item.percent}%;"></div>
      </div>
      <div class="history-actions">
        <span class="sub-hint" style="font-size:0.65rem;">Auto Saved</span>
        <button class="pill-btn highlight mini resume-btn">Resume</button>
      </div>
    `;

    card.querySelector('.resume-btn').onclick = (e) => {
      e.stopPropagation();
      resumeEpisode(key, item);
    };

    card.querySelector('.delete-item-btn').onclick = async (e) => {
      e.stopPropagation();
      await fetch('/api/history/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ key })
      });
      delete historyCache[key];
      renderDashboard(homeQuickSearch ? homeQuickSearch.value : '');
    };

    historyGrid.appendChild(card);
  });
}

function renderFolderLevel() {
  const explorerContent = $('explorerContent');
  const pathDisplay = $('pathDisplay');
  const folderBackBtn = $('folderBackBtn');
  if (!explorerContent) return;
  explorerContent.innerHTML = '';
  const currentPrefix = currentPathTokens.join(' / ');

  if (pathDisplay) {
    pathDisplay.innerHTML = `<span class="path-segment root" onclick="navigateToRoot()">Storage</span>`;
    currentPathTokens.forEach((token, idx) => {
      const span = document.createElement('span');
      span.innerHTML = ` &gt; <span>${token}</span>`;
      span.onclick = () => navigateToLevel(idx);
      pathDisplay.appendChild(span);
    });
  }

  if (folderBackBtn) folderBackBtn.disabled = currentPathTokens.length === 0;

  const subfolders = new Set();
  const filesHere = [];

  Object.keys(fullLibrary).forEach(folderKey => {
    let keyStr = folderKey.trim();
    if (currentPrefix === '') {
      const parts = keyStr.split(' / ');
      if (parts.length > 1) subfolders.add(parts[0]);
      else if (keyStr === 'Anime Root') filesHere.push(...fullLibrary[folderKey]);
      else subfolders.add(keyStr);
    } else {
      if (keyStr.startsWith(currentPrefix)) {
        const remainder = keyStr.slice(currentPrefix.length).replace(/^\s*\/\s*/, '');
        if (remainder) subfolders.add(remainder.split(' / ')[0]);
        else filesHere.push(...fullLibrary[folderKey]);
      }
    }
  });

  currentVideoList = filesHere;

  subfolders.forEach(sfName => {
    const row = document.createElement('div');
    row.className = 'explorer-row';
    row.innerHTML = `
      <div class="row-left">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z"/></svg>
        <div><div class="row-title">${sfName}</div><div class="row-sub">Folder</div></div>
      </div>
      <span class="row-badge">Open</span>
    `;
    row.addEventListener('click', () => { currentPathTokens.push(sfName); renderFolderLevel(); });
    explorerContent.appendChild(row);
  });

  filesHere.forEach(fileObj => {
    const row = document.createElement('div');
    row.className = 'explorer-row';
    row.innerHTML = `
      <div class="row-left">
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#3b82f6" stroke-width="2"><polygon points="6 4 20 12 6 20 6 4"/></svg>
        <div><div class="row-title">${fileObj.name}</div><div class="row-sub">${fileObj.size} • ${fileObj.date}</div></div>
      </div>
      <span class="row-badge">Play</span>
    `;
    row.addEventListener('click', () => {
      if (sourceModePill) sourceModePill.textContent = 'Storage File';
      renderFloatingEpisodesList();
      renderInlinePlayerPlaylist();
      startPlayback(fileObj.name, fileObj.relPath);
      navigateToHash('player');
    });
    explorerContent.appendChild(row);
  });
}

function navigateToRoot() { currentPathTokens = []; renderFolderLevel(); }
function navigateToLevel(idx) { currentPathTokens = currentPathTokens.slice(0, idx + 1); renderFolderLevel(); }
if ($('folderBackBtn')) {
  $('folderBackBtn').onclick = () => { if (currentPathTokens.length > 0) { currentPathTokens.pop(); renderFolderLevel(); } };
}

function startPlayback(title, relPath, seekTime = 0, directBlobUrl = null) {
  if (!video) return;
  if (embedFrame) embedFrame.src = '';
  if (playerWrapper) playerWrapper.classList.remove('is-embed');

  initAudioBooster();
  activeVideoPath = relPath;
  if (playerCurrentTitle) playerCurrentTitle.textContent = title;
  if (playerCurrentFolder) playerCurrentFolder.textContent = currentPathTokens.join(' / ') || 'Storage';

  const mappedSub = localStorage.getItem(`astra_sub_map_${relPath}`);
  if (mappedSub && mainTrack) {
    mainTrack.src = mappedSub;
    mainTrack.mode = 'showing';
    if ($('activeSubName')) $('activeSubName').textContent = 'Auto Mapped Subtitle';
  } else {
    if (mainTrack && !directBlobUrl) {
      mainTrack.mode = 'disabled';
      if ($('activeSubName')) $('activeSubName').textContent = 'None';
    }
  }

  video.src = directBlobUrl ? directBlobUrl : `/stream?file=${encodeURIComponent(relPath)}`;

  video.onloadedmetadata = () => {
    if (seekTime > 0 && seekTime < video.duration - 5) video.currentTime = seekTime;
    const canAuto = autoplayCheckbox ? autoplayCheckbox.checked : true;
    if (canAuto) {
      if (manualCenterPlay) manualCenterPlay.style.display = 'none';
      video.play().catch(() => { if (manualCenterPlay) manualCenterPlay.style.display = 'flex'; });
    } else {
      if (manualCenterPlay) manualCenterPlay.style.display = 'flex';
      video.pause();
    }
    resetControlsHideTimer();
  };

  localStorage.setItem('astra_last_active_session', JSON.stringify({
    relPath,
    name: title,
    time: seekTime
  }));
}

async function fetchHistory() {
  try {
    const res = await fetch('/api/history');
    historyCache = await res.json();
    renderDashboard();
  } catch (e) {}
}

async function syncHistoryToServer(relPath, name, time, dur) {
  if (!name || !dur || isNaN(time)) return;
  const payload = { relPath, name, time: Math.floor(time), dur: Math.floor(dur) };

  const key = relPath || name;
  historyCache[key] = {
    name,
    time: Math.floor(time),
    dur: Math.floor(dur),
    percent: Math.min(100, Math.floor((time / dur) * 100)),
    updated: Date.now()
  };

  try {
    await fetch('/api/history', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
  } catch (e) {}
}

let activeConfirmAction = null;
function openConfirmDialog(title, desc, onConfirm) {
  if ($('confirmModalTitle')) $('confirmModalTitle').textContent = title;
  if ($('confirmModalDesc')) $('confirmModalDesc').textContent = desc;
  activeConfirmAction = onConfirm;
  if (confirmModal) confirmModal.classList.add('open');
}

if (confirmModalCancelBtn) {
  confirmModalCancelBtn.onclick = () => {
    if (confirmModal) confirmModal.classList.remove('open');
    activeConfirmAction = null;
  };
}

if (confirmModalOkBtn) {
  confirmModalOkBtn.onclick = async () => {
    if (confirmModal) confirmModal.classList.remove('open');
    if (activeConfirmAction) {
      await activeConfirmAction();
      activeConfirmAction = null;
    }
  };
}

if (openClearHistoryModalBtn) {
  openClearHistoryModalBtn.onclick = () => {
    openConfirmDialog('Clear Watch History?', 'This will wipe all continue watching progress permanently.', async () => {
      await fetch('/api/history/clear', { method: 'POST' });
      historyCache = {};
      renderDashboard();
    });
  };
}

if ($('resetHistoryFileBtn')) {
  $('resetHistoryFileBtn').onclick = () => {
    openConfirmDialog('Reset History File?', 'This will permanently erase history.json from storage.', async () => {
      await fetch('/api/history/clear', { method: 'POST' });
      historyCache = {};
      renderDashboard();
    });
  };
}

let pendingSubtitleDownload = null;
const subTargetModal = $('subTargetModal');
const subTargetTitle = $('subTargetTitle');
const subTargetEpisodesList = $('subTargetEpisodesList');
const closeSubTargetModalBtn = $('closeSubTargetModalBtn');

function openSubtitleTargetPicker(subData) {
  pendingSubtitleDownload = subData;
  if (subTargetTitle) subTargetTitle.textContent = `Apply "${subData.filename}" to:`;
  if (subTargetEpisodesList) {
    subTargetEpisodesList.innerHTML = '';
    const allEps = [];
    Object.keys(fullLibrary).forEach(fKey => {
      fullLibrary[fKey].forEach(ep => {
        if (!allEps.some(x => x.relPath === ep.relPath)) {
          allEps.push({ ...ep, folder: fKey });
        }
      });
    });

    if (allEps.length === 0 && currentVideoList.length > 0) {
      currentVideoList.forEach(ep => allEps.push({ ...ep, folder: 'Queue' }));
    }

    if (allEps.length === 0) {
      subTargetEpisodesList.innerHTML = '<div class="empty-hint">No episodes found to apply to.</div>';
    } else {
      allEps.forEach(ep => {
        const row = document.createElement('div');
        row.className = 'explorer-row';
        row.innerHTML = `
          <div class="row-left">
            <div>
              <div class="row-title">${ep.name}</div>
              <div class="row-sub">${ep.folder}</div>
            </div>
          </div>
          <span class="row-badge">Select</span>
        `;
        row.onclick = async () => {
          await applySubtitleToEpisode(subData, ep);
          if (subTargetModal) subTargetModal.classList.remove('open');
        };
        subTargetEpisodesList.appendChild(row);
      });
    }
  }
  if (subTargetModal) subTargetModal.classList.add('open');
}

if (closeSubTargetModalBtn) {
  closeSubTargetModalBtn.onclick = () => {
    if (subTargetModal) subTargetModal.classList.remove('open');
  };
}

async function applySubtitleToEpisode(subData, episode) {
  let subUrl = subData.downloadUrl;
  if (!subData.isLocal) {
    const res = await fetch('/api/subs/save', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url: subData.downloadUrl, filename: subData.filename })
    });
    const result = await res.json();
    subUrl = `/subs_static/${encodeURIComponent(result.filename)}`;
  } else {
    subUrl = `/subs_static/${encodeURIComponent(subData.filename)}`;
  }

  localStorage.setItem(`astra_sub_map_${episode.relPath}`, subUrl);

  if (activeVideoPath === episode.relPath && mainTrack) {
    mainTrack.src = subUrl;
    mainTrack.mode = 'showing';
    if ($('activeSubName')) $('activeSubName').textContent = subData.filename;
  }
  alert(`Subtitle bound to: ${episode.name}`);
}

const onlineSubQuery = $('onlineSubQuery');
const onlineSubSearchBtn = $('onlineSubSearchBtn');
const onlineSubResults = $('onlineSubResults');
const localSubsList = $('localSubsList');
const providerSwitchRow = $('providerSwitchRow');

if (providerSwitchRow) {
  providerSwitchRow.querySelectorAll('.chip-preset').forEach(btn => {
    btn.onclick = () => {
      providerSwitchRow.querySelectorAll('.chip-preset').forEach(b => b.classList.remove('active'));
      btn.classList.add('active');
      currentSubProvider = btn.dataset.prov;
      if (onlineSubQuery.value.trim()) searchOnlineSubs();
    };
  });
}

async function searchOnlineSubs() {
  if (!onlineSubQuery) return;
  const q = onlineSubQuery.value.trim();
  if (!q) return;
  if (onlineSubResults) onlineSubResults.innerHTML = '<div class="loading-state">Searching repository...</div>';

  try {
    const res = await fetch(`/api/subs/search?q=${encodeURIComponent(q)}&provider=${encodeURIComponent(currentSubProvider)}`);
    const subs = await res.json();
    if (subs.length === 0) {
      if (onlineSubResults) onlineSubResults.innerHTML = '<span class="empty-hint">No subtitles found. Try different title or provider.</span>';
      return;
    }
    if (onlineSubResults) onlineSubResults.innerHTML = '';
    subs.forEach(s => {
      const card = document.createElement('div');
      card.className = 'explorer-row';
      card.innerHTML = `
        <div class="row-left">
          <div>
            <div class="row-title">${s.title}</div>
            <div class="row-sub">${s.provider} • ${s.size}</div>
          </div>
        </div>
        <button class="pill-btn highlight mini">Apply</button>
      `;
      card.querySelector('button').onclick = () => {
        openSubtitleTargetPicker({ downloadUrl: s.downloadUrl, filename: s.filename, isLocal: false });
      };
      onlineSubResults.appendChild(card);
    });
  } catch(e) {
    if (onlineSubResults) onlineSubResults.innerHTML = '<span class="empty-hint">Network error searching subtitles</span>';
  }
}

if (onlineSubSearchBtn) onlineSubSearchBtn.onclick = searchOnlineSubs;
if (onlineSubQuery) onlineSubQuery.addEventListener('keydown', (e) => { if (e.key === 'Enter') searchOnlineSubs(); });

async function loadLocalSubtitles() {
  try {
    const res = await fetch('/api/subs/local');
    const files = await res.json();
    if (!localSubsList) return;
    if (files.length === 0) {
      localSubsList.innerHTML = '<span class="empty-hint">No saved subtitles in ~/astra-player/subtitles</span>';
      return;
    }
    localSubsList.innerHTML = '';
    files.forEach(f => {
      const chip = document.createElement('div');
      chip.className = 'explorer-row';
      chip.innerHTML = `
        <div class="row-left">
          <div>
            <div class="row-title">${f.name}</div>
            <div class="row-sub">${f.size} • ${f.date}</div>
          </div>
        </div>
        <div style="display:flex; gap:6px;">
          <button class="mini-btn apply-btn">Apply</button>
          <button class="mini-btn danger del-btn">Delete</button>
        </div>
      `;
      chip.querySelector('.apply-btn').onclick = () => {
        openSubtitleTargetPicker({ filename: f.name, isLocal: true });
      };
      chip.querySelector('.del-btn').onclick = async () => {
        await fetch('/api/subs/delete', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ filename: f.name })
        });
        loadLocalSubtitles();
      };
      localSubsList.appendChild(chip);
    });
  } catch (e) {}
}

const streamUrlInput = $('streamUrlInput');
const verifyBtn = $('verifyAndStreamBtn');
const streamHistoryGrid = $('streamHistoryGrid');
const streamPageSeriesGrid = $('streamPageSeriesGrid');

function getSavedStreamHistory() {
  try { return JSON.parse(localStorage.getItem('astra_stream_history') || '[]'); } catch (e) { return []; }
}

function saveStreamHistoryItem(url, time, dur) {
  let hist = getSavedStreamHistory();
  const existingIdx = hist.findIndex(h => h.url === url);
  const item = { url, time: Math.floor(time || 0), dur: Math.floor(dur || 0), updated: Date.now() };
  if (existingIdx !== -1) hist.splice(existingIdx, 1);
  hist.unshift(item);
  localStorage.setItem('astra_stream_history', JSON.stringify(hist.slice(0, 15)));
  renderStreamHistory();
}

function renderStreamHistory() {
  if (!streamHistoryGrid) return;
  const hist = getSavedStreamHistory();
  if (hist.length === 0) {
    streamHistoryGrid.innerHTML = '<span class="empty-hint">No web streams saved yet</span>';
    return;
  }
  streamHistoryGrid.innerHTML = '';
  hist.forEach(item => {
    const card = document.createElement('div');
    card.className = 'history-deck-card';
    let urlHost = item.url;
    try { urlHost = new URL(item.url).hostname; } catch (e) {}
    card.innerHTML = `
      <div class="history-top-row">
        <div class="deck-title-wrap">
          <div class="deck-status-dot" style="background:#38bdf8;"></div>
          <div class="history-name">${urlHost}</div>
        </div>
      </div>
      <div class="history-time-tag">${formatTime(item.time)} / ${formatTime(item.dur)}</div>
      <div class="history-actions" style="margin-top:6px;">
        <span class="sub-hint" style="font-size:0.65rem;">Web Source</span>
        <button class="pill-btn highlight mini">Resume</button>
      </div>
    `;
    card.querySelector('button').onclick = () => {
      if (streamUrlInput) streamUrlInput.value = item.url;
      verifyAndPlayStream(item.url, item.time);
    };
    streamHistoryGrid.appendChild(card);
  });
}

function renderStreamPage() {
  renderStreamHistory();
  if (streamPageSeriesGrid) {
    streamPageSeriesGrid.innerHTML = '';
    const folders = Object.keys(fullLibrary);
    if (folders.length === 0) {
      streamPageSeriesGrid.innerHTML = '<span class="empty-hint">No local series found</span>';
      return;
    }
    folders.slice(0, 6).forEach(fKey => {
      const card = document.createElement('div');
      card.className = 'anime-deck-card';
      card.innerHTML = `
        <div class="deck-card-top">
          <div class="deck-icon-badge">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M4 6h16M4 12h16M4 18h7"/></svg>
          </div>
          <span class="deck-count-pill">${fullLibrary[fKey].length} Eps</span>
        </div>
        <div class="deck-card-info">
          <h4 class="deck-title">${fKey}</h4>
          <span class="deck-sub">Local Directory</span>
        </div>
      `;
      card.onclick = () => {
        currentPathTokens = fKey === 'Anime Root' ? [] : fKey.split(' / ');
        currentVideoList = fullLibrary[fKey];
        if (sourceModePill) sourceModePill.textContent = 'Storage File';
        startPlayback(fullLibrary[fKey][0].name, fullLibrary[fKey][0].relPath, 0);
        navigateToHash('player');
      };
      streamPageSeriesGrid.appendChild(card);
    });
  }
}

async function verifyAndPlayStream(url, seekTime = 0) {
  if (!url) return;
  if (verifyBtn) verifyBtn.textContent = 'Connecting...';
  try {
    const res = await fetch('/api/verify-link', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ url })
    });
    const result = await res.json();
    if (result.valid) {
      saveStreamHistoryItem(url, seekTime, 0);
      navigateToHash('player');
      if (sourceModePill) sourceModePill.textContent = result.type === 'direct' ? 'Native Stream' : 'Web Stream';
      if (playerCurrentTitle) playerCurrentTitle.textContent = 'Web Stream';
      if (playerCurrentFolder) playerCurrentFolder.textContent = url;

      if (result.type === 'direct') {
        if (embedFrame) embedFrame.src = '';
        if (playerWrapper) playerWrapper.classList.remove('is-embed');
        if (video) {
          video.src = `/api/proxy/stream?url=${encodeURIComponent(result.streamUrl)}`;
          video.onloadedmetadata = () => {
            if (seekTime > 0) video.currentTime = seekTime;
            video.play();
          };
        }
      } else {
        if (video) { video.pause(); video.src = ''; }
        if (playerWrapper) playerWrapper.classList.add('is-embed');
        if (embedFrame) embedFrame.src = result.streamUrl;
      }
    }
  } catch(e) {}
  finally { if (verifyBtn) verifyBtn.textContent = 'Play Stream'; }
}

if (verifyBtn) {
  verifyBtn.onclick = () => {
    if (streamUrlInput) verifyAndPlayStream(streamUrlInput.value.trim());
  };
}

if ($('clearStreamHistoryBtn')) {
  $('clearStreamHistoryBtn').onclick = () => {
    openConfirmDialog('Clear Web Streams?', 'This will wipe your stream link history records.', () => {
      localStorage.removeItem('astra_stream_history');
      renderStreamHistory();
    });
  };
}

async function loadSettingsDiagnostics() {
  try {
    const res = await fetch('/api/system/status');
    const data = await res.json();
    if ($('sysDiagText')) {
      $('sysDiagText').innerHTML = `RAM: <strong style="color:var(--text-primary);">${data.ramUsedMB} MB</strong> • Uptime: ${data.uptime}s • Node: ${data.nodeVer}`;
    }
  } catch (e) {}
}

if ($('btnSaveStoragePath')) {
  $('btnSaveStoragePath').onclick = async () => {
    const newPath = $('cfgStorageInput') ? $('cfgStorageInput').value.trim() : '';
    if (!newPath) return;
    try {
      const res = await fetch('/api/settings/root', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ newPath })
      });
      const data = await res.json();
      if (data.success) {
        fullLibrary = data.library || {};
        alert('Directory updated and re-scanned successfully!');
        renderDashboard();
      } else {
        alert(data.message || 'Directory error');
      }
    } catch (e) { alert('Failed to connect to server'); }
  };
}

const dinoLaunchBtn = $('dinoLaunchBtn');
const dinoGameModal = $('dinoGameModal');
const closeDinoGameBtn = $('closeDinoGameBtn');
const dinoCanvas = $('dinoCanvas');
const dinoScoreDisplay = $('dinoScoreDisplay');
const dinoHint = $('dinoHint');

let dinoAnimId = null;
let dinoRunning = false;
let dinoScore = 0;

let dino = { x: 20, y: 70, width: 16, height: 18, vy: 0, gravity: 0.65, jumpPower: -8.8, isGrounded: true };
let obstacles = [];
let dinoSpeed = 3.6;
let spawnTimer = 0;

function startDinoGame() {
  dinoGameModal.classList.add('open');
  dinoScore = 0;
  dinoSpeed = 3.6;
  obstacles = [];
  dino.y = 70;
  dino.vy = 0;
  dino.isGrounded = true;
  dinoRunning = true;
  dinoHint.textContent = 'Tap box to jump!';
  loopDinoGame();
}

function stopDinoGame() {
  dinoRunning = false;
  if (dinoAnimId) cancelAnimationFrame(dinoAnimId);
  dinoAnimId = null;
  obstacles = [];
  const ctx = dinoCanvas.getContext('2d');
  ctx.clearRect(0, 0, dinoCanvas.width, dinoCanvas.height);
  dinoGameModal.classList.remove('open');
}

function jumpDino() {
  if (!dinoRunning) {
    startDinoGame();
    return;
  }
  if (dino.isGrounded) {
    dino.vy = dino.jumpPower;
    dino.isGrounded = false;
  }
}

if (dinoLaunchBtn) dinoLaunchBtn.onclick = (e) => { e.stopPropagation(); startDinoGame(); };
if (closeDinoGameBtn) closeDinoGameBtn.onclick = (e) => { e.stopPropagation(); stopDinoGame(); };

if (dinoCanvas) {
  dinoCanvas.addEventListener('touchstart', (e) => { e.preventDefault(); e.stopPropagation(); jumpDino(); }, { passive: false });
  dinoCanvas.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); jumpDino(); });
}

const dinoHeader = document.querySelector('.dino-game-header');
let isDraggingDino = false;
let dragStartX = 0, dragStartY = 0;

if (dinoHeader) {
  dinoHeader.addEventListener('touchstart', (e) => {
    isDraggingDino = true;
    dragStartX = e.touches[0].clientX - dinoGameModal.offsetLeft;
    dragStartY = e.touches[0].clientY - dinoGameModal.offsetTop;
  }, { passive: true });

  window.addEventListener('touchmove', (e) => {
    if (!isDraggingDino) return;
    let newX = e.touches[0].clientX - dragStartX;
    let newY = e.touches[0].clientY - dragStartY;
    dinoGameModal.style.left = `${Math.max(10, Math.min(window.innerWidth - 300, newX))}px`;
    dinoGameModal.style.top = `${Math.max(10, Math.min(window.innerHeight - 180, newY))}px`;
    dinoGameModal.style.right = 'auto';
  }, { passive: true });

  window.addEventListener('touchend', () => { isDraggingDino = false; });
}

function loopDinoGame() {
  if (!dinoRunning) return;
  const ctx = dinoCanvas.getContext('2d');
  const W = dinoCanvas.width;
  const H = dinoCanvas.height;

  ctx.clearRect(0, 0, W, H);

  ctx.strokeStyle = '#38bdf8';
  ctx.lineWidth = 2;
  ctx.beginPath();
  ctx.moveTo(0, 90);
  ctx.lineTo(W, 90);
  ctx.stroke();

  dino.vy += dino.gravity;
  dino.y += dino.vy;
  if (dino.y >= 70) {
    dino.y = 70;
    dino.vy = 0;
    dino.isGrounded = true;
  }

  ctx.fillStyle = '#e6194b';
  ctx.fillRect(dino.x, dino.y, dino.width, dino.height);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(dino.x + 10, dino.y + 3, 3, 3);

  spawnTimer++;
  if (spawnTimer > Math.max(45, 95 - Math.floor(dinoScore / 60))) {
    obstacles.push({ x: W + 10, y: 72, width: 12, height: 18 });
    spawnTimer = 0;
  }

  for (let i = obstacles.length - 1; i >= 0; i--) {
    let obs = obstacles[i];
    obs.x -= dinoSpeed;
    ctx.fillRect(obs.x, obs.y, obs.width, obs.height);

    if (
      dino.x < obs.x + obs.width &&
      dino.x + dino.width > obs.x &&
      dino.y < obs.y + obs.height &&
      dino.y + dino.height > obs.y
    ) {
      dinoRunning = false;
      dinoHint.textContent = `Over! Score: ${dinoScore}. Tap to Retry`;
      cancelAnimationFrame(dinoAnimId);
      return;
    }

    if (obs.x + obs.width < 0) {
      obstacles.splice(i, 1);
      dinoScore += 10;
      if (dinoScore % 100 === 0) dinoSpeed += 0.25;
    }
  }

  dinoScoreDisplay.textContent = `${dinoScore}`;
  dinoAnimId = requestAnimationFrame(loopDinoGame);
}

fetchLibraryData();
navigateToHash(window.location.hash || 'home');
