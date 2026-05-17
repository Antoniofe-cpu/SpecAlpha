import React, { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import {
    ArrowRight,
    Sparkles,
    Target,
    BarChart3,
    Activity,
    Layers,
    LineChart,
    Eye,
    Zap,
    LogIn,
    LogOut,
    UserCircle2,
    Lock,
    Globe,
} from 'lucide-react';
import { useAuth, isPremium } from '../auth/AuthContext';
import AuthModal from '../auth/AuthModal';
import { startCheckout } from '../billing/api';
import { useT } from '../i18n';
import { cn } from '../utils';
import Logo from '../components/Logo';

/**
 * Landing — public, separated from dashboard.
 * Auto-detects browser language via useT().
 */
export default function LandingPage() {
    const { user, logout } = useAuth();
    const premium = isPremium(user);
    const [showAuth, setShowAuth] = useState(false);
    const [authMode, setAuthMode] = useState('register');
    const { t, lang, setLang } = useT();
    const navigate = useNavigate();

    // If Stripe returns the user to "/" with ?billing=success or ?billing=cancel,
    // forward them to /dashboard so the dashboard's billing toast + polling kicks in.
    useEffect(() => {
        const params = new URLSearchParams(window.location.search);
        const b = params.get('billing');
        if (b === 'success' || b === 'cancel') {
            navigate(`/dashboard${window.location.search}`, { replace: true });
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, []);

    const onPrimaryCta = () => {
        if (!user) {
            // Anonymous → straight to the dashboard (paywall is enforced there).
            // Don't force a sign-up modal on the landing.
            navigate('/dashboard');
        } else if (premium) {
            navigate('/dashboard');
        } else {
            startCheckout().catch(() => navigate('/dashboard'));
        }
    };

    const onHeaderAuthClick = () => {
        setAuthMode('login');
        setShowAuth(true);
    };

    return (
        <div className="min-h-screen bg-[#050505] text-gray-200 grain">
            <header data-testid="landing-header" className="sticky top-0 z-40 bg-[#050505]/85 backdrop-blur-xl border-b border-white/[0.06]">
                <div className="max-w-7xl mx-auto px-6 sm:px-8 py-5 flex items-center justify-between gap-4">
                    <Link to="/" className="flex items-center gap-3 group">
                        <Logo size={36} />
                        <span className="font-display text-lg font-bold text-white tracking-tight">
                            Speculative <span className="text-amber-400">Alpha</span>
                        </span>
                    </Link>
                    <div className="flex items-center gap-2">
                        <button
                            data-testid="landing-lang-toggle"
                            onClick={() => setLang(lang === 'it' ? 'en' : 'it')}
                            className="hidden sm:inline-flex items-center gap-1.5 px-3 py-2 rounded-2xl border border-white/10 bg-white/[0.04] text-[11px] uppercase tracking-[0.2em] font-bold text-gray-300 hover:text-white hover:border-amber-500/40 transition-colors"
                            title="Toggle language"
                        >
                            <Globe size={12} className="text-amber-400" />
                            {lang === 'it' ? 'IT' : 'EN'}
                        </button>
                        {user ? (
                            <>
                                <span className="hidden sm:inline-flex items-center gap-2 text-[12px] text-gray-300 px-3 py-2 rounded-2xl border border-white/10 bg-white/[0.04]">
                                    <UserCircle2 size={14} className="text-amber-400" />
                                    {user.email}
                                </span>
                                <button
                                    data-testid="landing-go-dashboard"
                                    onClick={() => (premium ? navigate('/dashboard') : startCheckout().catch(() => navigate('/dashboard')))}
                                    className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-bold uppercase tracking-[0.18em] flex items-center gap-2"
                                >
                                    {t('landing.header_dashboard')}
                                    <ArrowRight size={13} />
                                </button>
                                <button
                                    onClick={logout}
                                    title="Logout"
                                    data-testid="landing-logout"
                                    className="p-2.5 rounded-2xl bg-white/[0.06] hover:bg-rose-500/15 border border-white/10 text-gray-300"
                                >
                                    <LogOut size={14} />
                                </button>
                            </>
                        ) : (
                            <button
                                data-testid="landing-login-btn"
                                onClick={onHeaderAuthClick}
                                className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-bold uppercase tracking-[0.18em] flex items-center gap-2"
                            >
                                <LogIn size={13} /> {t('landing.header_login')}
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 sm:px-8 py-14 sm:py-20 space-y-16 relative z-10">
                <Hero onCta={onPrimaryCta} t={t} hasUser={!!user} premium={premium} />
                <FeaturesMarquee t={t} />
                <ZeroDTETeaser t={t} />
                <SecondaryCta onCta={onPrimaryCta} hasUser={!!user} t={t} />
            </main>

            <footer className="border-t border-white/[0.06] mt-12 py-8">
                <div className="max-w-7xl mx-auto px-6 sm:px-8 flex flex-wrap items-center justify-between gap-3 text-[11px] text-gray-500 uppercase tracking-[0.22em]">
                    <span>© 2026 Speculative Alpha</span>
                    <span className="font-mono">{t('landing.footer_data')}</span>
                </div>
            </footer>

            <AuthModal open={showAuth} onClose={() => setShowAuth(false)} initialMode={authMode} />
        </div>
    );
}

/* --------------------------------- HERO --------------------------------- */
function Hero({ onCta, t, hasUser, premium }) {
    const stats = [
        { v: t('landing.stat1_v'), l: t('landing.stat1_l') },
        { v: t('landing.stat2_v'), l: t('landing.stat2_l') },
        { v: t('landing.stat3_v'), l: t('landing.stat3_l') },
        { v: t('landing.stat4_v'), l: t('landing.stat4_l') },
    ];
    return (
        <section data-testid="landing-hero" className="relative">
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-[36px] border border-white/[0.08] bg-gradient-to-br from-[#13131a] via-[#0c0c10] to-black p-10 sm:p-16"
            >
                {/* Animated background orbs */}
                <motion.div
                    className="pointer-events-none absolute -top-32 -right-40 w-[480px] h-[480px] rounded-full bg-amber-500/[0.14] blur-3xl"
                    animate={{ scale: [1, 1.1, 1], opacity: [0.8, 1, 0.8] }}
                    transition={{ duration: 8, repeat: Infinity, ease: 'easeInOut' }}
                />
                <motion.div
                    className="pointer-events-none absolute -bottom-40 -left-20 w-[400px] h-[400px] rounded-full bg-sky-500/[0.08] blur-3xl"
                    animate={{ scale: [1, 1.15, 1], opacity: [0.7, 1, 0.7] }}
                    transition={{ duration: 10, repeat: Infinity, ease: 'easeInOut', delay: 1 }}
                />

                {/* Floating grid lines */}
                <svg className="pointer-events-none absolute inset-0 opacity-[0.04]" width="100%" height="100%">
                    <defs>
                        <pattern id="grid" width="40" height="40" patternUnits="userSpaceOnUse">
                            <path d="M 40 0 L 0 0 0 40" fill="none" stroke="white" strokeWidth="0.5" />
                        </pattern>
                    </defs>
                    <rect width="100%" height="100%" fill="url(#grid)" />
                </svg>

                <div className="relative max-w-3xl">
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.15, duration: 0.5 }}
                        className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase font-bold text-amber-300 mb-5 border border-amber-500/30 bg-amber-500/[0.06] rounded-full px-3 py-1.5"
                    >
                        <Sparkles size={11} />
                        {t('landing.kicker')}
                    </motion.div>
                    <motion.h1
                        initial={{ opacity: 0, y: 12 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.2, duration: 0.6 }}
                        className="font-display text-4xl sm:text-5xl lg:text-[68px] font-bold text-white tracking-tight leading-[1.05] mb-6"
                    >
                        <span className="text-white">{t('landing.title_a')}</span>
                        {t('landing.title_b') ? ' ' : ''}
                        <motion.span
                            className="text-amber-400 inline"
                            style={{
                                backgroundImage:
                                    'linear-gradient(transparent calc(100% - 4px), rgba(251,191,36,0.85) 4px)',
                                backgroundRepeat: 'no-repeat',
                                backgroundPosition: '0 95%',
                                paddingBottom: '2px',
                                WebkitBoxDecorationBreak: 'clone',
                                boxDecorationBreak: 'clone',
                            }}
                            initial={{ backgroundSize: '0% 100%' }}
                            animate={{ backgroundSize: '100% 100%' }}
                            transition={{ delay: 0.75, duration: 0.95, ease: [0.22, 1, 0.36, 1] }}
                        >
                            {t('landing.title_b')}
                        </motion.span>
                    </motion.h1>
                    <motion.p
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.35, duration: 0.5 }}
                        className="text-[15px] sm:text-[17px] text-gray-400 leading-relaxed mb-8 max-w-xl"
                    >
                        {t('landing.subtitle')}
                    </motion.p>

                    {/* Data points strip */}
                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5, duration: 0.5 }}
                        className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-9 max-w-2xl"
                        data-testid="landing-stats"
                    >
                        {stats.map((s, i) => (
                            <StatCard key={s.l} value={s.v} label={s.l} index={i} />
                        ))}
                    </motion.div>

                    <motion.div
                        initial={{ opacity: 0, y: 8 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.7, duration: 0.5 }}
                    >
                        <PremiumCTA
                            onCta={onCta}
                            label={premium ? t('landing.cta_pulse_b') : t('landing.cta_pulse_a')}
                        />
                    </motion.div>

                    <div className="mt-6 flex items-center gap-3 text-[11px] text-gray-500 uppercase tracking-[0.22em] font-mono">
                        <Lock size={11} className="text-amber-400/60" />
                        {t('landing.cta_meta')}
                    </div>
                </div>
            </motion.div>
        </section>
    );
}

