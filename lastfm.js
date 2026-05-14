// lastfm.js — Last.fm API wrapper for music recommendations
// Free API: https://www.last.fm/api/account/create
// Endpoint used: track.getSimilar — same engine Spotify mimics

import { LASTFM_API_KEY } from './config.js';

const BASE = 'https://ws.audioscrobbler.com/2.0/';

async function lfmFetch(params) {
  const url = `${BASE}?${new URLSearchParams({
    ...params,
    api_key: LASTFM_API_KEY,
    format:  'json',
  })}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Last.fm ${res.status}`);
  const data = await res.json();
  if (data.error) throw new Error(`Last.fm error ${data.error}: ${data.message}`);
  return data;
}

// Given the currently playing song, returns similar tracks the user will love.
// This is the core of the Spotify-style "next song" recommendation.
export async function getSimilarTracks(artist, title, limit = 15) {
  const data = await lfmFetch({
    method:      'track.getSimilar',
    artist,
    track:       title,
    limit,
    autocorrect: '1',
  });
  return (data.similartracks?.track || []).map(normaliseLfmTrack);
}

// Get top tracks for an artist — used to seed the initial queue.
export async function getArtistTopTracks(artist, limit = 15) {
  const data = await lfmFetch({
    method:      'artist.getTopTracks',
    artist,
    limit,
    autocorrect: '1',
  });
  return (data.toptracks?.track || []).map(normaliseLfmTrack);
}

// Search Last.fm for a specific song by query string.
export async function searchTrack(query, limit = 5) {
  const data = await lfmFetch({
    method: 'track.search',
    track:  query,
    limit,
  });
  return (data.results?.trackmatches?.track || []).map(normaliseLfmTrack);
}

// Chart top tracks — fallback when no artist seed is available.
export async function getChartTopTracks(limit = 30) {
  const data = await lfmFetch({ method: 'chart.getTopTracks', limit });
  return (data.tracks?.track || []).map(normaliseLfmTrack);
}

// Normalise a Last.fm track into the internal format the rest of the app uses.
function normaliseLfmTrack(t) {
  const artistName = typeof t.artist === 'string' ? t.artist : (t.artist?.name || '');
  const images     = Array.isArray(t.image) ? t.image : [];
  const imgUrl     = (images.find(i => i.size === 'large') || images[2] || images[1] || {})['#text'] || '';

  return {
    // Stable ID so the heard-list can dedup across sessions
    id:        `${artistName}__${t.name}`.toLowerCase().replace(/\s+/g, '_'),
    youtubeId: null,          // filled in by youtube.js just before playback
    name:      t.name || '',
    artists:   [{ name: artistName }],
    album: {
      name:   '',
      images: [{ url: imgUrl }],
    },
  };
}
