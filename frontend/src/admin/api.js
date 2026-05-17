import axios from 'axios';

const API = `${process.env.REACT_APP_BACKEND_URL}/api`;
const ax = axios.create({ baseURL: API, withCredentials: true, timeout: 20000 });

export const adminApi = {
    kpis: () => ax.get('/admin/kpis').then((r) => r.data),
    funnel: (days = 30) => ax.get('/admin/funnel', { params: { days } }).then((r) => r.data),
    events: (params = {}) => ax.get('/admin/events', { params }).then((r) => r.data),
    topAssets: (days = 30) => ax.get('/admin/top-assets', { params: { days } }).then((r) => r.data),
    users: (params = {}) => ax.get('/admin/users', { params }).then((r) => r.data),
    userDetail: (id) => ax.get(`/admin/users/${id}`).then((r) => r.data),
    extendTrial: (id, days = 7) => ax.post(`/admin/users/${id}/extend-trial`, { days }).then((r) => r.data),
    setRole: (id, role) => ax.post(`/admin/users/${id}/role`, { role }).then((r) => r.data),
    deleteUser: (id) => ax.delete(`/admin/users/${id}`).then((r) => r.data),
};

/** Fire-and-forget client-side event tracker. Safe to call without await. */
export function track(type, meta = {}) {
    ax.post('/admin/track', { type, meta }).catch(() => {});
}