/* --------------------------- STAT CARD --------------------------- */
function StatCard({ value, label, index }) {
    // Animated count-up when the value is numeric (else display as-is).
    const numericMatch = /^([\d.]+)([+]?)$/.exec(value);
    const numeric = numericMatch ? parseFloat(numericMatch[1]) : null;
    const suffix = numericMatch ? numericMatch[2] : '';
    const [display, setDisplay] = React.useState(numeric != null ? '0' : value);

    React.useEffect(() => {
        if (numeric == null) return;
        const dur = 1100;
        const start = performance.now();
        let raf;
        const tick = (t) => {
            const p = Math.min(1, (t - start) / dur);
            // ease-out-cubic
            const eased = 1 - Math.pow(1 - p, 3);
            const v = numeric * eased;
            setDisplay(numeric < 1 || !Number.isFinite(numeric) ? value : Math.round(v).toString());
            if (p < 1) raf = requestAnimationFrame(tick);
            else setDisplay(numeric.toString());
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [numeric]);

    return (
        <motion.div
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.55 + index * 0.08, duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -3, transition: { duration: 0.2 } }}
            className="group relative overflow-hidden rounded-2xl border border-white/[0.08] bg-gradient-to-b from-white/[0.04] to-white/[0.01] backdrop-blur-md p-4 transition-colors hover:border-amber-500/40"
        >
            {/* Top accent line */}
            <motion.div
                className="absolute inset-x-3 top-0 h-[2px] bg-gradient-to-r from-transparent via-amber-400/70 to-transparent"
                initial={{ scaleX: 0, opacity: 0 }}
                animate={{ scaleX: 1, opacity: 1 }}
                transition={{ delay: 0.75 + index * 0.08, duration: 0.6 }}
                style={{ transformOrigin: 'left' }}
            />
            {/* Hover glow */}
            <div className="pointer-events-none absolute -inset-6 bg-amber-500/[0.07] blur-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500" />

            <div className="relative">
                <div className="font-mono text-[26px] sm:text-[28px] font-bold tnum leading-none bg-gradient-to-b from-amber-200 via-amber-300 to-amber-500 bg-clip-text text-transparent">
                    {display}
                    {suffix}
                </div>
                <div className="mt-2 text-[10px] uppercase tracking-[0.2em] text-gray-500 font-bold">
                    {label}
                </div>
            </div>
        </motion.div>
    );
}

