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

// ── User profile ──────────────────────────────────────────────
async function fetchUserMarket(token) {
  try {
    const data = await spotifyFetch('/me', token);
    return data.country || 'US';
  } catch {
    return 'US';
  }
}

// ── Core endpoints (all free, non-deprecated) ─────────────────

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

async function fetchArtistTopTracks(token, artistId, market) {
  const data = await spotifyFetch(
    `/artists/${artistId}/top-tracks?market=${market}`,
    token
  );
  return data.tracks || [];
}

// ── Fallback: genre search for new/empty accounts ─────────────
// Uses /search which is always free and always returns results.
const FALLBACK_GENRES = ['pop', 'hip-hop', 'rock', 'r%26b', 'electronic', 'indie', 'latin', 'k-pop'];

async function fetchPopularByGenre(token, market) {
  const genre = FALLBACK_GENRES[Math.floor(Math.random() * FALLBACK_GENRES.length)];
  try {
    const data = await spotifyFetch(
      `/search?q=genre:${genre}&type=track&market=${market}&limit=50`,
      token
    );
    return data.tracks?.items || [];
  } catch {
    // Absolute last resort: search for "top hits"
    try {
      const data = await spotifyFetch(
        `/search?q=top+hits&type=track&market=${market}&limit=50`,
        token
      );
      return data.tracks?.items || [];
    } catch {
      return [];
    }
  }
}

// ── Recommendation engine ─────────────────────────────────────
//
// Primary path  (account has listening history):
//   top artists → each artist's top tracks → shuffle + dedupe
//
// Fallback path (new account / no history):
//   genre search via /search → popular tracks matching user's region

export async function buildRecommendations(token, fallbackToLongTerm = false) {
  const market   = await fetchUserMarket(token);
  const timeRange = fallbackToLongTerm ? 'long_term' : 'medium_term';
  const altRange  = fallbackToLongTerm ? 'short_term' : 'long_term';

  // Try to get personalized data in parallel
  const [topArtists, altTopTracks] = await Promise.all([
    fetchTopArtists(token, 10, timeRange).catch(() => []),
    fetchTopTracks(token, 20, altRange).catch(() => []),
  ]);

  let allTracks = [];

  if (topArtists.length > 0) {
    // Personalized: get top tracks for each of the user's top artists
    const artistTrackGroups = await Promise.all(
      topArtists.map(a => fetchArtistTopTracks(token, a.id, market).catch(() => []))
    );
    allTracks = [...artistTrackGroups.flat(), ...altTopTracks];
  }

  // If still empty (new account or all calls failed) → genre search fallback
  if (allTracks.length === 0) {
    allTracks = await fetchPopularByGenre(token, market);
  }

  // Double fallback: try a different time range
  if (allTracks.length === 0 && !fallbackToLongTerm) {
    return buildRecommendations(token, true);
  }

  return shuffle(dedupe(allTracks)).slice(0, INITIAL_QUEUE_SIZE * 2);
}
