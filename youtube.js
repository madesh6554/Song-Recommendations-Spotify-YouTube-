// youtube.js — Hidden IFrame player only.
// Song discovery / search is handled by music.js.

let player           = null;
let playerReady      = false;
let onEndedCallback  = null;
let progressInterval = null;
let onProgressCallback = null;

// Called automatically by YouTube IFrame API when the script loads.
window.onYouTubeIframeAPIReady = function () {
  player = new YT.Player('yt-player', {
    height: '0',
    width:  '0',
    playerVars: { autoplay: 1, controls: 0, rel: 0, modestbranding: 1 },
    events: {
      onReady:       () => { playerReady = true; },
      onStateChange: handleStateChange,
      onError:       handlePlayerError,
    },
  });
};

function handleStateChange(event) {
  const S = YT.PlayerState;
  if (event.data === S.ENDED)                          { stopProgress(); onEndedCallback?.(); }
  if (event.data === S.PLAYING)                        { startProgress(); }
  if (event.data === S.PAUSED || event.data === S.BUFFERING) { stopProgress(); }
}

function handlePlayerError(event) {
  // Codes: 2=bad id, 5=html5, 100=not found, 101/150=embed disallowed
  console.warn('YouTube player error:', event.data);
  onEndedCallback?.();   // treat as "ended" → skip to next song
}

function startProgress() {
  stopProgress();
  progressInterval = setInterval(() => {
    if (!player || !playerReady) return;
    onProgressCallback?.(player.getCurrentTime?.() || 0, player.getDuration?.() || 0);
  }, 500);
}

function stopProgress() {
  if (progressInterval) { clearInterval(progressInterval); progressInterval = null; }
}

// ── Controls ──────────────────────────────────────────────────

export function loadVideo(videoId) {
  const load = () => player.loadVideoById(videoId);
  if (playerReady) { load(); }
  else {
    const t = setInterval(() => { if (playerReady) { clearInterval(t); load(); } }, 200);
  }
}

export function togglePlay() {
  if (!player) return;
  player.getPlayerState() === YT.PlayerState.PLAYING
    ? player.pauseVideo()
    : player.playVideo();
}

export function seekTo(seconds)    { player?.seekTo(seconds, true); }
export function getDuration()      { return player?.getDuration()    || 0; }
export function getCurrentTime()   { return player?.getCurrentTime() || 0; }
export function isPlaying()        { return player?.getPlayerState() === YT.PlayerState.PLAYING; }
export function setOnEnded(fn)     { onEndedCallback    = fn; }
export function setOnProgress(fn)  { onProgressCallback = fn; }
