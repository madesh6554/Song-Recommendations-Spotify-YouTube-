import { YOUTUBE_API_KEY } from './config.js';
import { getCachedVideoId, cacheVideoId } from './queue.js';

let player          = null;
let playerReady     = false;
let onEndedCallback = null;
let progressInterval = null;
let onProgressCallback = null;

// ── IFrame API bootstrap ──────────────────────────────────────
// YouTube calls this global function when the API script loads.
window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player('yt-player', {
    height: '0',
    width:  '0',
    playerVars: {
      autoplay: 1,
      controls: 0,
      rel:      0,
      modestbranding: 1,
    },
    events: {
      onReady:       () => { playerReady = true; },
      onStateChange: handleStateChange,
      onError:       handlePlayerError,
    },
  });
};

function handleStateChange(event) {
  const S = YT.PlayerState;
  if (event.data === S.ENDED) {
    stopProgressPolling();
    onEndedCallback?.();
  }
  if (event.data === S.PLAYING) {
    startProgressPolling();
  }
  if (event.data === S.PAUSED || event.data === S.BUFFERING) {
    stopProgressPolling();
  }
}

function handlePlayerError(event) {
  // error codes: 2=bad videoId, 5=html5 issue, 100=not found, 101/150=embedding disallowed
  console.warn('YouTube player error:', event.data);
  onEndedCallback?.();  // treat error as "song ended" → skip to next
}

// ── Progress polling ──────────────────────────────────────────

function startProgressPolling() {
  stopProgressPolling();
  progressInterval = setInterval(() => {
    if (!player || !playerReady) return;
    const current  = player.getCurrentTime?.() || 0;
    const duration = player.getDuration?.()    || 0;
    onProgressCallback?.(current, duration);
  }, 500);
}

function stopProgressPolling() {
  if (progressInterval) {
    clearInterval(progressInterval);
    progressInterval = null;
  }
}

// ── YouTube Data API search ───────────────────────────────────

export async function searchYouTube(spotifyTrackId, title, artist) {
  const cached = getCachedVideoId(spotifyTrackId);
  if (cached) return cached;

  const query = encodeURIComponent(`${title} ${artist} official audio`);
  const url   = `https://www.googleapis.com/youtube/v3/search`
    + `?part=snippet&type=video&maxResults=3&q=${query}&key=${YOUTUBE_API_KEY}`;

  const res = await fetch(url);
  if (res.status === 403) throw new Error('YOUTUBE_QUOTA_EXCEEDED');
  if (!res.ok) throw new Error(`YouTube search failed: ${res.status}`);

  const data = await res.json();
  const items = data.items || [];
  if (!items.length) return null;

  const videoId = items[0].id.videoId;
  cacheVideoId(spotifyTrackId, videoId);
  return videoId;
}

// ── Player controls ───────────────────────────────────────────

export function loadVideo(videoId) {
  if (!player) return;
  if (playerReady) {
    player.loadVideoById(videoId);
  } else {
    // API not ready yet — wait and retry
    const wait = setInterval(() => {
      if (playerReady) {
        clearInterval(wait);
        player.loadVideoById(videoId);
      }
    }, 200);
  }
}

export function playVideo() {
  player?.playVideo();
}

export function pauseVideo() {
  player?.pauseVideo();
}

export function togglePlay() {
  if (!player) return;
  const state = player.getPlayerState();
  if (state === YT.PlayerState.PLAYING) {
    player.pauseVideo();
  } else {
    player.playVideo();
  }
}

export function seekTo(seconds) {
  player?.seekTo(seconds, true);
}

export function getDuration() {
  return player?.getDuration() || 0;
}

export function getCurrentTime() {
  return player?.getCurrentTime() || 0;
}

export function isPlaying() {
  return player?.getPlayerState() === YT.PlayerState.PLAYING;
}

export function setOnEnded(fn) {
  onEndedCallback = fn;
}

export function setOnProgress(fn) {
  onProgressCallback = fn;
}
