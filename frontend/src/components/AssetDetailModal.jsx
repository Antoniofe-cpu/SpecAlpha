import React, { useEffect, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import {
    AreaChart,
    Area,
    XAxis,
    YAxis,
    Tooltip,
    ResponsiveContainer,
    CartesianGrid,
    BarChart,
    Bar,
    Cell,
} from 'recharts';
import {
    X,
    Calendar,
    Download,
    RefreshCw,
    AlertTriangle,
    TrendingUp,
    Activity,
    BarChart3,
} from 'lucide-react';
import { fetchHistory, fetchOne } from '../api';
import { cn, formatNumber, formatSigned, getTrendAnalysis, TONE_CLASSES, downloadCSV } from '../utils';

export default function AssetDetailModal({ asset, onClose, isFavorite, onToggleFav }) {
    const [history, setHistory] = useState([]);
    const [loading, setLoading] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [windowSize, setWindowSize] = useState(26);
    const [snapshot, setSnapshot] = useState(asset);

    useEffect(() => {
        if (!asset?.assetId) return;
        let cancelled = false;
        setLoading(true);
        fetchHistory(asset.assetId, 100)
            .then((d) => {
                if (cancelled) return;
                setHistory(d || []);
            })
            .catch(() => setHistory([]))
            .finally(() => !cancelled && setLoading(false));
        return () => {
            cancelled = true;
        };
    }, [asset?.assetId]);

    useEffect(() => {
        setSnapshot(asset);
    }, [asset?.assetId]);

    const handleRefresh = async () => {
        setRefreshing(true);
        try {
            const fresh = await fetchOne(asset.assetId, true);
            const hist = await fetchHistory(asset.assetId, 100, true);
            setSnapshot(fresh);
            setHistory(hist);
        } catch (e) {
            console.error(e);
        } finally {
            setRefreshing(false);
        }
    };

    const trend = getTrendAnalysis(snapshot);
    const chartData = [...(history || [])]
        .filter((h) => !h.error)
        .slice(0, windowSize)
        .reverse();
    const longTotal = (snapshot?.long || 0) + (snapshot?.short || 0) || 1;
    const longPct = Math.round(((snapshot?.long || 0) / longTotal) * 100);

    const handleExport = () => {
        const rows = (history || []).map((h) => ({
            date: h.date,
            long: h.long,
            short: h.short,
            netPosition: h.netPosition,
            wowDelta: h.wowDelta,
            changeLong: h.changeLong,
            changeShort: h.changeShort,
        }));
        downloadCSV(`${asset.assetId}_cot_history.csv`, rows);
    };

    return (
        <AnimatePresence>
            <motion.div
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                exit={{ opacity: 0 }}
                className="fixed inset-0 z-[120] flex items-start sm:items-center justify-center p-4 sm:p-8 bg-black/85 backdrop-blur-md overflow-y-auto"
                onClick={onClose}
                data-testid="detail-modal-overlay"
            >
                <motion.div
                    initial={{ opacity: 0, scale: 0.96, y: 20 }}
                    animate={{ opacity: 1, scale: 1, y: 0 }}
                    exit={{ opacity: 0, scale: 0.96 }}
                    transition={{ duration: 0.3, ease: [0.22, 1, 0.36, 1] }}
                    onClick={(e) => e.stopPropagation()}
                    className="relative bg-[#0a0a0d] border border-white/10 rounded-[32px] w-full max-w-6xl my-8 shadow-[0_40px_120px_rgba(0,0,0,0.8)]"
                    data-testid="detail-modal"
                >
                    {/* Header */}
                    <div className="flex flex-wrap items-center justify-between gap-4 p-7 sm:p-9 border-b border-white/5">
                        <div className="flex items-center gap-4">
                            <div className="w-14 h-14 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                                <TrendingUp className="text-amber-400" size={24} />
                            </div>
                            <div>
                                <div className="text-[12px] tracking-[0.3em] uppercase font-bold text-amber-400 mb-1">
                                    {snapshot.type} • {snapshot.assetId}
                                </div>
                                <h2 className="font-display text-3xl sm:text-[34px] font-bold text-white leading-tight">
                                    {snapshot.name}
                                </h2>
                                <div className="flex items-center gap-2 mt-2">
                                    <Calendar size={13} className="text-gray-500" />
                                    <span className="text-[13px] font-mono text-gray-400">
                                        Report {snapshot.reportDate}
                                    </span>
                                </div>
                            </div>
                        </div>
                        <div className="flex items-center gap-2">
                            <button
                                data-testid="modal-refresh-btn"
                                onClick={handleRefresh}
                                disabled={refreshing}
                                className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.18em] bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 rounded-2xl flex items-center gap-2 transition-colors"
                            >
                                <RefreshCw size={14} className={cn(refreshing && 'animate-spin')} />
                                Refresh
                            </button>
                            <button
                                data-testid="modal-export-btn"
                                onClick={handleExport}
                                className="px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.18em] bg-white/[0.06] hover:bg-amber-500/15 hover:border-amber-500/40 border border-white/10 rounded-2xl flex items-center gap-2 transition-colors"
                            >
                                <Download size={14} /> CSV
                            </button>
                            <button
                                data-testid="modal-close-btn"
                                onClick={onClose}
                                className="p-3 rounded-full hover:bg-white/10 text-gray-400 hover:text-white transition-colors"
                            >
                                <X size={20} />
                            </button>
                        </div>
                    </div>

                    {/* Body */}
                    <div className="p-7 sm:p-9 space-y-8">
                        {/* Top metrics */}
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                            <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-5">
                                <div className="text-[11px] tracking-[0.28em] uppercase text-gray-400 font-semibold mb-2">
                                    Sentiment Globale
                                </div>
                                <div className={cn('font-display text-2xl font-bold mb-1', TONE_CLASSES[trend.tone])}>
                                    {trend.signal}
                                </div>
                                <div className="text-[13px] text-gray-400">
                                    Long-term: <span className="text-gray-200 font-mono">{trend.longTerm}</span> · Short-term:{' '}
                                    <span className="text-gray-200 font-mono">{trend.shortTerm}</span>
                                </div>
                            </div>
                            <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-5">
                                <div className="text-[11px] tracking-[0.28em] uppercase text-gray-400 font-semibold mb-2">
                                    Net Position
                                </div>
                                <div className="font-mono text-3xl font-semibold text-white tnum mb-2">
                                    {formatNumber(snapshot.netPosition)}
                                </div>
                                <div className="flex items-center gap-2 text-[13px]">
                                    <span className="text-gray-400">Δ WoW:</span>
                                    <span
                                        className={cn(
                                            'font-mono font-semibold',
                                            snapshot.wowDelta >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]'
                                        )}
                                    >
                                        {formatSigned(snapshot.wowDelta)}
                                    </span>
                                </div>
                                <div className="mt-3 h-2 w-full bg-white/[0.05] rounded-full overflow-hidden flex">
                                    <div className="h-full bg-[#34d399]" style={{ width: `${longPct}%` }} />
                                    <div className="h-full bg-[#fb7185]" style={{ width: `${100 - longPct}%` }} />
                                </div>
                            </div>
                            <div className="bg-amber-500/[0.07] border border-amber-500/25 rounded-3xl p-5">
                                <div className="flex items-center gap-2 mb-2">
                                    <Activity size={12} className="text-amber-400" />
                                    <span className="text-[11px] tracking-[0.28em] uppercase text-amber-300 font-bold">
                                        Macro Intelligence
                                    </span>
                                </div>
                                <p className="text-[14px] leading-relaxed text-gray-200 italic">"{snapshot.macro}"</p>
                            </div>
                        </div>

                        {/* Chart */}
                        <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-6">
                            <div className="flex flex-wrap items-center justify-between gap-3 mb-5">
                                <div>
                                    <div className="flex items-center gap-2">
                                        <BarChart3 size={16} className="text-amber-400" />
                                        <h3 className="font-display text-lg font-bold text-white">
                                            Net Position — Storico Istituzionale
                                        </h3>
                                    </div>
                                    <p className="text-[12px] tracking-[0.25em] uppercase text-gray-500 mt-1 font-semibold">
                                        Non-Commercial Speculative Trend
                                    </p>
                                </div>
                                <div className="flex items-center gap-1 bg-black/30 rounded-2xl border border-white/10 p-1.5">
                                    {[13, 26, 52, 100].map((n) => (
                                        <button
                                            key={n}
                                            data-testid={`window-${n}`}
                                            onClick={() => setWindowSize(n)}
                                            className={cn(
                                                'px-3.5 py-1.5 text-[12px] font-mono rounded-xl font-semibold uppercase tracking-wider transition-colors',
                                                windowSize === n
                                                    ? 'bg-amber-500 text-black'
                                                    : 'text-gray-400 hover:text-white'
                                            )}
                                        >
                                            {n}w
                                        </button>
                                    ))}
                                </div>
                            </div>
                            <div className="h-[340px]">
                                {loading ? (
                                    <div className="h-full flex items-center justify-center text-gray-500 text-[13px]">
                                        <RefreshCw size={18} className="animate-spin mr-2 text-amber-400/60" /> Caricamento serie storica…
                                    </div>
                                ) : chartData.length > 1 ? (
                                    <ResponsiveContainer width="100%" height="100%">
                                        <AreaChart data={chartData} margin={{ top: 10, right: 12, bottom: 0, left: -8 }}>
                                            <defs>
                                                <linearGradient id="netGrad" x1="0" y1="0" x2="0" y2="1">
                                                    <stop offset="0%" stopColor="#f59e0b" stopOpacity={0.45} />
                                                    <stop offset="100%" stopColor="#f59e0b" stopOpacity={0} />
                                                </linearGradient>
                                            </defs>
                                            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
                                            <XAxis
                                                dataKey="date"
                                                stroke="#6b7280"
                                                fontSize={11}
                                                axisLine={false}
                                                tickLine={false}
                                                tickFormatter={(v) => v?.slice(5)}
                                                tick={{ fontFamily: 'JetBrains Mono' }}
                                            />
                                            <YAxis
                                                stroke="#6b7280"
                                                fontSize={11}
                                                axisLine={false}
                                                tickLine={false}
                                                width={60}
                                                tick={{ fontFamily: 'JetBrains Mono' }}
                                                tickFormatter={(v) => Math.round(v / 1000) + 'k'}
                                            />
                                            <Tooltip
                                                contentStyle={{
                                                    backgroundColor: '#0a0a0d',
                                                    border: '1px solid rgba(245,158,11,0.4)',
                                                    borderRadius: 12,
                                                    fontSize: 12,
                                                    fontFamily: 'JetBrains Mono',
                                                }}
                                                labelStyle={{ color: '#f59e0b' }}
                                                itemStyle={{ color: '#fff' }}
                                                formatter={(v) => formatNumber(v)}
                                            />
                                            <Area
                                                type="monotone"
                                                dataKey="netPosition"
                                                stroke="#f59e0b"
                                                strokeWidth={2}
                                                fill="url(#netGrad)"
                                                style={{ filter: 'drop-shadow(0 0 8px rgba(245,158,11,0.4))' }}
                                            />
                                        </AreaChart>
                                    </ResponsiveContainer>
                                ) : (
                                    <div className="h-full flex flex-col items-center justify-center text-gray-600 gap-2">
                                        <AlertTriangle className="text-orange-500/40" size={20} />
                                        <span className="text-[11px] uppercase tracking-widest">Storico non disponibile</span>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* WoW delta bar chart + table */}
                        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                            <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-6">
                                <h3 className="font-display text-lg font-bold text-white mb-1">Δ WoW Recente</h3>
                                <p className="text-[12px] tracking-[0.25em] uppercase text-gray-500 font-semibold mb-4">
                                    Variazione Settimanale Net Position
                                </p>
                                <div className="h-[240px]">
                                    {chartData.length > 1 ? (
                                        <ResponsiveContainer width="100%" height="100%">
                                            <BarChart data={chartData.slice(-12)} margin={{ top: 5, right: 5, bottom: 0, left: -8 }}>
                                                <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.04)" />
                                                <XAxis
                                                    dataKey="date"
                                                    stroke="#6b7280"
                                                    fontSize={11}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    tickFormatter={(v) => v?.slice(5)}
                                                    tick={{ fontFamily: 'JetBrains Mono' }}
                                                />
                                                <YAxis
                                                    stroke="#6b7280"
                                                    fontSize={11}
                                                    axisLine={false}
                                                    tickLine={false}
                                                    width={56}
                                                    tick={{ fontFamily: 'JetBrains Mono' }}
                                                />
                                                <Tooltip
                                                    contentStyle={{
                                                        backgroundColor: '#0a0a0d',
                                                        border: '1px solid rgba(255,255,255,0.1)',
                                                        borderRadius: 12,
                                                        fontSize: 12,
                                                        fontFamily: 'JetBrains Mono',
                                                    }}
                                                    formatter={(v) => formatSigned(v)}
                                                />
                                                <Bar dataKey="wowDelta" radius={[6, 6, 0, 0]}>
                                                    {chartData.slice(-12).map((d, i) => (
                                                        <Cell key={i} fill={d.wowDelta >= 0 ? '#10b981' : '#f43f5e'} />
                                                    ))}
                                                </Bar>
                                            </BarChart>
                                        </ResponsiveContainer>
                                    ) : (
                                        <div className="h-full flex items-center justify-center text-gray-600 text-[13px]">—</div>
                                    )}
                                </div>
                            </div>

                            <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl overflow-hidden">
                                <div className="px-6 pt-6 pb-3">
                                    <h3 className="font-display text-lg font-bold text-white mb-1">Tabella Storica</h3>
                                    <p className="text-[12px] tracking-[0.25em] uppercase text-gray-500 font-semibold">
                                        Ultimi 8 Report Pubblicati
                                    </p>
                                </div>
                                <div className="overflow-x-auto">
                                    <table className="w-full text-[13px]" data-testid="history-table">
                                        <thead>
                                            <tr className="text-[11px] uppercase tracking-[0.2em] text-gray-500 font-semibold border-b border-white/5">
                                                <th className="px-4 py-3 text-left">Date</th>
                                                <th className="px-4 py-3 text-right">Long</th>
                                                <th className="px-4 py-3 text-right">Short</th>
                                                <th className="px-4 py-3 text-right">Net</th>
                                                <th className="px-4 py-3 text-right">Δ WoW</th>
                                            </tr>
                                        </thead>
                                        <tbody className="font-mono">
                                            {history.slice(0, 8).map((h, i) => (
                                                <tr key={h.date} className={cn('border-b border-white/[0.04]', i % 2 === 1 && 'bg-white/[0.02]')}>
                                                    <td className="px-4 py-3 text-gray-200">{h.date}</td>
                                                    <td className="px-4 py-3 text-right text-[#34d399]">{formatNumber(h.long)}</td>
                                                    <td className="px-4 py-3 text-right text-[#fb7185]">{formatNumber(h.short)}</td>
                                                    <td className="px-4 py-3 text-right text-white font-semibold">{formatNumber(h.netPosition)}</td>
                                                    <td className={cn('px-4 py-3 text-right font-semibold', h.wowDelta >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]')}>
                                                        {formatSigned(h.wowDelta)}
                                                    </td>
                                                </tr>
                                            ))}
                                        </tbody>
                                    </table>
                                </div>
                            </div>
                        </div>
                    </div>
                </motion.div>
            </motion.div>
        </AnimatePresence>
    );
}
