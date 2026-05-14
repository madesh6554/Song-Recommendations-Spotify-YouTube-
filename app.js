import { QUEUE_LOW_WATERMARK } from './config.js';
import { isAuthenticated, handleCallback, redirectToSpotify, getValidToken, logout } from './auth.js';
import { buildRecommendations, fetchRecentlyPlayed } from './spotify.js';
import { enqueue, dequeue, peekAll, queueLength, addToNeverSuggest } from './queue.js';
import { searchYouTube, loadVideo, togglePlay, setOnEnded, setOnProgress, isPlaying } from './youtube.js';
import {
  showLoginScreen, showPlayerScreen,
  updateCard, updateProgressBar, updateQueueSidebar,
  setPlayingState, showLoadingState, hideLoadingState,
  showError, showInfo,
} from './player.js';

// ── State ─────────────────────────────────────────────────────
let currentTrack  = null;
let historyStack  = [];   // [{track, videoId}, …] last 10

// ── Boot ──────────────────────────────────────────────────────

document.addEventListener('DOMContentLoaded', async () => {
  // Wire static buttons
  document.getElementById('btn-login').addEventListener('click', redirectToSpotify);
  document.getElementById('btn-logout').addEventListener('click', logout);
  document.getElementById('btn-play').addEventListener('click', handlePlayPause);
  document.getElementById('btn-skip').addEventListener('click', () => playNextSong());
  document.getElementById('btn-prev').addEventListener('click', playPreviousSong);
  document.getElementById('btn-never').addEventListener('click', handleNeverSuggest);

  // Wire YouTube callbacks
  setOnEnded(() => playNextSong());
  setOnProgress((current, duration) => {
    updateProgressBar(current, duration);
    setPlayingState(isPlaying());
  });

  // Handle Spotify OAuth callback
  const callbackHandled = await handleCallback().catch(() => false);
  if (callbackHandled) showInfo('Connected to Spotify!');

  if (!isAuthenticated()) {
    showLoginScreen();
    return;
  }

  showPlayerScreen();
  await initSession();
});

// ── Session init ──────────────────────────────────────────────

async function initSession() {
  showLoadingState();
  try {
    const token = await getValidToken();

    // Prepopulate heard list so we don't replay recent history
    const recentIds = await fetchRecentlyPlayed(token).catch(() => []);
    const { prepopulateHeard } = await import('./queue.js');
    prepopulateHeard(recentIds);

    // Fetch first batch of recommendations
    const tracks = await buildRecommendations(token);
    if (!tracks.length) {
      showError('No recommendations found. Try listening to more music on Spotify first.');
      hideLoadingState();
      return;
    }

    enqueue(tracks);
    await playNextSong();
  } catch (err) {
    console.error('Session init failed:', err);
    showError('Could not load recommendations. Check your API keys in config.js.');
    hideLoadingState();
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
    showError('No new songs available. Your heard list may be full — clearing it soon.');
    hideLoadingState();
    return;
  }

  try {
    let videoId = await searchYouTube(track.id, track.name, track.artists[0].name);

    if (!videoId) {
      // No YouTube result for this track — silently skip
      return playNextSong();
    }

    // Save to history before switching
    if (currentTrack) {
      historyStack.unshift({ track: currentTrack, videoId: currentVideoId() });
      if (historyStack.length > 10) historyStack.pop();
    }

    currentTrack = track;
    loadVideo(videoId);
    updateCard(track);
    updateQueueSidebar(peekAll());
    hideLoadingState();
    setPlayingState(true);

    if (queueLength() < QUEUE_LOW_WATERMARK) {
      refillQueue();  // background, no await
    }
  } catch (err) {
    hideLoadingState();
    if (err.message === 'YOUTUBE_QUOTA_EXCEEDED') {
      showError('YouTube search limit reached for today. Try again tomorrow or add your own API key.');
    } else {
      console.error('playNextSong error:', err);
      showError('Error loading song — skipping.');
      playNextSong();
    }
  }
}

function currentVideoId() {
  // Retrieve current videoId from the YouTube player URL
  try {
    return window._lastLoadedVideoId || null;
  } catch {
    return null;
  }
}

async function playPreviousSong() {
  if (!historyStack.length) return;
  const prev = historyStack.shift();

  if (currentTrack) {
    // Re-enqueue current song at the front of the queue
    const { queue } = await import('./queue.js');
    // We use enqueue but want to prepend, so splice directly:
    // Actually just use the loadVideo path — no need to re-enqueue
  }

  currentTrack = prev.track;
  loadVideo(prev.videoId);
  updateCard(prev.track);
  updateQueueSidebar(peekAll());
  setPlayingState(true);
}

function handlePlayPause() {
  togglePlay();
  setPlayingState(isPlaying());
}

function handleNeverSuggest() {
  if (!currentTrack) return;
  addToNeverSuggest(currentTrack.id);
  showInfo(`"${currentTrack.name}" won't be suggested again.`);
  playNextSong();
}

// ── Queue refill ──────────────────────────────────────────────

async function refillQueue(fallback = false) {
  try {
    const token  = await getValidToken();
    const tracks = await buildRecommendations(token, fallback);

    if (!tracks.length && !fallback) {
      return refillQueue(true);  // retry with long_term seeds
    }

    enqueue(tracks);
    updateQueueSidebar(peekAll());
  } catch (err) {
    console.error('Queue refill failed:', err);
  }
}
