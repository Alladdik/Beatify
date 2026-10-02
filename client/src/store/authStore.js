import { create } from 'zustand';
import { API_URL } from '../lib/config';

function isExpired(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1]));
    return payload.exp && payload.exp * 1000 < Date.now();
  } catch {
    return true;
  }
}

function getInitialAuth() {
  try {
    const token = localStorage.getItem('beatify_token');
    if (!token || isExpired(token)) {
      // Only clear if genuinely expired/missing — don't wipe on parse errors
      if (token) {
        localStorage.removeItem('beatify_token');
        localStorage.removeItem('beatify_user');
      }
      return { token: null, user: null, isAuthenticated: false };
    }

    const raw = localStorage.getItem('beatify_user');
    let user = null;
    try { user = JSON.parse(raw || 'null'); } catch { /* malformed user data — token still valid */ }

    return { token, user, isAuthenticated: true };
  } catch {
    return { token: null, user: null, isAuthenticated: false };
  }
}

export const useAuthStore = create((set, get) => ({
  ...getInitialAuth(),

  login: (token, user) => {
    localStorage.setItem('beatify_token', token);
    localStorage.setItem('beatify_user', JSON.stringify(user));
    set({ token, user, isAuthenticated: true });
  },

  logout: () => {
    localStorage.removeItem('beatify_token');
    localStorage.removeItem('beatify_user');
    set({ token: null, user: null, isAuthenticated: false });
  },

  syncFromStorage: () => {
    const stored = getInitialAuth();
    const current = get();
    if (current.isAuthenticated !== stored.isAuthenticated ||
        current.token !== stored.token) {
      set(stored);
    }
  },

  // Verify token with server — call once on app start.
  // ONLY logout on definitive 401. Any other error (404, 500, network) → keep session.
  verifyToken: async () => {
    const { token, logout } = get();
    if (!token) return;
    try {
      const res = await fetch(`${API_URL}/auth/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (res.status === 401) {
        logout();
      } else if (res.ok) {
        const user = await res.json();
        localStorage.setItem('beatify_user', JSON.stringify(user));
        set({ user, isAuthenticated: true });
      }
    } catch {
      // Network error or server down, do not logout
    }
  },
}));
