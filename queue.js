import { MAX_HEARD_HISTORY } from './config.js';

const LS_HEARD  = 'yt_sp_heard_ids';
const LS_NEVER  = 'yt_sp_never_ids';
const LS_YT_IDS = 'yt_sp_video_cache';

// ── Internal state ────────────────────────────────────────────
let queue   = [];
let heardSet  = loadSet(LS_HEARD);
let neverSet  = loadSet(LS_NEVER);
let videoCache = loadVideoCache();

// ── localStorage helpers ──────────────────────────────────────

function loadSet(key) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? new Set(JSON.parse(raw)) : new Set();
  } catch {
    return new Set();
  }
}

function saveSet(key, set) {
  localStorage.setItem(key, JSON.stringify([...set]));
}

function loadVideoCache() {
  try {
    const raw = localStorage.getItem(LS_YT_IDS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveVideoCache() {
  localStorage.setItem(LS_YT_IDS, JSON.stringify(videoCache));
}

// ── Heard list ────────────────────────────────────────────────

export function markAsHeard(trackId) {
  heardSet.add(trackId);
  if (heardSet.size > MAX_HEARD_HISTORY) {
    const oldest = heardSet.values().next().value;
    heardSet.delete(oldest);
  }
  saveSet(LS_HEARD, heardSet);
}

export function isHeard(trackId) {
  return heardSet.has(trackId);
}

export function addToNeverSuggest(trackId) {
  neverSet.add(trackId);
  saveSet(LS_NEVER, neverSet);
}

export function isNeverSuggest(trackId) {
  return neverSet.has(trackId);
}

export function prepopulateHeard(trackIds) {
  trackIds.forEach(id => heardSet.add(id));
  saveSet(LS_HEARD, heardSet);
}

// ── YouTube video ID cache ────────────────────────────────────

export function getCachedVideoId(spotifyTrackId) {
  return videoCache[spotifyTrackId] || null;
}

export function cacheVideoId(spotifyTrackId, videoId) {
  videoCache[spotifyTrackId] = videoId;
  saveVideoCache();
}

// ── Queue operations ──────────────────────────────────────────

export function filterTracks(tracks) {
  return tracks.filter(t => !isHeard(t.id) && !isNeverSuggest(t.id));
}

export function enqueue(tracks) {
  const fresh = filterTracks(tracks);
  queue.push(...fresh);
}

export function dequeue() {
  const track = queue.shift();
  if (track) markAsHeard(track.id);
  return track || null;
}

export function peek() {
  return queue[0] || null;
}

export function peekAll() {
  return [...queue];
}

export function queueLength() {
  return queue.length;
}

export function clearQueue() {
  queue = [];
}
