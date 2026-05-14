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

export async function fetchTopTracks(token, limit = 10) {
  const data = await spotifyFetch(
    `/me/top/tracks?limit=${limit}&time_range=medium_term`,
    token
  );
  return data.items || [];
}

export async function fetchTopArtists(token, limit = 10) {
  const data = await spotifyFetch(
    `/me/top/artists?limit=${limit}&time_range=medium_term`,
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

export async function fetchRecommendations(token, seedTracks, seedArtists, limit = INITIAL_QUEUE_SIZE) {
  const params = new URLSearchParams({
    limit,
    seed_tracks:  seedTracks.join(','),
    seed_artists: seedArtists.join(','),
  });
  const data = await spotifyFetch(`/recommendations?${params}`, token);
  return data.tracks || [];
}

export async function buildRecommendations(token, fallbackToLongTerm = false) {
  const timeRange = fallbackToLongTerm ? 'long_term' : 'medium_term';
  const limit = 10;

  const [tracksData, artistsData] = await Promise.all([
    spotifyFetch(`/me/top/tracks?limit=${limit}&time_range=${timeRange}`, token),
    spotifyFetch(`/me/top/artists?limit=${limit}&time_range=${timeRange}`, token),
  ]);

  const topTracks  = (tracksData.items  || []).map(t => t.id);
  const topArtists = (artistsData.items || []).map(a => a.id);

  if (!topTracks.length && !topArtists.length) return [];

  const seedTracks  = randomSample(topTracks,  Math.min(2, topTracks.length));
  const seedArtists = randomSample(topArtists, Math.min(3, topArtists.length));

  return fetchRecommendations(token, seedTracks, seedArtists);
}
