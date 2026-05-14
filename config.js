// Keys are stored in localStorage so they never get committed to GitHub.
// On first visit the app shows a setup screen to collect them.

function getKey(name) {
  return localStorage.getItem(name) || '';
}

export const SPOTIFY_CLIENT_ID    = getKey('cfg_spotify_client_id');
export const SPOTIFY_REDIRECT_URI = getKey('cfg_spotify_redirect_uri');
export const YOUTUBE_API_KEY      = getKey('cfg_youtube_api_key');

export const SPOTIFY_SCOPES = [
  'user-top-read',
  'user-read-recently-played',
].join(' ');

export const MAX_HEARD_HISTORY   = 200;
export const QUEUE_LOW_WATERMARK = 5;
export const INITIAL_QUEUE_SIZE  = 20;

export function keysConfigured() {
  return !!(getKey('cfg_spotify_client_id') && getKey('cfg_youtube_api_key'));
}

export function saveKeys({ clientId, redirectUri, youtubeKey }) {
  localStorage.setItem('cfg_spotify_client_id',    clientId);
  localStorage.setItem('cfg_spotify_redirect_uri', redirectUri);
  localStorage.setItem('cfg_youtube_api_key',      youtubeKey);
}
