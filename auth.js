import { SPOTIFY_CLIENT_ID, SPOTIFY_REDIRECT_URI, SPOTIFY_SCOPES } from './config.js';

const LS_ACCESS_TOKEN  = 'sp_access_token';
const LS_REFRESH_TOKEN = 'sp_refresh_token';
const LS_TOKEN_EXPIRY  = 'sp_token_expiry';
const SS_VERIFIER      = 'sp_code_verifier';

// ── PKCE helpers ──────────────────────────────────────────────

function generateCodeVerifier() {
  const array = new Uint8Array(64);
  crypto.getRandomValues(array);
  return base64urlEncode(array);
}

async function generateCodeChallenge(verifier) {
  const encoder = new TextEncoder();
  const data = encoder.encode(verifier);
  const digest = await crypto.subtle.digest('SHA-256', data);
  return base64urlEncode(new Uint8Array(digest));
}

function base64urlEncode(uint8Array) {
  return btoa(String.fromCharCode(...uint8Array))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');
}

// ── Public API ────────────────────────────────────────────────

export function isAuthenticated() {
  const token  = localStorage.getItem(LS_ACCESS_TOKEN);
  const expiry = parseInt(localStorage.getItem(LS_TOKEN_EXPIRY) || '0', 10);
  return !!token && Date.now() < expiry;
}

export async function redirectToSpotify() {
  const verifier   = generateCodeVerifier();
  const challenge  = await generateCodeChallenge(verifier);
  sessionStorage.setItem(SS_VERIFIER, verifier);

  const params = new URLSearchParams({
    response_type:         'code',
    client_id:             SPOTIFY_CLIENT_ID,
    scope:                 SPOTIFY_SCOPES,
    redirect_uri:          SPOTIFY_REDIRECT_URI,
    code_challenge_method: 'S256',
    code_challenge:        challenge,
  });

  window.location.href = `https://accounts.spotify.com/authorize?${params}`;
}

export async function handleCallback() {
  const params = new URLSearchParams(window.location.search);
  const code   = params.get('code');
  if (!code) return false;

  const verifier = sessionStorage.getItem(SS_VERIFIER);
  if (!verifier) return false;

  const body = new URLSearchParams({
    grant_type:    'authorization_code',
    code,
    redirect_uri:  SPOTIFY_REDIRECT_URI,
    client_id:     SPOTIFY_CLIENT_ID,
    code_verifier: verifier,
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    console.error('Token exchange failed', await res.text());
    return false;
  }

  const data = await res.json();
  storeTokens(data);
  sessionStorage.removeItem(SS_VERIFIER);

  // Clean ?code= from URL so refresh doesn't re-exchange
  history.replaceState(null, '', window.location.pathname);
  return true;
}

export async function getValidToken() {
  const expiry = parseInt(localStorage.getItem(LS_TOKEN_EXPIRY) || '0', 10);

  if (Date.now() > expiry - 60_000) {
    await refreshAccessToken();
  }

  return localStorage.getItem(LS_ACCESS_TOKEN);
}

async function refreshAccessToken() {
  const refreshToken = localStorage.getItem(LS_REFRESH_TOKEN);
  if (!refreshToken) throw new Error('No refresh token');

  const body = new URLSearchParams({
    grant_type:    'refresh_token',
    refresh_token: refreshToken,
    client_id:     SPOTIFY_CLIENT_ID,
  });

  const res = await fetch('https://accounts.spotify.com/api/token', {
    method:  'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!res.ok) {
    logout();
    throw new Error('Token refresh failed — logged out');
  }

  const data = await res.json();
  storeTokens(data);
}

function storeTokens(data) {
  localStorage.setItem(LS_ACCESS_TOKEN,  data.access_token);
  localStorage.setItem(LS_TOKEN_EXPIRY,  Date.now() + data.expires_in * 1000);
  if (data.refresh_token) {
    localStorage.setItem(LS_REFRESH_TOKEN, data.refresh_token);
  }
}

export function logout() {
  localStorage.removeItem(LS_ACCESS_TOKEN);
  localStorage.removeItem(LS_REFRESH_TOKEN);
  localStorage.removeItem(LS_TOKEN_EXPIRY);
  window.location.reload();
}
