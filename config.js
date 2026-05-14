function getKey(name) {
  return localStorage.getItem(name) || '';
}

export const YOUTUBE_API_KEY = getKey('cfg_youtube_api_key');

export const MAX_HEARD_HISTORY   = 200;
export const QUEUE_LOW_WATERMARK = 5;
export const INITIAL_QUEUE_SIZE  = 20;

export function keysConfigured() {
  return !!(getKey('cfg_youtube_api_key') && getArtists().length > 0);
}

export function getArtists() {
  const raw = localStorage.getItem('cfg_artists') || '';
  return raw.split(',').map(s => s.trim()).filter(Boolean);
}

export function saveSetup({ youtubeKey, artists }) {
  localStorage.setItem('cfg_youtube_api_key', youtubeKey);
  localStorage.setItem('cfg_artists', artists);
}