function PremiumCTA({ onCta, label }) {
    return (
        <motion.button
            data-testid="landing-cta-btn"
            onClick={onCta}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group relative inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 text-black font-bold uppercase tracking-[0.22em] text-[13px] shadow-[0_0_40px_-8px_rgba(245,158,11,0.7)] transition-shadow hover:shadow-[0_0_60px_-4px_rgba(245,158,11,1)]"
        >
            <span className="absolute -inset-1 rounded-2xl bg-amber-400/30 blur-md opacity-60 group-hover:opacity-90 animate-pulse" />
            <span className="relative">{label}</span>
            <span className="relative w-7 h-7 rounded-full bg-black/15 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </span>
        </motion.button>
    );
}

/* --------------------------- FEATURES MARQUEE --------------------------- */
function FeaturesMarquee({ t }) {
    const FEATURES = [
        { icon: Target, title: t('landing.feat1_t'), desc: t('landing.feat1_d'), tone: 'amber' },
        { icon: BarChart3, title: t('landing.feat2_t'), desc: t('landing.feat2_d'), tone: 'sky' },
        { icon: Activity, title: t('landing.feat3_t'), desc: t('landing.feat3_d'), tone: 'violet' },
        { icon: LineChart, title: t('landing.feat4_t'), desc: t('landing.feat4_d'), tone: 'emerald' },
        { icon: Layers, title: t('landing.feat5_t'), desc: t('landing.feat5_d'), tone: 'amber' },
        { icon: Eye, title: t('landing.feat6_t'), desc: t('landing.feat6_d'), tone: 'sky' },
        { icon: Zap, title: t('landing.feat7_t'), desc: t('landing.feat7_d'), tone: 'violet' },
    ];
    const items = [...FEATURES, ...FEATURES];
    const toneClasses = {
        amber: 'border-amber-500/30 bg-amber-500/[0.05] text-amber-300',
        sky: 'border-sky-500/30 bg-sky-500/[0.04] text-sky-300',
        violet: 'border-violet-500/30 bg-violet-500/[0.04] text-violet-300',
        emerald: 'border-emerald-500/30 bg-emerald-500/[0.04] text-emerald-300',
    };
    return (
        <section data-testid="landing-marquee" className="relative">
            <div className="text-center mb-8">
                <div className="text-[10px] tracking-[0.3em] uppercase font-bold text-amber-400 mb-2">
                    {t('landing.features_kicker')}
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">
                    {t('landing.features_title')}
                </h2>
            </div>
            <div className="relative overflow-hidden">
                <div className="pointer-events-none absolute inset-y-0 left-0 w-24 bg-gradient-to-r from-[#050505] to-transparent z-10" />
                <div className="pointer-events-none absolute inset-y-0 right-0 w-24 bg-gradient-to-l from-[#050505] to-transparent z-10" />
                <motion.div
                    className="flex gap-5 py-2"
                    animate={{ x: ['0%', '-50%'] }}
                    transition={{ duration: 40, ease: 'linear', repeat: Infinity }}
                    style={{ width: 'max-content' }}
                >
                    {items.map((f, i) => (
                        <article
                            key={`${f.title}-${i}`}
                            className="w-[340px] shrink-0 rounded-2xl border border-white/[0.07] bg-gradient-to-b from-[#13131a] to-[#0b0b10] p-6"
                        >
                            <div className={cn('w-10 h-10 rounded-xl border flex items-center justify-center mb-4', toneClasses[f.tone])}>
                                <f.icon size={16} />
                            </div>
                            <div className="text-[14px] font-semibold text-white mb-1.5">{f.title}</div>
                            <p className="text-[12.5px] text-gray-400 leading-relaxed">{f.desc}</p>
                        </article>
                    ))}
                </motion.div>
            </div>
        </section>
    );
}

