import React, { useEffect, useMemo, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
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
    Globe,
    Plus,
    LogIn,
    LogOut,
    UserCircle2,
    Settings,
    Lock,
} from 'lucide-react';
import './App.css';
import AssetCard from './components/AssetCard';
import AssetDetailModal from './components/AssetDetailModal';
import HelpModal from './components/HelpModal';
import HeatmapStrip from './components/HeatmapStrip';
import CurrencyStrengthIndex from './components/CurrencyStrengthIndex';
import ConfluenceOpportunities from './components/ConfluenceOpportunities';
import Logo from './components/Logo';
import AuthModal from './auth/AuthModal';
import { useAuth, isPremium } from './auth/AuthContext';
import { startCheckout, openBillingPortal } from './billing/api';
import { track } from './admin/api';
import { fetchAssets, fetchBulk } from './api';
import { cn, nextSaturdayUTC } from './utils';
import { useT } from './i18n';

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
    const { t } = useT();
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
            {t('app.next_sync')} <span className="text-amber-400">{days}d {hours}h</span>
        </span>
    );
}

function LockableSection({ locked, onUnlock, children }) {
    const { t } = useT();
    if (!locked) return children;
    return (
        <div className="relative">
            <div className="pointer-events-none blur-[10px] saturate-50 opacity-70">{children}</div>
            <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
                <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center mb-3 shadow-[0_0_30px_-6px_rgba(245,158,11,0.45)]">
                    <Lock size={18} className="text-amber-300" />
                </div>
                <button
                    type="button"
                    onClick={onUnlock}
                    className="px-6 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-[0.22em] text-[12px] transition"
                    data-testid="section-unlock-btn"
                >
                    {t('common.unlock')}
                </button>
            </div>
        </div>
    );
}

function LangToggle({ inline = false }) {
    const { lang, setLang } = useT();
    return (
        <div
            data-testid="lang-toggle"
            className={cn(
                'flex items-center bg-[#0a0a0d]/95 border border-white/10 rounded-2xl p-1 shadow-[0_4px_16px_rgba(0,0,0,0.4)] backdrop-blur-xl',
                inline && 'self-start'
            )}
        >
            <button
                data-testid="lang-it"
                onClick={() => setLang('it')}
                className={cn(
                    'px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-[0.22em] rounded-xl transition-colors flex items-center gap-1.5',
                    lang === 'it' ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'
                )}
                aria-label="Italiano"
            >
                {lang === 'it' && <Globe size={11} />}
                IT
            </button>
            <button
                data-testid="lang-en"
                onClick={() => setLang('en')}
                className={cn(
                    'px-3 py-1.5 text-[11px] font-mono font-bold uppercase tracking-[0.22em] rounded-xl transition-colors flex items-center gap-1.5',
                    lang === 'en' ? 'bg-amber-500 text-black' : 'text-gray-400 hover:text-white'
                )}
                aria-label="English"
            >
                {lang === 'en' && <Globe size={11} />}
                EN
            </button>
        </div>
    );
}

