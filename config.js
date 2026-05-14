function getKey(name) {
  return localStorage.getItem(name) || '';
}

export const YOUTUBE_API_KEY = getKey('cfg_youtube_api_key');
export const LASTFM_API_KEY  = getKey('cfg_lastfm_api_key');

export const MAX_HEARD_HISTORY   = 300;
export const QUEUE_LOW_WATERMARK = 4;
export const INITIAL_QUEUE_SIZE  = 10;

export function keysConfigured() {
  return !!(getKey('cfg_youtube_api_key') && getKey('cfg_lastfm_api_key'));
}

export function saveSetup({ youtubeKey, lastfmKey }) {
  localStorage.setItem('cfg_youtube_api_key', youtubeKey);
  localStorage.setItem('cfg_lastfm_api_key',  lastfmKey);
}
