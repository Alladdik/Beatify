import axios from 'axios';
import { useAuthStore } from '../store/authStore';
import { API_ORIGIN, API_URL, fileUrl, streamUrl } from '../lib/config';

const api = axios.create({ baseURL: API_URL, timeout: 30000 });

// Keep the Authorization header on the axios instance in permanent sync with the auth store.
function _applyToken(state) {
  const token = (state ?? useAuthStore.getState()).token;
  if (token) api.defaults.headers.common['Authorization'] = `Bearer ${token}`;
  else       delete api.defaults.headers.common['Authorization'];
}
_applyToken();
useAuthStore.subscribe(_applyToken);

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
        if (!token || isTokenExpired(token)) useAuthStore.getState().logout();
      }
    }
    return Promise.reject(err);
  }
);

/** Human message from any axios error (server `message` first). */
export const errMsg = (err, fallback = 'Щось пішло не так') =>
  err?.response?.data?.message || err?.response?.data?.title || (err?.code === 'ECONNABORTED' ? 'Сервер відповідає надто довго' : null) || fallback;

const multipart = { headers: { 'Content-Type': 'multipart/form-data' } };

// Auth
export const authApi = {
  register: (data) => api.post('/auth/register', data),
  login: (data) => api.post('/auth/login', data),
  me: () => api.get('/auth/me'),
  config: () => api.get('/auth/config'),
};

// Tracks
export const tracksApi = {
  getAll: (page = 1, pageSize = 60) => api.get(`/tracks?page=${page}&pageSize=${pageSize}`),
  getAllAdmin: () => api.get('/tracks?page=1&pageSize=500'),
  getById: (id) => api.get(`/tracks/${id}`),
  getTrending: () => api.get('/tracks/trending'),
  getNewReleases: () => api.get('/tracks/new-releases'),
  getLiked: () => api.get('/tracks/liked'),
  like: (id) => api.post(`/tracks/${id}/like`),
  logPlay: (id, seconds) => api.post(`/tracks/${id}/log-play`, null, { params: { seconds } }),
  getHistory: (limit = 50, offset = 0) => api.get(`/tracks/history?limit=${limit}&offset=${offset}`),
  upload: (formData) => api.post('/tracks', formData, multipart),
  // An artist releasing their own track (also Studio → Publish)
  uploadMine: (formData, onProgress) => api.post('/tracks/mine', formData, { ...multipart, timeout: 0, onUploadProgress: onProgress }),
  update: (id, formData) => api.put(`/tracks/${id}`, formData, multipart),
  delete: (id) => api.delete(`/tracks/${id}`),
  getRecommendations: (id) => api.get(`/tracks/${id}/recommendations`),
  getLyrics: (id) => api.get(`/tracks/${id}/lyrics`),
  streamUrl,
};

// Artists
export const artistsApi = {
  getAll: () => api.get('/artists'),
  getById: (id) => api.get(`/artists/${id}`),
  getTracks: (id) => api.get(`/artists/${id}/tracks`),
  getAlbums: (id) => api.get(`/artists/${id}/albums`),
  getSimilar: (id) => api.get(`/artists/${id}/similar`),
  create: (formData) => api.post('/artists', formData, multipart),
  // the signed-in artist edits their own page
  updateMine: (formData) => api.put('/artists/mine', formData, multipart),
};