export default function App() {
    const { t, lang } = useT();
    const { user, logout, setFavorites: persistFavorites, refreshMe } = useAuth();
    const premium = isPremium(user);
    const [meta, setMeta] = useState([]);
    const [snapshots, setSnapshots] = useState([]);
    const [allCurrencies, setAllCurrencies] = useState([]);
    const [scope, setScope] = useState('core');
    const [loading, setLoading] = useState(true);
    const [error, setError] = useState(null);
    const [showHelp, setShowHelp] = useState(false);
    const [showAuth, setShowAuth] = useState(false);
    const [authMode, setAuthMode] = useState('register');
    const [activeId, setActiveId] = useState(null);
    const [favorites, setFavoritesState] = useState(loadFavorites());
    const [showFavOnly, setShowFavOnly] = useState(false);
    const [refreshing, setRefreshing] = useState(false);
    const [billingMsg, setBillingMsg] = useState(null);
    const [checkoutBusy, setCheckoutBusy] = useState(false);

    // Detect billing success/cancel redirect (?billing=success | cancel)
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const b = params.get('billing');
        if (b === 'success') {
            setBillingMsg({ type: 'success', text: 'Benvenuto Premium! La tua sottoscrizione è attiva 🎉' });
            // Poll a couple of times to let the webhook land
            const refresh = async () => {
                for (let i = 0; i < 6; i++) {
                    // eslint-disable-next-line no-await-in-loop
                    await refreshMe();
                    // eslint-disable-next-line no-await-in-loop
                    await new Promise((r) => setTimeout(r, 2500));
                }
            };
            refresh();
            // Strip ?billing= from URL
            const url = window.location.pathname + window.location.hash;
            window.history.replaceState({}, document.title, url);
            setTimeout(() => setBillingMsg(null), 10000);
        } else if (b === 'cancel') {
            setBillingMsg({ type: 'info', text: 'Pagamento annullato. Puoi riprovare quando vuoi.' });
            const url = window.location.pathname + window.location.hash;
            window.history.replaceState({}, document.title, url);
            setTimeout(() => setBillingMsg(null), 6000);
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const startTrial = async () => {
        if (!user) {
            openAuth('register');
            return;
        }
        setCheckoutBusy(true);
        try {
            await startCheckout();
        } catch (e) {
            console.error(e);
            setBillingMsg({ type: 'error', text: 'Impossibile avviare il checkout. Riprova fra qualche secondo.' });
            setCheckoutBusy(false);
            setTimeout(() => setBillingMsg(null), 6000);
        }
    };

    const manageBilling = async () => {
        try {
            await openBillingPortal();
        } catch (e) {
            console.error(e);
            setBillingMsg({ type: 'error', text: 'Portale di gestione non disponibile.' });
            setTimeout(() => setBillingMsg(null), 6000);
        }
    };

    // When user logs in, prefer server-side favorites (merge with local first time)
    useEffect(() => {
        if (!user) return;
        const local = loadFavorites();
        const server = user.favorites || [];
        const merged = Array.from(new Set([...server, ...local]));
        setFavoritesState(merged);
        if (merged.length !== server.length) {
            persistFavorites(merged).catch(() => {});
        }
        // Clear local cache once synced
        try { localStorage.removeItem(FAV_KEY); } catch {}
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user?.user_id]);

    const CURRENCY_IDS = ['EURUSD', 'GBPUSD', 'USDJPY', 'AUDUSD', 'USDCAD', 'USDCHF', 'NZDUSD'];

    const loadData = async (scopeArg = scope, force = false) => {
        try {
            setLoading(true);
            setError(null);
            if (force) setRefreshing(true);
            const [assetsList, bulk] = await Promise.all([
                meta.length ? Promise.resolve(meta) : fetchAssets(),
                fetchBulk(scopeArg, force, lang),
            ]);
            setMeta(assetsList);
            setSnapshots(bulk);
            if (scopeArg === 'all') {
                setAllCurrencies(bulk.filter((s) => CURRENCY_IDS.includes(s.assetId)));
            }
        } catch (e) {
            console.error(e);
            setError(t('app.error'));
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    };

    // Always fetch all currencies in background for the Strength Index
    const loadAllCurrencies = async (force = false) => {
        try {
            const data = await fetchBulk('all', force, lang);
            const ccy = data.filter((s) => CURRENCY_IDS.includes(s.assetId));
            setAllCurrencies(ccy);
        } catch (e) {
            console.warn('currency hydration failed', e);
        }
    };

    useEffect(() => {
        loadData('core');
        loadAllCurrencies();
        track('page_view', { path: '/' });
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    // Force anonymous visitors to core scope (cannot expand without auth)
    useEffect(() => {
        if (!user && scope === 'all') {
            setScope('core');
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [user]);

    useEffect(() => {
        loadData(scope);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [scope]);

    // Re-fetch all data when language changes so AI insights come back in the new language.
    const langInitRef = React.useRef(true);
    useEffect(() => {
        if (langInitRef.current) {
            langInitRef.current = false;
            return;
        }
        // Clear snapshots so the user sees skeletons while AI re-generates
        setSnapshots([]);
        setAllCurrencies([]);
        setLoading(true);
        loadData(scope);
        loadAllCurrencies();
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [lang]);

    const toggleFav = (id) => {
        setFavoritesState((prev) => {
            const next = prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id];
            if (user) {
                persistFavorites(next).catch(() => {});
            } else {
                saveFavorites(next);
            }
            return next;
        });
    };

    const openAuth = (mode = 'register') => {
        setAuthMode(mode);
        setShowAuth(true);
    };

    const isAssetLocked = (assetId) => !premium && assetId !== 'GOLD';

    const handleCardClick = (assetId) => {
        if (isAssetLocked(assetId)) {
            track('paywall_click', { assetId });
            if (user) {
                startTrial();
            } else {
                openAuth('register');
            }
        } else {
            track('asset_view', { assetId });
            setActiveId(assetId);
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
                    <Link to="/" className="flex items-center gap-3 group">
                        <Logo size={40} />
                        <h1 className="font-display text-lg sm:text-xl font-bold text-white tracking-tight">
                            Speculative <span className="text-amber-400">Alpha</span>
                        </h1>
                    </Link>
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
                            data-testid="help-btn"
                            onClick={() => setShowHelp(true)}
                            title={t('app.guide')}
                            aria-label={t('app.guide')}
                            className="p-2.5 rounded-2xl bg-white/[0.06] hover:bg-white/[0.12] border border-white/10 text-gray-300 transition-colors"
                        >
                            <HelpCircle size={15} />
                        </button>
                        {user ? (
                            <div className="flex items-center gap-2">
                                <div data-testid="user-chip" className="hidden sm:flex items-center gap-2 px-3 py-2 rounded-2xl border border-white/10 bg-white/[0.04]">
                                    {user.picture ? (
                                        <img src={user.picture} alt="" className="w-6 h-6 rounded-full" />
                                    ) : (
                                        <UserCircle2 size={18} className="text-amber-400" />
                                    )}
                                    <span className="text-[12px] font-mono text-gray-300 max-w-[140px] truncate">
                                        {user.name || user.email}
                                    </span>
                                    {premium && (
                                        <span className="text-[9px] font-bold uppercase tracking-[0.2em] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/30">
                                            {user.subscription_status === 'trialing' ? 'Trial' : 'Pro'}
                                        </span>
                                    )}
                                </div>
                                {user.role === 'admin' && (
                                    <a
                                        href="/admin"
                                        data-testid="admin-link"
                                        title="Pannello admin"
                                        className="hidden sm:inline-flex p-2.5 rounded-2xl bg-white/[0.06] hover:bg-amber-500/15 hover:border-amber-500/40 border border-white/10 text-amber-300 transition-colors"
                                    >
                                        <Settings size={15} />
                                    </a>
                                )}
                                {premium && user.stripe_customer_id && (
                                    <button
                                        data-testid="manage-billing-btn"
                                        onClick={manageBilling}
                                        title="Gestisci abbonamento"
                                        className="hidden sm:inline-flex p-2.5 rounded-2xl bg-white/[0.06] hover:bg-amber-500/15 hover:border-amber-500/40 border border-white/10 text-gray-300 transition-colors"
                                    >
                                        <Activity size={15} />
                                    </button>
                                )}
                                {!premium && (
                                    <button
                                        data-testid="header-trial-btn"
                                        onClick={startTrial}
                                        disabled={checkoutBusy}
                                        className="hidden sm:inline-flex px-3 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-[11px] font-bold uppercase tracking-[0.18em] items-center gap-1.5 transition disabled:opacity-60"
                                    >
                                        Inizia la prova
                                    </button>
                                )}
                                <button
                                    data-testid="logout-btn"
                                    onClick={logout}
                                    title="Logout"
                                    className="p-2.5 rounded-2xl bg-white/[0.06] hover:bg-rose-500/15 hover:border-rose-500/40 border border-white/10 text-gray-300 transition-colors"
                                >
                                    <LogOut size={15} />
                                </button>
                            </div>
                        ) : (
                            <button
                                data-testid="login-btn"
                                onClick={() => openAuth('register')}
                                className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-[13px] font-bold uppercase tracking-[0.18em] flex items-center gap-2 transition-colors"
                            >
                                <LogIn size={15} />
                                <span className="hidden sm:inline">Registrati</span>
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 sm:px-8 py-10 space-y-10 relative z-10">
                {/* Billing toast */}
                {billingMsg && (
                    <div
                        data-testid="billing-toast"
                        className={cn(
                            'rounded-2xl px-5 py-4 flex items-center gap-3 text-[13px] border',
                            billingMsg.type === 'success' && 'bg-emerald-500/[0.08] border-emerald-500/40 text-emerald-200',
                            billingMsg.type === 'info' && 'bg-amber-500/[0.08] border-amber-500/30 text-amber-200',
                            billingMsg.type === 'error' && 'bg-rose-500/[0.08] border-rose-500/30 text-rose-200',
                        )}
                    >
                        <Activity size={16} />
                        <span>{billingMsg.text}</span>
                    </div>
                )}

                {/* Toolbar */}
                <div id="asset-grid-anchor" className="flex flex-wrap items-center justify-between gap-5">
                    <div>
                        <div className="text-[12px] tracking-[0.3em] uppercase font-bold text-amber-400 mb-2">
                            {t('app.section.kicker')}
                        </div>
                        <h2 className="font-display text-3xl sm:text-[34px] font-bold text-white tracking-tight leading-none">
                            {t('app.section.title')}
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
                                <LayoutGrid size={13} /> {t('app.scope.core')}
                            </button>
                            <button
                                data-testid="scope-all"
                                onClick={() => {
                                    if (!user) {
                                        openAuth('register');
                                    } else {
                                        setScope('all');
                                    }
                                }}
                                className={cn(
                                    'px-4 py-2 text-[12px] font-semibold uppercase tracking-[0.18em] rounded-xl transition-colors flex items-center gap-2 relative',
                                    scope === 'all' ? 'bg-amber-500 text-black' : 'text-gray-300 hover:text-white'
                                )}
                            >
                                {!user && <Lock size={11} className="text-amber-400" />}
                                <Layers size={13} /> {t('app.scope.all')} ({meta.length})
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
                            <Star size={13} fill={showFavOnly ? '#fcd34d' : 'transparent'} /> {t('app.favorites')}
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

                {/* Paywall banner removed — paywall context is conveyed via card blur + CTA on locked items */}

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
                            {showFavOnly ? t('app.empty.fav') : t('app.empty.data')}
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
                                    locked={isAssetLocked(asset.assetId)}
                                    onClick={() => handleCardClick(asset.assetId)}
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
                                        {t('app.pending.sync')}
                                    </div>
                                </div>
                            ))}
                            {/* Phantom "+" card — inline in the grid, only when on Core scope */}
                            {scope === 'core' && pendingAssets.length === 0 && (
                                <motion.button
                                    type="button"
                                    data-testid="show-all-card"
                                    onClick={() => setScope('all')}
                                    initial={{ opacity: 0, scale: 0.97 }}
                                    animate={{ opacity: 1, scale: 1 }}
                                    transition={{ duration: 0.5, delay: visibleAssets.length * 0.04, ease: [0.22, 1, 0.36, 1] }}
                                    whileHover={{ scale: 1.01, y: -4 }}
                                    className="group h-[460px] rounded-[28px] border border-dashed border-white/15 hover:border-amber-400/50 bg-white/[0.015] hover:bg-amber-500/[0.04] transition-colors flex flex-col items-center justify-center gap-5 p-7 text-left"
                                >
                                    <span className="relative flex h-16 w-16 items-center justify-center rounded-full border border-white/10 group-hover:border-amber-400/50 bg-white/[0.02] group-hover:bg-amber-500/[0.08] transition-colors">
                                        <span className="absolute inset-0 rounded-full border border-amber-400/0 group-hover:border-amber-400/30 animate-ping" />
                                        <Plus size={28} className="text-gray-500 group-hover:text-amber-300 transition-colors" strokeWidth={1.5} />
                                    </span>
                                    <div className="text-center px-4">
                                        <div className="text-[12px] tracking-[0.28em] uppercase font-bold text-gray-500 group-hover:text-amber-300 transition-colors mb-2">
                                            {t('app.show_all_kicker')}
                                        </div>
                                        <div className="font-display text-[18px] font-semibold text-gray-300 group-hover:text-white transition-colors leading-snug">
                                            {t('app.show_all_title')}
                                        </div>
                                        <div className="text-[12px] text-gray-600 group-hover:text-gray-400 transition-colors mt-2 font-mono">
                                            {t('app.show_all_hint')}
                                        </div>
                                    </div>
                                </motion.button>
                            )}
                        </div>
                    )}
                </section>

                {/* Currency Strength Index — always uses all currencies in background hydration */}
                {allCurrencies.length > 0 && (
                    <LockableSection
                        locked={!premium}
                        onUnlock={() => (user ? startTrial() : openAuth('register'))}
                    >
                        <CurrencyStrengthIndex assets={allCurrencies} onPick={(id) => premium && setActiveId(id)} />
                    </LockableSection>
                )}

                {/* Heatmap */}
                {snapshots.length > 0 && (
                    <LockableSection
                        locked={!premium}
                        onUnlock={() => (user ? startTrial() : openAuth('register'))}
                    >
                        <HeatmapStrip assets={snapshots} onPick={(id) => premium && setActiveId(id)} />
                    </LockableSection>
                )}

                {/* COT Trend Opportunities ranked by Confluence Index */}
                {snapshots.length > 0 && (
                    <ConfluenceOpportunities
                        assets={snapshots}
                        locked={!premium}
                        onUnlock={() => (user ? startTrial() : openAuth('register'))}
                        onPick={(id) => premium && setActiveId(id)}
                    />
                )}

                {/* Footer */}
                <footer className="pt-10 pb-4 border-t border-white/5">
                    <div className="flex items-start justify-between gap-6 flex-wrap">
                        <div className="flex-1 min-w-[260px]">
                            <p className="text-[12px] tracking-[0.3em] uppercase font-bold text-gray-500 mb-1.5">
                                {t('app.footer.title')}
                            </p>
                            <p className="text-[13px] text-gray-500">
                                {t('app.footer.body')}
                            </p>
                        </div>
                        <LangToggle inline />
                    </div>
                </footer>
            </main>

            {/* Modals */}
            {activeAsset && (
                <AssetDetailModal
                    asset={activeAsset}
                    onClose={() => setActiveId(null)}
                    isFavorite={favorites.includes(activeAsset.assetId)}
                    onToggleFav={toggleFav}
                    locked={!premium}
                    onUnlock={() => {
                        track('paywall_click', { source: 'modal', assetId: activeAsset.assetId });
                        if (!user) {
                            openAuth('register');
                        } else {
                            startTrial();
                        }
                    }}
                />
            )}
            <HelpModal open={showHelp} onClose={() => setShowHelp(false)} />
            <AuthModal open={showAuth} onClose={() => setShowAuth(false)} initialMode={authMode} />
        </div>
    );
}
