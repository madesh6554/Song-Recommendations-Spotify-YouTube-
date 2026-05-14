// music.js — ties Last.fm recommendations to YouTube search
// Flow: Last.fm gives artist+title → YouTube search finds the video ID

import { YOUTUBE_API_KEY } from './config.js';
import { getSimilarTracks, getArtistTopTracks, getChartTopTracks, searchTrack } from './lastfm.js';
import { getCachedVideoId, cacheVideoId } from './queue.js';

const YT_SEARCH = 'https://www.googleapis.com/youtube/v3/search';

// ── YouTube search ────────────────────────────────────────────

export async function findYouTubeVideo(artist, title) {
  const trackId = `${artist}__${title}`.toLowerCase().replace(/\s+/g, '_');

  // Return cached video ID if we searched for this before
  const cached = getCachedVideoId(trackId);
  if (cached) return cached;

  const query  = `${artist} ${title} official audio`;
  const params = new URLSearchParams({
    part:            'snippet',
    type:            'video',
    videoCategoryId: '10',       // Music only
    maxResults:      '3',
    q:               query,
    key:             YOUTUBE_API_KEY,
  });

  const res = await fetch(`${YT_SEARCH}?${params}`);
  if (res.status === 403) throw new Error('YOUTUBE_QUOTA_EXCEEDED');
  if (!res.ok) throw new Error(`YouTube search error: ${res.status}`);

  const data    = await res.json();
  const item    = (data.items || []).find(i => i.id?.videoId);
  if (!item) return null;

  const videoId  = item.id.videoId;
  const thumb    = item.snippet.thumbnails?.high?.url
                || item.snippet.thumbnails?.default?.url
                || '';

  cacheVideoId(trackId, videoId);
  return { videoId, thumb };
}

// Attach a YouTube video ID + thumbnail to a Last.fm track object.
// Returns null if no YouTube result found.
export async function enrichTrack(track) {
  if (track.youtubeId) return track;   // already enriched
  const artist = track.artists[0]?.name || '';
  const result = await findYouTubeVideo(artist, track.name).catch(() => null);
  if (!result) return null;
  return {
    ...track,
    youtubeId: result.videoId,
    album: {
      ...track.album,
      // Use YouTube thumbnail if Last.fm didn't provide an image
      images: track.album.images[0]?.url
        ? track.album.images
        : [{ url: result.thumb }],
    },
  };
}

// ── Recommendation builders ───────────────────────────────────

// Called when a song starts: get similar tracks from Last.fm.
export async function getNextSongs(artist, title) {
  return getSimilarTracks(artist, title, 15).catch(() => []);
}

// Called on first load: seed queue from a given artist or chart.
export async function buildInitialQueue(artistName) {
  if (artistName) {
    const tracks = await getArtistTopTracks(artistName, 15).catch(() => []);
    if (tracks.length) return tracks;
  }
  return getChartTopTracks(20).catch(() => []);
}

// Search YouTube directly for a user query — works for ALL languages.
// Returns a ready-to-play track object (youtubeId already set).
export async function searchYouTubeDirect(query) {
  const params = new URLSearchParams({
    part:            'snippet',
    type:            'video',
    videoCategoryId: '10',
    maxResults:      '5',
    q:               query,
    key:             YOUTUBE_API_KEY,
  });

  const res = await fetch(`${YT_SEARCH}?${params}`);
  if (res.status === 403) throw new Error('YOUTUBE_QUOTA_EXCEEDED');
  if (!res.ok) throw new Error(`YouTube search error: ${res.status}`);

  const data  = await res.json();
  const items = (data.items || []).filter(i => i.id?.videoId);
  if (!items.length) return null;

  const item = items[0];
  const videoId = item.id.videoId;
  const thumb   = item.snippet.thumbnails?.high?.url
                || item.snippet.thumbnails?.default?.url || '';

  return {
    id:        videoId,
    youtubeId: videoId,
    name:      item.snippet.title,
    artists:   [{ name: item.snippet.channelTitle }],
    album:     { images: [{ url: thumb }] },
    // Store raw title + channel so we can extract artist for Last.fm later
    _rawTitle:   item.snippet.title,
    _rawChannel: item.snippet.channelTitle,
  };
}

// Parse "Artist - Song Title" or "Song Title - Artist" from a YouTube video title.
export function parseVideoTitle(title, channel) {
  const clean = title.replace(/\(.*?\)|\[.*?\]/g, '').trim();
  const dash  = clean.match(/^(.+?)\s*[-–|]\s*(.+)$/);
  if (dash) {
    // Heuristic: shorter part is usually the artist name
    const a = dash[1].trim(), b = dash[2].trim();
    return a.length <= b.length
      ? { artist: a, title: b }
      : { artist: b, title: a };
  }
  return { artist: channel, title: clean };
}
