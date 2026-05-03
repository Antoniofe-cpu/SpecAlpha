import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
    HelpCircle,
    RefreshCw,
    Layers,
    Target,
    LayoutGrid,
    AlertCircle,
    Activity,
    Star,
} from 'lucide-react';
import './App.css';
import AssetCard from './components/AssetCard';
import AssetDetailModal from './components/AssetDetailModal';
import HelpModal from './components/HelpModal';
import HeatmapStrip from './components/HeatmapStrip';
import CurrencyStrengthIndex from './components/CurrencyStrengthIndex';
import { fetchAssets, fetchBulk, refreshCache } from './api';
import { cn, nextSaturdayUTC } from './utils';

const FAV_KEY = 'spec-alpha-fav';

function loadFavorites() {
    try {
        return JSON.parse(localStorage.getItem(FAV_KEY) || '[]');
    } catch {
        return [];
    }
}

function saveFavorites(favs) {
    localStorage.setItem(FAV_KEY, JSON.stringify(favs));
}

function CountdownLabel() {
    const [now, setNow] = useState(new Date());
    useEffect(() => {
        const id = setInterval(() => setNow(new Date()), 60000);
        return () => clearInterval(id);
    }, []);
    const target = nextSaturdayUTC();
    const diff = target - now;
    const days = Math.floor(diff / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diff % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    return (
        <span className="font-mono text-[10px] text-gray-500">
            Next sync: <span className="text-amber-400">{days}d {hours}h</span>
        </span>
    );
}

export default function App() {
    const [meta, setMeta] = useState([]);
    const [snapshots, setSnapshots] = useState([]);
    const [allCurrencies, setAllCurrencies] = useState([]);
    const [scope, setScope] = useState('core');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showHelp, setShowHelp] = useState(false);
    const [activeId, setActiveId] = useState(null);
    const [favorites, setFavorites] = useState(loadFavorites());
    const [showFavOnly, setShowFavOnly] = useState(false);
    const [refreshing, setRefreshing] = useState(false);

    const CURRENCY_IDS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'];

    const loadData = async (scopeArg = scope, force = false) => {
        try {
            setLoading(true);
            setError(null);
            if (force) setRefreshing(true);
            const [assetsList, bulk] = await Promise.all([
                meta.length ? Promise.resolve(meta) : fetchAssets(),
                fetchBulk(scopeArg, force),
            ]);
            setMeta(assetsList);
            setSnapshots(bulk);
            // Hydrate all-currencies set: union of bulk + scope=all if needed
            if (scopeArg === 'all') {
                setAllCurrencies(bulk.filter((s) => CURRENCY_IDS.includes(s.assetId)));
            }
        } catch (e) {
            console.error(e);
            setError('Errore nel caricamento dati. Riprova fra qualche istante.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Always fetch all currencies in background for the Strength Index
    const loadAllCurrencies = async (force = false) => {
        try {
            const data = await fetchBulk('all', force);
            const ccy = data.filter((s) => CURRENCY_IDS.includes(s.assetId));
            setAllCurrencies(ccy);
        } catch (e) {
            console.warn('currency hydration failed', e);
        }
    };

    useEffect(() => {
        loadData('core');
        loadAllCurrencies();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    useEffect(() => {
        loadData(scope);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope]);

    const toggleFav = (id) => {
        setFavorites((prev) => {
            const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
            saveFavorites(next);
            return next;
        });
    };

    const handleRefresh = async () => {
        try {
            setRefreshing(true);
            await refreshCache();
            await loadData(scope, true);
        } catch (e) {
            console.error(e);
        } finally {
            setRefreshing(false);
        }
    };

    const visibleAssets = useMemo(() => {
        const coreSet = new Set(meta.filter((m) => m.core).map((m) => m.assetId));
        let list = snapshots;
        if (scope === 'core') list = list.filter((s) => coreSet.has(s.assetId));
        if (showFavOnly) list = list.filter((s) => favorites.includes(s.assetId));
        return list;
    }, [snapshots, meta, scope, favorites, showFavOnly]);

    // Pending assets for current scope: present in `meta` but not yet in `snapshots`
    const pendingAssets = useMemo(() => {
        if (showFavOnly) return [];
        const visibleMeta = meta.filter((m) => (scope === 'all' ? true : m.core));
        const have = new Set(snapshots.map((s) => s.assetId));
        return visibleMeta.filter((m) => !have.has(m.assetId));
    }, [meta, scope, snapshots, showFavOnly]);

    const activeAsset = useMemo(
        () => snapshots.find((s) => s.assetId === activeId) || null,
        [snapshots, activeId]
    );

    return (
        <div className="App grain min-h-screen text-gray-200">
            {/* Header */}
            <header className="sticky top-0 z-[60] backdrop-blur-xl bg-[#050505]/80 border-b border-white/8">
                <div className="max-w-7xl mx-auto px-6 sm:px-8 py-5 flex items-center justify-between gap-4">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-500 text-black flex items-center justify-center shadow-[0_0_24px_-6px_rgba(245,158,11,0.7)]">
                            <Target size={20} strokeWidth={2.5} />
                        </div>
                        <div>
                            <h1 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight">
                                Speculative <span className="text-amber-400">Alpha</span>
                            </h1>
                            <p className="text-[12px] tracking-[0.3em] uppercase text-gray-400 font-semibold mt-0.5">
                                Institutional COT Intelligence
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 sm:gap-3">
                        <div className="hidden md:flex flex-col items-end mr-2">
                            <div className="flex items-center gap-2">
                                <div className="w-2 h-2 rounded-full bg-amber-400 live-dot" />
                                <span className="text-[12px] tracking-[0.28em] uppercase font-bold text-white font-mono">
                                    {snapshots[0]?.reportDate || '—'}
                                </span>
                            </div>
                            <CountdownLabel />
                        </div>
                        <button
                            data-testid="refresh-btn"
                            onClick={handleRefresh}
                            disabled={refreshing}
                            className="p-2.5 sm:px-4 sm:py-2.5 rounded-2xl bg-white/[0.06] hover:bg-amber-500/15 hover:border-amber-500/40 border border-white/10 text-[13px] font-semibold uppercase tracking-[0.18em] flex items-center gap-2 transition-colors"
                        >
                            <RefreshCw size={15} className={cn(refreshing && 'animate-spin')} />
                            <span className="hidden sm:inline">Refresh</span>
                        </button>
                        <button
                            data-testid="help-btn"
                            onClick={() => setShowHelp(true)}
                            className="p-2.5 sm:px-4 sm:py-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-[13px] font-semibold uppercase tracking-[0.18em] flex items-center gap-2 transition-colors"
                        >
                            <HelpCircle size={15} />
                            <span className="hidden sm:inline">Guide</span>
                        </button>
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 sm:px-8 py-10 space-y-10 relative z-10">
                {/* Toolbar */}
                <div className="flex flex-wrap items-center justify-between gap-5">
                    <div>
                        <div className="text-[12px] tracking-[0.3em] uppercase font-bold text-amber-400 mb-2">
                            Mercati Istituzionali
                        </div>
                        <h2 className="font-display text-3xl sm:text-[34px] font-bold text-white tracking-tight leading-none">
                            Posizionamento Non-Commercial
                        </h2>
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="bg-black/30 border border-white/10 rounded-2xl p-1.5 flex items-center gap-1">
                            <button
                                data-testid="scope-core"
                                onClick={() => setScope('core')}
                                className={cn(
                                    'px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] rounded-xl transition-colors flex items-center gap-2',
                                    scope === 'core' ? 'bg-amber-500 text-black' : 'text-gray-300 hover:text-white'
                                )}
                            >
                                <LayoutGrid size={13} /> Core
                            </button>
                            <button
                                data-testid="scope-all"
                                onClick={() => setScope('all')}
                                className={cn(
                                    'px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] rounded-xl transition-colors flex items-center gap-2',
                                    scope === 'all' ? 'bg-amber-500 text-black' : 'text-gray-300 hover:text-white'
                                )}
                            >
                                <Layers size={13} /> All ({meta.length})
                            </button>
                        </div>
                        <button
                            data-testid="fav-only-toggle"
                            onClick={() => setShowFavOnly((p) => !p)}
                            className={cn(
                                'px-4 py-2.5 text-[12px] font-semibold uppercase tracking-[0.18em] rounded-2xl border flex items-center gap-2 transition-colors',
                                showFavOnly
                                    ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                                    : 'bg-white/[0.06] border-white/10 text-gray-300 hover:text-white'
                            )}
                        >
                            <Star size={13} fill={showFavOnly ? '#fcd34d' : 'transparent'} /> Favorites
                        </button>
                    </div>
                </div>

                {/* Error */}
                {error && (
                    <div
                        data-testid="error-banner"
                        className="bg-[#f43f5e]/10 border border-[#f43f5e]/30 rounded-2xl px-5 py-4 flex items-center gap-3 text-[14px]"
                    >
                        <AlertCircle className="text-[#fb7185]" size={18} />
                        <span className="text-[#fb7185]">{error}</span>
                    </div>
                )}

                {/* Cards Grid */}
                <section>
                    {loading && !snapshots.length ? (
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                            {Array.from({ length: 7 }).map((_, i) => (
                                <div key={i} className="h-[460px] rounded-[28px] shimmer border border-white/5" />
                            ))}
                        </div>
                    ) : visibleAssets.length === 0 ? (
                        <div className="text-center py-14 text-gray-400 text-[15px]">
                            {showFavOnly ? 'Nessun asset preferito. Clicca sulla stella per aggiungerne.' : 'Nessun dato disponibile.'}
                        </div>
                    ) : (
                        <div
                            data-testid="asset-grid"
                            className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6"
                        >
                            {visibleAssets.map((asset, i) => (
                                <AssetCard
                                    key={asset.assetId}
                                    asset={asset}
                                    index={i}
                                    isFavorite={favorites.includes(asset.assetId)}
                                    isLoading={refreshing}
                                    onClick={() => setActiveId(asset.assetId)}
                                    onToggleFav={toggleFav}
                                />
                            ))}
                            {pendingAssets.map((m) => (
                                <div
                                    key={`pending-${m.assetId}`}
                                    data-testid={`asset-card-${m.assetId}-pending`}
                                    className="h-[460px] rounded-[28px] shimmer border border-white/5 flex flex-col p-7"
                                >
                                    <div className="text-[11px] tracking-[0.28em] uppercase font-semibold text-amber-400/60 mb-1">
                                        {m.type}
                                    </div>
                                    <div className="font-display text-[20px] font-bold text-white/40">{m.name}</div>
                                    <div className="text-[12px] uppercase tracking-widest text-gray-600 mt-1.5 font-mono">
                                        {m.assetId}
                                    </div>
                                    <div className="flex-1 flex items-center justify-center gap-2 text-gray-500 text-[12px] uppercase tracking-widest font-semibold">
                                        <RefreshCw size={14} className="animate-spin text-amber-400/40" />
                                        Sync flussi…
                                    </div>
                                </div>
                            ))}
                        </div>
                    )}
                </section>

                {/* Currency Strength Index — always uses all currencies in background hydration */}
                {allCurrencies.length > 0 && (
                    <CurrencyStrengthIndex assets={allCurrencies} onPick={setActiveId} />
                )}

                {/* Heatmap */}
                {snapshots.length > 0 && <HeatmapStrip assets={snapshots} onPick={setActiveId} />}

                {/* Footer */}
                <footer className="pt-10 pb-4 border-t border-white/5">
                    <p className="text-[12px] tracking-[0.3em] uppercase font-bold text-gray-500 mb-1.5">
                        Data Source · Tradingster (CFTC Legacy Futures)
                    </p>
                    <p className="text-[13px] text-gray-500">
                        Tutti i dati sono estratti dai report ufficiali CFTC Commitment of Traders.
                        Aggiornamento automatico ogni sabato.
                    </p>
                </footer>
            </main>

            {/* Modals */}
            {activeAsset && (
                <AssetDetailModal
                    asset={activeAsset}
                    onClose={() => setActiveId(null)}
                    isFavorite={favorites.includes(activeAsset.assetId)}
                    onToggleFav={toggleFav}
                />
            )}
            <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
        </div>
    );
}
