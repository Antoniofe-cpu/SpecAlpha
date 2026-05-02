import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const client = axios.create({ baseURL: API, timeout: 30000 });

export const fetchAssets = () => client.get('/assets').then(r => r.data);
export const fetchBulk = (scope = 'core', refresh = false) =>
    client.get(`/cot/bulk`, { params: { scope, refresh } }).then(r => r.data);
export const fetchOne = (assetId, refresh = false) =>
    client.get(`/cot/${assetId}`, { params: { refresh } }).then(r => r.data);
export const fetchHistory = (assetId, limit = 60, refresh = false) =>
    client.get(`/cot/${assetId}/history`, { params: { limit, refresh } }).then(r => r.data);
export const refreshCache = () => client.post('/cot/refresh').then(r => r.data);
