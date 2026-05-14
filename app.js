import { QUEUE_LOW_WATERMARK, keysConfigured, saveSetup } from './config.js';
import { getNextSongs, buildInitialQueue, searchForSong, enrichTrack } from './music.js';
import { enqueue, dequeue, peekAll, queueLength, addToNeverSuggest } from './queue.js';
import { loadVideo, togglePlay, setOnEnded, setOnProgress, isPlaying } from './youtube.js';
import {
  showPlayerScreen,
  updateCard, updateProgressBar, updateQueueSidebar,
  setPlayingState, showLoadingState, hideLoadingState,
  showError, showInfo,
} from './player.js';

let currentTrack = null;
let historyStack = [];

// ── Boot ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', () => {
  if (!keysConfigured()) { showSetupScreen(); return; }
  startApp();
});

// ── Setup screen ──────────────────────────────────────────────

function showSetupScreen() {
  document.getElementById('setup-screen').classList.remove('hidden');
  document.getElementById('player-screen').classList.add('hidden');

  const savedYt  = localStorage.getItem('cfg_youtube_api_key') || '';
  const savedLfm = localStorage.getItem('cfg_lastfm_api_key')  || '';
  if (savedYt)  document.getElementById('input-yt-key').value   = savedYt;
  if (savedLfm) document.getElementById('input-lfm-key').value  = savedLfm;

  document.getElementById('btn-save-keys').addEventListener('click', () => {
    const youtubeKey = document.getElementById('input-yt-key').value.trim();
    const lastfmKey  = document.getElementById('input-lfm-key').value.trim();
    const errEl      = document.getElementById('setup-error');

    if (!youtubeKey || !lastfmKey) {
      errEl.textContent = 'Please fill in both API keys.';
      errEl.classList.remove('hidden');
      return;
    }
    saveSetup({ youtubeKey, lastfmKey });
    window.location.reload();
  });
}

// ── Main app ──────────────────────────────────────────────────

function startApp() {
  showPlayerScreen();

  setOnEnded(() => playNextSong());
  setOnProgress((cur, dur) => {
    updateProgressBar(cur, dur);
    setPlayingState(isPlaying());
  });

  document.getElementById('btn-play').addEventListener('click', () => {
    togglePlay(); setPlayingState(isPlaying());
  });
  document.getElementById('btn-skip').addEventListener('click',  () => playNextSong());
  document.getElementById('btn-prev').addEventListener('click',  playPreviousSong);
  document.getElementById('btn-never').addEventListener('click', handleNeverSuggest);
  document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('cfg_youtube_api_key');
    localStorage.removeItem('cfg_lastfm_api_key');
    window.location.reload();
  });

  // Search bar
  const searchInput = document.getElementById('search-input');
  const searchBtn   = document.getElementById('btn-search');
  const doSearch = () => {
    const q = searchInput.value.trim();
    if (q) handleSearch(q);
  };
  searchBtn.addEventListener('click', doSearch);
  searchInput.addEventListener('keydown', e => { if (e.key === 'Enter') doSearch(); });

  initSession();
}

// ── Session init ──────────────────────────────────────────────

async function initSession() {
  showLoadingState();
  try {
    // Start with global chart top tracks so the player is never empty
    const seeds = await buildInitialQueue(null);
    enqueue(seeds);
    await playNextSong();
  } catch (err) {
    hideLoadingState();
    console.error('Init failed:', err);
    showError('Could not load songs. Check your API keys in Setup.');
  }
}

// ── Search ────────────────────────────────────────────────────

async function handleSearch(query) {
  showLoadingState();
  try {
    const results = await searchForSong(query);
    if (!results.length) {
      showError(`No results for "${query}". Try a different spelling.`);
      hideLoadingState();
      return;
    }
    const track = results[0];
    await playTrack(track);
    showInfo(`Playing: ${track.name} — ${track.artists[0].name}`);
  } catch (err) {
    hideLoadingState();
    showError('Search failed. Check your API keys.');
    console.error(err);
  }
}

// ── Playback ──────────────────────────────────────────────────

// Play a specific track (e.g. from search). Queues similar songs after it.
async function playTrack(track) {
  showLoadingState();
  const rich = await enrichTrack(track);
  if (!rich) {
    showError('No YouTube video found for this song. Skipping.');
    hideLoadingState();
    return playNextSong();
  }

  if (currentTrack) historyPush(currentTrack);
  currentTrack = rich;

  loadVideo(rich.youtubeId);
  updateCard(rich);
  hideLoadingState();
  setPlayingState(true);

  // Queue similar songs in the background
  queueSimilarSongs(rich.artists[0].name, rich.name);
}

// Play the next song from the queue.
async function playNextSong() {
  showLoadingState();

  let track = dequeue();
  if (!track) {
    // Queue is empty — refill from chart then retry
    await refillQueue(null);
    track = dequeue();
  }
  if (!track) {
    hideLoadingState();
    showError('No songs in queue. Try searching for a song.');
    return;
  }

  // Resolve YouTube video ID (lazy — only when we're about to play)
  const rich = await enrichTrack(track);
  if (!rich) {
    hideLoadingState();
    return playNextSong();   // skip tracks with no YouTube result
  }

  if (currentTrack) historyPush(currentTrack);
  currentTrack = rich;

  loadVideo(rich.youtubeId);
  updateCard(rich);
  updateQueueSidebar(peekAll());
  hideLoadingState();
  setPlayingState(true);

  // Background: queue similar songs so the next batch is ready
  if (queueLength() < QUEUE_LOW_WATERMARK) {
    queueSimilarSongs(rich.artists[0].name, rich.name);
  }
}

// Fetch Last.fm similar tracks and add them to the queue (background).
async function queueSimilarSongs(artist, title) {
  try {
    const similar = await getNextSongs(artist, title);
    if (similar.length) {
      enqueue(similar);
      updateQueueSidebar(peekAll());
    }
  } catch (err) {
    console.warn('Could not load similar songs:', err);
  }
}

async function refillQueue(artistHint) {
  const seeds = await buildInitialQueue(artistHint).catch(() => []);
  enqueue(seeds);
}

// ── History / prev ────────────────────────────────────────────

function historyPush(track) {
  historyStack.unshift(track);
  if (historyStack.length > 10) historyStack.pop();
}

async function playPreviousSong() {
  if (!historyStack.length) return;
  const prev = historyStack.shift();
  if (currentTrack) historyStack.unshift(currentTrack);
  currentTrack = prev;
  loadVideo(prev.youtubeId);
  updateCard(prev);
  setPlayingState(true);
}

// ── Never suggest ─────────────────────────────────────────────

function handleNeverSuggest() {
  if (!currentTrack) return;
  addToNeverSuggest(currentTrack.id);
  showInfo(`"${currentTrack.name}" won't appear again.`);
  playNextSong();
}
