import { INITIAL_QUEUE_SIZE } from './config.js';

const BASE = 'https://api.spotify.com/v1';

async function spotifyFetch(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '3', 10);
    await new Promise(r => setTimeout(r, retryAfter * 1000));
    return spotifyFetch(path, token);
  }

  if (!res.ok) throw new Error(`Spotify ${res.status}: ${path}`);
  return res.json();
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

function dedupe(tracks) {
  const seen = new Set();
  return tracks.filter(t => t?.id && !seen.has(t.id) && seen.add(t.id));
}

// ── User profile (to get market/country code) ─────────────────
async function fetchUserMarket(token) {
  try {
    const data = await spotifyFetch('/me', token);
    return data.country || 'US';
  } catch {
    return 'US';
  }
}

// ── Top tracks & artists (still free in 2024) ─────────────────
export async function fetchTopTracks(token, limit = 20, timeRange = 'medium_term') {
  const data = await spotifyFetch(
    `/me/top/tracks?limit=${limit}&time_range=${timeRange}`,
    token
  );
  return data.items || [];
}

export async function fetchTopArtists(token, limit = 10, timeRange = 'medium_term') {
  const data = await spotifyFetch(
    `/me/top/artists?limit=${limit}&time_range=${timeRange}`,
    token
  );
  return data.items || [];
}

export async function fetchRecentlyPlayed(token, limit = 50) {
  const data = await spotifyFetch(
    `/me/player/recently-played?limit=${limit}`,
    token
  );
  return (data.items || []).map(item => item.track.id);
}

// Get an artist's popular tracks — returns full track objects with album art
async function fetchArtistTopTracks(token, artistId, market) {
  const data = await spotifyFetch(
    `/artists/${artistId}/top-tracks?market=${market}`,
    token
  );
  return data.tracks || [];
}

// ── Recommendation engine ─────────────────────────────────────
//
// Strategy (uses ONLY free, non-deprecated Spotify endpoints):
//   1. Get user's top artists (medium or long term)
//   2. For each top artist → fetch their top tracks (free endpoint)
//   3. Mix in user's own top tracks from a different time range for variety
//   4. Deduplicate + shuffle → the heard-list in queue.js filters repeats
//
// This gives fresh songs by artists in the user's taste profile.

export async function buildRecommendations(token, fallbackToLongTerm = false) {
  const timeRange = fallbackToLongTerm ? 'long_term' : 'medium_term';
  const market    = await fetchUserMarket(token);

  // Fetch user's top artists and a different time-range of top tracks in parallel
  const altRange  = fallbackToLongTerm ? 'short_term' : 'long_term';
  const [topArtists, altTopTracks] = await Promise.all([
    fetchTopArtists(token, 10, timeRange),
    fetchTopTracks(token, 20, altRange).catch(() => []),
  ]);

  if (!topArtists.length && !altTopTracks.length) {
    throw new Error('No listening history found on this Spotify account yet.');
  }

  // Fetch top tracks for each of the user's top artists (in parallel, errors skipped)
  const artistTrackGroups = await Promise.all(
    topArtists.map(a =>
      fetchArtistTopTracks(token, a.id, market).catch(() => [])
    )
  );

  // Combine: artist top-tracks + user's alt-range top tracks
  const allTracks = [...artistTrackGroups.flat(), ...altTopTracks];
  const unique    = dedupe(allTracks);
  const shuffled  = shuffle(unique);

  return shuffled.slice(0, INITIAL_QUEUE_SIZE * 2); // extra buffer for the heard-list filter
}
