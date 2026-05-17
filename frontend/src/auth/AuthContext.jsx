import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;

const ax = axios.create({ baseURL: API, withCredentials: true, timeout: 20000 });

const AuthCtx = createContext({
    user: null,
    loading: true,
    login: async () => {},
    register: async () => {},
    logout: async () => {},
    refreshMe: async () => {},
    setFavorites: async () => {},
});

export function formatApiError(detail) {
    if (detail == null) return 'Something went wrong. Please try again.';
    if (typeof detail === 'string') return detail;
    if (Array.isArray(detail)) {
        return detail
            .map((e) => (e && typeof e.msg === 'string' ? e.msg : JSON.stringify(e)))
            .filter(Boolean)
            .join(' ');
    }
    if (detail && typeof detail.msg === 'string') return detail.msg;
    return String(detail);
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const refreshMe = useCallback(async () => {
        try {
            const { data } = await ax.get('/auth/me');
            setUser(data);
            return data;
        } catch {
            setUser(null);
            return null;
        }
    }, []);

    // On mount: process OAuth callback (fragment) first, else /me
    useEffect(() => {
        let cancelled = false;
        const init = async () => {
            try {
                const hash = window.location.hash || '';
                const m = hash.match(/session_id=([^&]+)/);
                if (m && m[1]) {
                    try {
                        const { data } = await ax.post('/auth/session', { session_id: m[1] });
                        if (!cancelled) setUser(data);
                        // Strip fragment from URL
                        const cleanUrl = window.location.pathname + window.location.search;
                        window.history.replaceState({}, document.title, cleanUrl);
                    } catch (e) {
                        console.warn('OAuth session exchange failed', e);
                    }
                } else {
                    await refreshMe();
                }
            } finally {
                if (!cancelled) setLoading(false);
            }
        };
        init();
        return () => {
            cancelled = true;
        };
    }, [refreshMe]);

    const login = useCallback(async (email, password) => {
        const { data } = await ax.post('/auth/login', { email, password });
        setUser(data);
        return data;
    }, []);

    const register = useCallback(async (email, password, name) => {
        const { data } = await ax.post('/auth/register', { email, password, name });
        setUser(data);
        return data;
    }, []);

    const logout = useCallback(async () => {
        try { await ax.post('/auth/logout'); } catch {}
        setUser(null);
    }, []);

    const setFavorites = useCallback(async (favorites) => {
        if (!user) return favorites;
        try {
            const { data } = await ax.put('/auth/favorites', { favorites });
            setUser((u) => (u ? { ...u, favorites: data.favorites } : u));
            return data.favorites;
        } catch (e) {
            console.warn('favorites save failed', e);
            return user.favorites || [];
        }
    }, [user]);

    const loginWithGoogle = useCallback(() => {
        // REMINDER: DO NOT HARDCODE THE URL, OR ADD ANY FALLBACKS OR REDIRECT URLS, THIS BREAKS THE AUTH
        const redirectUrl = window.location.origin + '/';
        window.location.href = `https://auth.emergentagent.com/?redirect=${encodeURIComponent(redirectUrl)}`;
    }, []);

    return (
        <AuthCtx.Provider value={{ user, loading, login, register, logout, refreshMe, setFavorites, loginWithGoogle }}>
            {children}
        </AuthCtx.Provider>
    );
}

export function useAuth() {
    return useContext(AuthCtx);
}

/** Whether the user has access to premium-only content (paid or trialing). */
export function isPremium(user) {
    if (!user) return false;
    if (user.role === 'admin') return true;
    const status = user.subscription_status;
    if (status === 'active') return true;
    if (status === 'trialing') {
        const t = user.trial_ends_at ? new Date(user.trial_ends_at).getTime() : 0;
        return t > Date.now();
    }
    return false;
}
