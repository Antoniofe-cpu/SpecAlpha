import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ax = axios.create({ baseURL: API, withCredentials: true, timeout: 20000 });

/**
 * Period helper: { preset: '7d'|'30d'|'90d'|'custom', from?, to? }
 * Converts to query params accepted by the backend (days, from, to).
 */
function periodToParams(period) {
    if (!period) return {};
    if (period.preset === 'custom') {
        const p = {};
        if (period.from) p.from = period.from;
        if (period.to) p.to = period.to;
        return p;
    }
    const mapping = { '7d': 7, '30d': 30, '90d': 90 };
    const days = mapping[period.preset];
    return days ? { days } : {};
}

export const adminApi = {
    kpis: (period) => ax.get('/admin/kpis', { params: periodToParams(period) }).then((r) => r.data),
    funnel: (period) => ax.get('/admin/funnel', { params: periodToParams(period) }).then((r) => r.data),
    events: (params = {}, period) =>
        ax.get('/admin/events', { params: { ...params, ...periodToParams(period) } }).then((r) => r.data),
    topAssets: (period) => ax.get('/admin/top-assets', { params: periodToParams(period) }).then((r) => r.data),
    users: (params = {}) => ax.get('/admin/users', { params }).then((r) => r.data),
    userDetail: (id) => ax.get(`/admin/users/${id}`).then((r) => r.data),
    extendTrial: (id, days = 7) => ax.post(`/admin/users/${id}/extend-trial`, { days }).then((r) => r.data),
    setRole: (id, role) => ax.post(`/admin/users/${id}/role`, { role }).then((r) => r.data),
    deleteUser: (id) => ax.delete(`/admin/users/${id}`).then((r) => r.data),
    deleteEvents: ({ period, type, all } = {}) =>
        ax.delete('/admin/events', { params: { ...periodToParams(period), type, all: all ? true : undefined } }).then((r) => r.data),
};

/** Fire-and-forget client-side event tracker. Safe to call without await. */
export function track(type, meta = {}) {
    ax.post('/admin/track', { type, meta }).catch(() => {});
}