/* ------------------------------ 0DTE TEASER ----------------------------- */
function ZeroDTETeaser({ t }) {
    return (
        <motion.section
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-80px' }}
            transition={{ duration: 0.6 }}
            className="relative overflow-hidden rounded-[36px] border border-violet-400/25 bg-gradient-to-br from-[#1a1023] via-[#0d0a14] to-black p-10 sm:p-14"
            data-testid="landing-0dte"
        >
            <div className="pointer-events-none absolute -top-32 -right-20 w-[400px] h-[400px] rounded-full bg-violet-500/[0.18] blur-3xl" />
            <div className="pointer-events-none absolute -bottom-24 left-20 w-[280px] h-[280px] rounded-full bg-indigo-500/[0.12] blur-3xl" />

            <div className="relative flex flex-col sm:flex-row items-start sm:items-center justify-between gap-8">
                <div className="max-w-2xl">
                    <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase font-bold text-violet-200 mb-4 border border-violet-400/30 bg-violet-500/[0.08] rounded-full px-3 py-1.5">
                        <Zap size={11} />
                        {t('landing.0dte_kicker')}
                    </div>
                    <h2 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight mb-4">
                        {t('landing.0dte_title_a')}<br />
                        <span className="text-violet-300">{t('landing.0dte_title_b')}</span>
                    </h2>
                    <p className="text-[14px] text-gray-400 leading-relaxed max-w-lg">
                        {t('landing.0dte_desc')}
                    </p>
                </div>
                <div className="flex flex-col items-end gap-2">
                    <div className="relative">
                        <div className="absolute inset-0 rounded-full bg-violet-400/30 blur-xl animate-pulse" />
                        <div className="relative font-mono text-[40px] font-bold text-violet-100 tnum tracking-tighter">
                            0DTE
                        </div>
                    </div>
                    <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-violet-300/70">
                        {t('landing.0dte_soon')}
                    </span>
                </div>
            </div>
        </motion.section>
    );
}

/* ------------------------------ SECONDARY CTA --------------------------- */
function SecondaryCta({ onCta, hasUser, t }) {
    return (
        <section className="text-center py-10">
            <h3 className="font-display text-2xl sm:text-3xl font-bold text-white mb-3">
                {t('landing.cta2_title')}
            </h3>
            <p className="text-[14px] text-gray-400 mb-7 max-w-md mx-auto">
                {hasUser ? t('landing.cta2_desc_user') : t('landing.cta2_desc')}
            </p>
            <PremiumCTA onCta={onCta} label={hasUser ? t('landing.cta_pulse_b') : t('landing.cta_pulse_a')} />
        </section>
    );
}
