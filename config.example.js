// Rename this file to config.js and fill in your values
//
// SPOTIFY: https://developer.spotify.com/dashboard
// YOUTUBE: https://console.cloud.google.com → YouTube Data API v3

export const SPOTIFY_CLIENT_ID    = 'YOUR_SPOTIFY_CLIENT_ID_HERE';
export const SPOTIFY_REDIRECT_URI = 'https://YOUR-USERNAME.github.io/YOUR-REPO-NAME/index.html';
export const YOUTUBE_API_KEY      = 'YOUR_YOUTUBE_API_KEY_HERE';

export const SPOTIFY_SCOPES = [
  'user-top-read',
  'user-read-recently-played',
].join(' ');

export const MAX_HEARD_HISTORY   = 200;
export const QUEUE_LOW_WATERMARK = 5;
export const INITIAL_QUEUE_SIZE  = 20;