// Albums
export const albumsApi = {
  getAll: () => api.get('/albums'),
  getById: (id) => api.get(`/albums/${id}`),
  getTracks: (id) => api.get(`/albums/${id}/tracks`),
  create: (formData) => api.post('/albums', formData, multipart),
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

// Search (local) + personalised discovery
export const searchApi = {
  search: (q) => api.get(`/search?q=${encodeURIComponent(q)}`),
  getRecommendations: (limit = 12) => api.get(`/search/recommendations?limit=${limit}`),
};

// Smart picks: home shelves, mixes, "because you listened…", similar tracks
export const discoverApi = {
  home: () => api.get('/discover/home'),
  mix: (id) => api.get(`/discover/mix/${encodeURIComponent(id)}`),
  similar: (trackId, limit = 12) => api.get(`/discover/similar/${trackId}?limit=${limit}`),
  library: () => api.get('/discover/library'),
};

// Stats
export const statsApi = {
  get: () => api.get('/tracks/stats'),
};

// External services (YouTube Music, SoundCloud) via yt-dlp
export const externalSearchApi = {
  search: (q, source = 'youtube', limit = 8) =>
    api.get(`/externalsearch?q=${encodeURIComponent(q)}&source=${source}&limit=${limit}`),
  getPreviewUrl: (url) => api.get(`/externalsearch/previewurl?url=${encodeURIComponent(url)}`),
  searchLyrics: (q) => api.get(`/externalsearch/lyrics?q=${encodeURIComponent(q)}`),
  fetchLyrics: (artist, title) =>
    api.get(`/externalsearch/fetchlyrics?artist=${encodeURIComponent(artist)}&title=${encodeURIComponent(title)}`),
  soundcloudUser: (username, type = 'tracks', limit = 50) =>
    api.get(`/externalsearch/soundcloud/user?username=${encodeURIComponent(username)}&type=${type}&limit=${limit}`),
  fillLyrics: (maxTracks = 50) => api.post(`/externalsearch/fill-lyrics?maxTracks=${maxTracks}`),
  radio: (trackId, limit = 5) => api.get(`/externalsearch/radio?trackId=${trackId}&limit=${limit}`),
  // Save an external track (YouTube / SoundCloud) into the library by its page URL
  save: (data) => api.post('/download', data, { timeout: 5 * 60_000 }),
};

// Download (yt-dlp)
export const downloadApi = {
  getInfo: (url) => api.get(`/download/info?url=${encodeURIComponent(url)}`),
  download: (data) => api.post('/download', data),
  getPlaylistInfo: (url) => api.get(`/download/playlist-info?url=${encodeURIComponent(url)}`),
  downloadPlaylist: (data) => api.post('/download/playlist', data),
};

// Studio: cloud projects
export const studioApi = {
  list: () => api.get('/studio/projects'),
  get: (id) => api.get(`/studio/projects/${id}`),
  save: (id, project) => api.put(`/studio/projects/${id}`, JSON.stringify(project), { headers: { 'Content-Type': 'application/json' }, transformRequest: [(d) => d] }),
  remove: (id) => api.delete(`/studio/projects/${id}`),
};

// Spotify metadata import
export const spotifyApi = {
  getPlaylist: (url, clientId, clientSecret) => api.post('/spotify/playlist', { url, clientId, clientSecret }),
};

// Users
export const usersApi = {
  updateMe: (data) => api.put('/users/me', data),
  becomeArtist: () => api.post('/users/become-artist'),
  changePassword: (currentPassword, newPassword) => api.post('/users/me/password', { currentPassword, newPassword }),
  uploadAvatar: (file) => { const fd = new FormData(); fd.append('file', file); return api.post('/users/me/avatar', fd, multipart); },
  removeAvatar: () => api.delete('/users/me/avatar'),
  requestUpload: () => api.post('/users/me/request-upload'),
};

// Admin: who may sign in, upload, import; artist pages
export const adminUsersApi = {
  list: (q = '') => api.get(`/admin/users${q ? `?q=${encodeURIComponent(q)}` : ''}`),
  update: (id, patch) => api.put(`/admin/users/${id}`, patch),
  resetPassword: (id, newPassword) => api.post(`/admin/users/${id}/reset-password`, { newPassword: newPassword || null }),
  makeArtist: (id, artistId) => api.post(`/admin/users/${id}/artist`, { artistId: artistId || null }),
  unlinkArtist: (id) => api.delete(`/admin/users/${id}/artist`),
  remove: (id) => api.delete(`/admin/users/${id}`),
};

export { fileUrl, streamUrl, API_ORIGIN as apiBase, API_URL };
export default api;
