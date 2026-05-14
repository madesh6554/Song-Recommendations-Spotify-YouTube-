import { INITIAL_QUEUE_SIZE } from './config.js';

const BASE = 'https://api.spotify.com/v1';

async function spotifyFetch(path, token) {
  const res = await fetch(`${BASE}${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });

  if (res.status === 429) {
    const retryAfter = parseInt(res.headers.get('Retry-After') || '3', 10);
    await sleep(retryAfter * 1000);
    return spotifyFetch(path, token);
  }

  if (!res.ok) throw new Error(`Spotify ${res.status}: ${path}`);
  return res.json();
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}

function randomSample(arr, n) {
  const shuffled = [...arr].sort(() => Math.random() - 0.5);
  return shuffled.slice(0, n);
}

// ── Public API ────────────────────────────────────────────────

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

async function fetchRelatedArtists(token, artistId) {
  const data = await spotifyFetch(`/artists/${artistId}/related-artists`, token);
  return data.artists || [];
}

async function fetchArtistTopTracks(token, artistId) {
  const data = await spotifyFetch(
    `/artists/${artistId}/top-tracks?market=from_token`,
    token
  );
  return data.tracks || [];
}

// ── Recommendation engine (no /recommendations endpoint needed) ──
//
// Strategy:
//  1. Get user's top artists
//  2. Pick a few randomly → fetch their related artists
//  3. From those related artists, fetch their top tracks
//  4. Shuffle and return — these are songs the user likely hasn't heard
//     but will enjoy (same musical neighbourhood as their taste)

export async function buildRecommendations(token, fallbackToLongTerm = false) {
  const timeRange  = fallbackToLongTerm ? 'long_term' : 'medium_term';
  const topArtists = await fetchTopArtists(token, 10, timeRange);

  if (!topArtists.length) return [];

  // Pick 3 random seed artists from the user's top 10
  const seedArtists = randomSample(topArtists, Math.min(3, topArtists.length));

  // Fetch related artists for each seed (in parallel)
  const relatedGroups = await Promise.all(
    seedArtists.map(a => fetchRelatedArtists(token, a.id).catch(() => []))
  );

  // Flatten, deduplicate, exclude artists the user already knows well
  const knownArtistIds = new Set(topArtists.map(a => a.id));
  const allRelated = relatedGroups
    .flat()
    .filter(a => !knownArtistIds.has(a.id));

  const uniqueRelated = [...new Map(allRelated.map(a => [a.id, a])).values()];

  // Pick up to 5 related artists randomly
  const pickedRelated = randomSample(uniqueRelated, Math.min(5, uniqueRelated.length));

  // Fetch top tracks for each related artist (in parallel)
  const trackGroups = await Promise.all(
    pickedRelated.map(a => fetchArtistTopTracks(token, a.id).catch(() => []))
  );

  // Flatten, shuffle, trim to INITIAL_QUEUE_SIZE
  const allTracks = trackGroups.flat();
  const shuffled  = allTracks.sort(() => Math.random() - 0.5);
  return shuffled.slice(0, INITIAL_QUEUE_SIZE);
}
