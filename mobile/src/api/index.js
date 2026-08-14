import axios from 'axios';
import { useAuthStore } from '../store/authStore';

// Local (localhost / LAN IP) → connect directly to backend on :5000
// Tunnel / deployed (ngrok, etc.) → same origin, no extra port
const _h = window.location.hostname;
const _isLocal = _h === 'localhost' || _h === '127.0.0.1'
  || /^(192\.168|10\.|172\.(1[6-9]|2[0-9]|3[01]))\./.test(_h);
const BASE_URL = _isLocal
  ? `http://${_h}:5000`
  : window.location.origin;
const API_URL = `${BASE_URL}/api`;

const api = axios.create({ baseURL: API_URL });

// Keep the Authorization header on the axios instance in permanent sync with the auth store.
function _applyToken(state) {
  const token = (state ?? useAuthStore.getState()).token;
  if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else       delete api.defaults.headers.common['Authorization'];
}
_applyToken();
useAuthStore.subscribe(_applyToken);

// Belt-and-suspenders: also set header per-request so there's no window where it can be missing.
api.interceptors.request.use((config) => {
  const token = useAuthStore.getState().token;
  if (token) config.headers.set('Authorization', `Bearer ${token}`);
  return config;
});

function isTokenExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

// Only logout on definitive 401 with an expired/missing token.
// Transient server 401s (cold start, bug) should NOT clear the session.
api.interceptors.response.use(
  (res) => res,
  (err) => {
    if (err.response?.status === 401) {
      const isAuthEndpoint = err.config?.url?.includes('/auth/');
      if (!isAuthEndpoint) {
        const token = useAuthStore.getState().token;
        if (!token || isTokenExpired(token)) {
          useAuthStore.getState().logout();
        }
      }
    }
    return Promise.reject(err);
  }
);

// Auth
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
};

// Tracks
export const tracksApi = {
  getAll: (page = 1) => api.get(`/tracks?page=${page}`),
  getAllAdmin: () => api.get('/tracks?page=1&pageSize=500'),
  getById: (id) => api.get(`/tracks/${id}`),
  getTrending: () => api.get('/tracks/trending'),
  getNewReleases: () => api.get('/tracks/new-releases'),
  getLiked: () => api.get('/tracks/liked'),
  like: (id) => api.post(`/tracks/${id}/like`),
  logPlay: (id) => api.post(`/tracks/${id}/log-play`),
  getHistory: (limit = 50, offset = 0) => api.get(`/tracks/history?limit=${limit}&offset=${offset}`),
  upload: (formData) => api.post('/tracks', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  update: (id, formData) => api.put(`/tracks/${id}`, formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
  delete: (id) => api.delete(`/tracks/${id}`),
  getRecommendations: (id) => api.get(`/tracks/${id}/recommendations`),
  streamUrl: (id) => `${API_URL}/tracks/${id}/stream`,
};

// Artists
export const artistsApi = {
  getAll: () => api.get('/artists'),
  getById: (id) => api.get(`/artists/${id}`),
  getTracks: (id) => api.get(`/artists/${id}/tracks`),
  getAlbums: (id) => api.get(`/artists/${id}/albums`),
  create: (formData) => api.post('/artists', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// Albums
export const albumsApi = {
  getAll: () => api.get('/albums'),
  getById: (id) => api.get(`/albums/${id}`),
  getTracks: (id) => api.get(`/albums/${id}/tracks`),
  create: (formData) => api.post('/albums', formData, { headers: { 'Content-Type': 'multipart/form-data' } }),
};

// Playlists
export const playlistsApi = {
  getAll: () => api.get('/playlists'),
  getPublic: () => api.get('/playlists/public'),
  getById: (id) => api.get(`/playlists/${id}`),
  getTracks: (id) => api.get(`/playlists/${id}/tracks`),
  create: (data) => api.post('/playlists', data),
  update: (id, data) => api.put(`/playlists/${id}`, data),
  delete: (id) => api.delete(`/playlists/${id}`),
  addTrack: (id, trackId) => api.post(`/playlists/${id}/tracks`, { trackId }),
  removeTrack: (id, trackId) => api.delete(`/playlists/${id}/tracks/${trackId}`),
  reorder: (id, trackIds) => api.put(`/playlists/${id}/reorder`, { trackIds }),
};

// Search (local)
export const searchApi = {
  search: (q) => api.get(`/search?q=${encodeURIComponent(q)}`),
  getRecommendations: (limit = 12) => api.get(`/search/recommendations?limit=${limit}`),
};

// Stats
export const statsApi = {
  get: () => api.get('/tracks/stats'),
};

// External search (YouTube Music, SoundCloud)
export const externalSearchApi = {
  search: (q, source = 'youtube', limit = 8) =>
    api.get(`/externalsearch?q=${encodeURIComponent(q)}&source=${source}&limit=${limit}`),
  getPreviewUrl: (url) =>
    api.get(`/externalsearch/previewurl?url=${encodeURIComponent(url)}`),
  searchLyrics: (q) =>
    api.get(`/externalsearch/lyrics?q=${encodeURIComponent(q)}`),
  fetchLyrics: (artist, title) =>
    api.get(`/externalsearch/fetchlyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`),
  soundcloudUser: (username, type = 'tracks', limit = 50) =>
    api.get(`/externalsearch/soundcloud/user?username=${encodeURIComponent(username)}&type=${type}&limit=${limit}`),
  fillLyrics: (maxTracks = 50) =>
    api.post(`/externalsearch/fill-lyrics?maxTracks=${maxTracks}`),
  radio: (trackId, limit = 5) =>
    api.get(`/externalsearch/radio?trackId=${trackId}&limit=${limit}`),
};

// Download (yt-dlp)
export const downloadApi = {
  getInfo: (url) => api.get(`/download/info?url=${encodeURIComponent(url)}`),
  download: (data) => api.post('/download', data),
  getPlaylistInfo: (url) => api.get(`/download/playlist-info?url=${encodeURIComponent(url)}`),
  downloadPlaylist: (data) => api.post('/download/playlist', data),
};

// Files — served directly as static files from wwwroot/uploads/
export const fileUrl = (type, fileName) => fileName ? `${BASE_URL}/uploads/${type}/${fileName}` : null;

// Spotify API
export const spotifyApi = {
  getPlaylist: (url, clientId, clientSecret) => api.get('/spotify/playlist', { params: { url, clientId, clientSecret } })
};

// Users
export const usersApi = {
  updateMe: (data) => api.put('/users/me', data),
  becomeArtist: () => api.post('/users/become-artist'),
};

export { BASE_URL as apiBase };
export default api;
