import { QUEUE_LOW_WATERMARK, keysConfigured, saveSetup, getArtists } from './config.js';
import { buildRecommendations } from './music.js';
import { enqueue, dequeue, peekAll, queueLength, addToNeverSuggest } from './queue.js';
import { loadVideo, togglePlay, setOnEnded, setOnProgress, isPlaying } from './youtube.js';
import {
  showLoginScreen, showPlayerScreen,
  updateCard, updateProgressBar, updateQueueSidebar,
  setPlayingState, showLoadingState, hideLoadingState,
  showError, showInfo,
} from './player.js';

let currentTrack = null;
let historyStack = [];   // last 10 played: [{track, videoId}, …]

// ── Boot ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (!keysConfigured()) {
    showSetupScreen();
    return;
  }
  startApp();
});

// ── Setup screen ──────────────────────────────────────────────

function showSetupScreen() {
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('login-screen').classList.add('hidden');
  document.getElementById('player-screen').classList.add('hidden');

  // Pre-fill if partially saved
  const savedKey     = localStorage.getItem('cfg_youtube_api_key') || '';
  const savedArtists = localStorage.getItem('cfg_artists') || '';
  if (savedKey)     document.getElementById('input-yt-key').value    = savedKey;
  if (savedArtists) document.getElementById('input-artists').value   = savedArtists;

  document.getElementById('btn-save-keys').addEventListener('click', () => {
    const youtubeKey = document.getElementById('input-yt-key').value.trim();
    const artists    = document.getElementById('input-artists').value.trim();
    const errEl      = document.getElementById('setup-error');

    if (!youtubeKey || !artists) {
      errEl.textContent = 'Please fill in both fields.';
      errEl.classList.remove('hidden');
      return;
    }

    saveSetup({ youtubeKey, artists });
    window.location.reload();
  });
}

// ── Main app ──────────────────────────────────────────────────

function startApp() {
  showPlayerScreen();

  setOnEnded(() => playNextSong());
  setOnProgress((current, duration) => {
    updateProgressBar(current, duration);
    setPlayingState(isPlaying());
  });

  document.getElementById('btn-play').addEventListener('click', () => {
    togglePlay();
    setPlayingState(isPlaying());
  });
  document.getElementById('btn-skip').addEventListener('click', () => playNextSong());
  document.getElementById('btn-prev').addEventListener('click', playPreviousSong);
  document.getElementById('btn-never').addEventListener('click', handleNeverSuggest);
  document.getElementById('btn-logout').addEventListener('click', () => {
    // "Logout" = go back to setup
    localStorage.removeItem('cfg_youtube_api_key');
    localStorage.removeItem('cfg_artists');
    window.location.reload();
  });

  initSession();
}

async function initSession() {
  showLoadingState();
  try {
    const tracks = await buildRecommendations();
    if (!tracks.length) {
      showError('No songs found. Check your artist names and YouTube API key.');
      hideLoadingState();
      return;
    }
    enqueue(tracks);
    await playNextSong();
  } catch (err) {
    hideLoadingState();
    if (err.message === 'YOUTUBE_QUOTA_EXCEEDED') {
      showError('YouTube daily search limit reached. Try again tomorrow.');
    } else {
      console.error('Init failed:', err);
      showError('Could not load songs. Check your YouTube API key in setup.');
    }
  }
}

// ── Playback ──────────────────────────────────────────────────

async function playNextSong() {
  showLoadingState();

  let track = dequeue();
  if (!track) {
    await refillQueue();
    track = dequeue();
  }
  if (!track) {
    showError('No more songs in queue. Refreshing…');
    hideLoadingState();
    setTimeout(() => initSession(), 2000);
    return;
  }

  // Save current to history
  if (currentTrack) {
    historyStack.unshift({ track: currentTrack });
    if (historyStack.length > 10) historyStack.pop();
  }

  currentTrack = track;
  loadVideo(track.youtubeId);   // videoId is already in the track object
  updateCard(track);
  updateQueueSidebar(peekAll());
  hideLoadingState();
  setPlayingState(true);

  if (queueLength() < QUEUE_LOW_WATERMARK) refillQueue();
}

function playPreviousSong() {
  if (!historyStack.length) return;
  const prev = historyStack.shift();
  currentTrack = prev.track;
  loadVideo(prev.track.youtubeId);
  updateCard(prev.track);
  updateQueueSidebar(peekAll());
  setPlayingState(true);
}

function handleNeverSuggest() {
  if (!currentTrack) return;
  addToNeverSuggest(currentTrack.id);
  showInfo(`"${currentTrack.name}" won't appear again.`);
  playNextSong();
}

async function refillQueue() {
  try {
    const tracks = await buildRecommendations();
    enqueue(tracks);
    updateQueueSidebar(peekAll());
  } catch (err) {
    console.error('Refill failed:', err);
  }
}
