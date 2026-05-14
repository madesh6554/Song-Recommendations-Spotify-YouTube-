import { seekTo, getDuration } from './youtube.js';

// ── DOM references ────────────────────────────────────────────
const songTitle    = document.getElementById('song-title');
const songArtist   = document.getElementById('song-artist');
const albumArt     = document.getElementById('album-art');
const progressBar  = document.getElementById('progress-bar');
const progressFill = document.getElementById('progress-fill');
const timeCurrent  = document.getElementById('time-current');
const timeTotal    = document.getElementById('time-total');
const queueList    = document.getElementById('queue-list');
const iconPlay     = document.getElementById('icon-play');
const iconPause    = document.getElementById('icon-pause');
const loadingOverlay = document.getElementById('loading-overlay');
const toastContainer = document.getElementById('toast-container');
const loginScreen  = document.getElementById('login-screen');
const playerScreen = document.getElementById('player-screen');

// ── Screen switching ──────────────────────────────────────────

export function showLoginScreen() {
  loginScreen.classList.remove('hidden');
  playerScreen.classList.add('hidden');
}

export function showPlayerScreen() {
  loginScreen.classList.add('hidden');
  playerScreen.classList.remove('hidden');
}

// ── Track card ────────────────────────────────────────────────

export function updateCard(track) {
  songTitle.textContent  = track.name;
  songArtist.textContent = track.artists.map(a => a.name).join(', ');

  const images = track.album?.images || [];
  const img    = images[0]?.url || '';
  albumArt.src = img;
  albumArt.alt = `${track.album?.name || track.name} album art`;
}

// ── Progress bar ──────────────────────────────────────────────

export function updateProgressBar(current, duration) {
  if (!duration || duration <= 0) return;
  const pct = Math.min((current / duration) * 100, 100);
  progressFill.style.width = `${pct}%`;
  timeCurrent.textContent  = formatTime(current);
  timeTotal.textContent    = formatTime(duration);
}

function formatTime(secs) {
  const s = Math.floor(secs);
  const m = Math.floor(s / 60);
  return `${m}:${String(s % 60).padStart(2, '0')}`;
}

// Click-to-seek on progress bar
progressBar.addEventListener('click', e => {
  const pct     = e.offsetX / progressBar.offsetWidth;
  const duration = getDuration();
  if (duration > 0) seekTo(pct * duration);
});

// Keyboard seek with arrow keys
progressBar.addEventListener('keydown', e => {
  const duration = getDuration();
  if (!duration) return;
  if (e.key === 'ArrowRight') seekTo(Math.min(getDuration(), getCurrentTimeFromBar() + 10));
  if (e.key === 'ArrowLeft')  seekTo(Math.max(0, getCurrentTimeFromBar() - 10));
});

function getCurrentTimeFromBar() {
  const pctStr = progressFill.style.width || '0%';
  const pct    = parseFloat(pctStr) / 100;
  return pct * getDuration();
}

// ── Play / Pause icon swap ────────────────────────────────────

export function setPlayingState(isPlaying) {
  if (isPlaying) {
    iconPlay.classList.add('hidden');
    iconPause.classList.remove('hidden');
  } else {
    iconPlay.classList.remove('hidden');
    iconPause.classList.add('hidden');
  }
}

// ── Queue sidebar ─────────────────────────────────────────────

export function updateQueueSidebar(tracks) {
  if (!tracks.length) {
    queueList.innerHTML = '<li class="queue-placeholder">Fetching more songs…</li>';
    return;
  }
  queueList.innerHTML = tracks.slice(0, 15).map((t, i) => `
    <li class="queue-item">
      <span class="queue-num">${i + 1}</span>
      <div class="queue-info">
        <span class="queue-title">${escapeHtml(t.name)}</span>
        <span class="queue-artist">${escapeHtml(t.artists.map(a => a.name).join(', '))}</span>
      </div>
    </li>
  `).join('');
}

function escapeHtml(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

// ── Loading overlay ───────────────────────────────────────────

export function showLoadingState() {
  loadingOverlay.classList.remove('hidden');
}

export function hideLoadingState() {
  loadingOverlay.classList.add('hidden');
}

// ── Toast notifications ───────────────────────────────────────

export function showError(message) {
  showToast(message, 'error');
}

export function showInfo(message) {
  showToast(message, 'info');
}

function showToast(message, type = 'info') {
  const toast = document.createElement('div');
  toast.className = `toast toast-${type}`;
  toast.textContent = message;
  toastContainer.appendChild(toast);

  // Trigger animation
  requestAnimationFrame(() => toast.classList.add('toast-visible'));

  setTimeout(() => {
    toast.classList.remove('toast-visible');
    toast.addEventListener('transitionend', () => toast.remove(), { once: true });
  }, 4000);
}
