import axios from 'axios';

const BACKEND_URL = process.env.REACT_APP_BACKEND_URL;
export const API = `${BACKEND_URL}/api`;

const fast = axios.create({ baseURL: API, timeout: 30000 });
const slow = axios.create({ baseURL: API, timeout: 120000 });

export const fetchAssets = () => fast.get('/assets').then(r => r.data);
export const fetchBulk = (scope = 'core', refresh = false) =>
    slow.get(`/cot/bulk`, { params: { scope, refresh } }).then(r => r.data);
export const fetchOne = (assetId, refresh = false) =>
    slow.get(`/cot/${assetId}`, { params: { refresh } }).then(r => r.data);
export const fetchHistory = (assetId, limit = 60, refresh = false) =>
    slow.get(`/cot/${assetId}/history`, { params: { limit, refresh } }).then(r => r.data);
export const refreshCache = () => fast.post('/cot/refresh').then(r => r.data);
export const fetchMacro = (assetId, refresh = false) =>
    slow.get(`/macro/${assetId}`, { params: { refresh } }).then(r => r.data);
export const fetchVerdict = (assetId, refresh = false) =>
    slow.get(`/verdict/${assetId}`, { params: { refresh } }).then(r => r.data);
export const fetchVerdictPerformance = (assetId) =>
    slow.get(`/verdict/${assetId}/performance`).then(r => r.data);
