// music.js — YouTube-based music recommendation engine
// Searches YouTube for songs by the user's favourite artists
// and artists with a similar sound, building a fresh queue.

import { YOUTUBE_API_KEY, getArtists, INITIAL_QUEUE_SIZE } from './config.js';

const YT_SEARCH = 'https://www.googleapis.com/youtube/v3/search';
const YT_VIDEO  = 'https://www.googleapis.com/youtube/v3/videos';

// Search templates — rotated randomly so the queue never sounds the same
const TEMPLATES = [
  '{artist} official audio',
  '{artist} official music video',
  '{artist} lyrics',
  '{artist} new songs 2024',
  'best of {artist}',
  'songs like {artist}',
  '{artist} top hits',
  '{artist} greatest hits playlist',
];

function randomItem(arr) {
  return arr[Math.floor(Math.random() * arr.length)];
}

function shuffle(arr) {
  return [...arr].sort(() => Math.random() - 0.5);
}

// Search YouTube for music videos matching a query.
// Returns array of track objects compatible with the rest of the app.
async function searchSongs(query) {
  const params = new URLSearchParams({
    part:            'snippet',
    type:            'video',
    videoCategoryId: '10',          // Music category only
    maxResults:      '8',
    q:               query,
    key:             YOUTUBE_API_KEY,
  });

  const res = await fetch(`${YT_SEARCH}?${params}`);
  if (res.status === 403) throw new Error('YOUTUBE_QUOTA_EXCEEDED');
  if (!res.ok) throw new Error(`YouTube search failed: ${res.status}`);

  const data = await res.json();
  return (data.items || [])
    .filter(item => item.id?.videoId)
    .map(item => ({
      id:        item.id.videoId,          // used as unique ID + played in YouTube player
      youtubeId: item.id.videoId,
      name:      item.snippet.title,
      artists:   [{ name: item.snippet.channelTitle }],
      album: {
        name:   '',
        images: [{ url: item.snippet.thumbnails?.high?.url
                     || item.snippet.thumbnails?.default?.url
                     || '' }],
      },
    }));
}

// Build a queue of fresh songs from the user's favourite artists.
export async function buildRecommendations() {
  const artists = shuffle(getArtists());
  if (!artists.length) throw new Error('No artists configured.');

  const results = [];

  for (const artist of artists) {
    const template = randomItem(TEMPLATES);
    const query    = template.replace('{artist}', artist);
    try {
      const tracks = await searchSongs(query);
      results.push(...tracks);
    } catch (err) {
      if (err.message === 'YOUTUBE_QUOTA_EXCEEDED') throw err;
      // skip this artist if search fails
    }
  }

  // If we have fewer results than needed, add a "similar to" search
  if (results.length < INITIAL_QUEUE_SIZE) {
    const anchor = randomItem(artists);
    try {
      const extra = await searchSongs(`songs similar to ${anchor}`);
      results.push(...extra);
    } catch { /* ignore */ }
  }

  return shuffle(results).slice(0, INITIAL_QUEUE_SIZE * 2);
}
