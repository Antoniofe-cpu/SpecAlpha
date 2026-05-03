// Lightweight class merge helper
export function cn(...args) {
    return args
        .flat()
        .filter(Boolean)
        .filter(a => typeof a === 'string')
        .join(' ');
}

export function formatNumber(n) {
    if (n === undefined || n === null || isNaN(n)) return '—';
    return Number(n).toLocaleString('en-US');
}

export function formatSigned(n) {
    if (n === undefined || n === null || isNaN(n)) return '—';
    const v = Number(n);
    return v > 0 ? `+${v.toLocaleString('en-US')}` : v.toLocaleString('en-US');
}

export function getTrendAnalysis(asset) {
    if (!asset || asset.netPosition === undefined)
        return { signal: 'N/A', tone: 'neutral', signalKey: 'trend.neutral', shortTerm: 'N/A', longTerm: 'N/A' };
    const shortTerm = (asset.wowDelta || 0) > 0 ? 'LONG' : 'SHORT';
    const longTerm = (asset.netPosition || 0) > 0 ? 'LONG' : 'SHORT';
    let signal = 'NEUTRAL';
    let signalKey = 'trend.neutral';
    let tone = 'neutral';
    if (asset.wowDelta > 0 && asset.netPosition > 0) {
        signal = 'LONG';
        signalKey = 'trend.bullish';
        tone = 'bullish';
    } else if (asset.wowDelta < 0 && asset.netPosition < 0) {
        signal = 'SHORT';
        signalKey = 'trend.bearish';
        tone = 'bearish';
    } else if (asset.wowDelta > 0 && asset.netPosition < 0) {
        signal = 'ACCUMULO';
        signalKey = 'trend.accumulation';
        tone = 'accumulation';
    } else if (asset.wowDelta < 0 && asset.netPosition > 0) {
        signal = 'DISTRIBUZIONE';
        signalKey = 'trend.distribution';
        tone = 'distribution';
    }
    return { shortTerm, longTerm, signal, signalKey, tone };
}

export const TONE_CLASSES = {
    bullish: 'text-[#10b981]',
    bearish: 'text-[#f43f5e]',
    accumulation: 'text-[#fcd34d]',
    distribution: 'text-orange-400',
    neutral: 'text-gray-400',
};

export function nextSaturdayUTC() {
    const now = new Date();
    const day = now.getUTCDay(); // 0 sun..6 sat
    const daysAhead = (6 - day + 7) % 7 || 7;
    const next = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate() + daysAhead, 22, 0, 0));
    return next;
}

export function downloadCSV(filename, rows) {
    if (!rows || !rows.length) return;
    const headers = Object.keys(rows[0]);
    const csv = [
        headers.join(','),
        ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? '')).join(',')),
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}
