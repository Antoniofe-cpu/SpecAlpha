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

/** Redirect the freshly authenticated user to Stripe Checkout when not premium,
 *  or to the dashboard when they already have access. */
async function routeAfterAuth(user) {
    if (isPremium(user)) {
        // Premium → go to dashboard (do not stay on the landing)
        if (window.location.pathname !== '/dashboard') {
            window.location.href = '/dashboard';
        }
        return;
    }
    try {
        const { data } = await ax.post('/billing/checkout', { origin_url: window.location.origin });
        if (data?.url) {
            window.location.href = data.url;
        }
    } catch (e) {
        // If checkout creation fails, fall back to the dashboard (paywall view).
        console.warn('post-auth checkout redirect failed', e);
        if (window.location.pathname !== '/dashboard') {
            window.location.href = '/dashboard';
        }
    }
}

export function AuthProvider({ children }) {
    const [user, setUser] = useState(null);
    const [loading, setLoading] = useState(true);

    const refreshMe = useCallback(async () => {
        try {
            const { data } = await ax.get('/auth/me');
            setUser(data);
            return data;
        } catch (err) {
            // Only clear the user on an explicit auth failure (401/403). On
            // network blips, 5xx (e.g. slow Stripe self-heal), or aborted
            // requests, keep the previously known user so we don't bounce
            // them out of authenticated pages.
            const code = err?.response?.status;
            if (code === 401 || code === 403) {
                setUser(null);
                return null;
            }
            console.warn('refreshMe transient failure (keeping cached user):', code || err?.message);
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
                        // After Google login, route to Stripe if not premium
                        if (!cancelled) routeAfterAuth(data);
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

    // Refresh user state whenever the tab gains focus. Catches the moment the
    // user returns from Stripe Checkout / Customer Portal so subscription
    // status flips from "free" → "trialing" or "trialing" → "active" without
    // requiring a manual page reload.
    useEffect(() => {
        const onFocus = () => { refreshMe(); };
        window.addEventListener('focus', onFocus);
        document.addEventListener('visibilitychange', () => {
            if (document.visibilityState === 'visible') refreshMe();
        });
        return () => {
            window.removeEventListener('focus', onFocus);
        };
    }, [refreshMe]);

    const login = useCallback(async (email, password) => {
        const { data } = await ax.post('/auth/login', { email, password });
        setUser(data);
        await routeAfterAuth(data);
        return data;
    }, []);

    const register = useCallback(async (email, password, name) => {
        const { data } = await ax.post('/auth/register', { email, password, name });
        setUser(data);
        // Google Ads conversion: account created
        try { (await import('../analytics')).trackConversion('signup', { method: 'email' }); } catch {}
        await routeAfterAuth(data);
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
