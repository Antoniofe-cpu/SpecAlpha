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
} from 'lucide-react';
import { useAuth, isPremium } from '../auth/AuthContext';
import AuthModal from '../auth/AuthModal';
import { startCheckout } from '../billing/api';
import { cn } from '../utils';

/**
 * Landing — pubblica e separata dalla dashboard.
 *   Header minimale (logo + Accedi/Dashboard)
 *   Hero con bottone "premium"
 *   Carosello auto-scroll delle funzioni
 *   Teaser 0DTE intrigante
 */
export default function LandingPage() {
    const { user, logout } = useAuth();
    const premium = isPremium(user);
    const [showAuth, setShowAuth] = useState(false);
    const navigate = useNavigate();

    const goDashboard = () => navigate('/dashboard');

    const onPrimaryCta = () => {
        if (!user) {
            setShowAuth(true);
        } else if (premium) {
            navigate('/dashboard');
        } else {
            // logged in but no trial yet → checkout
            startCheckout().catch(() => navigate('/dashboard'));
        }
    };

    return (
        <div className="min-h-screen bg-[#050505] text-gray-200 grain">
            {/* Landing-specific header */}
            <header data-testid="landing-header" className="sticky top-0 z-40 bg-[#050505]/85 backdrop-blur-xl border-b border-white/[0.06]">
                <div className="max-w-7xl mx-auto px-6 sm:px-8 py-5 flex items-center justify-between gap-4">
                    <Link to="/" className="flex items-center gap-3 group">
                        <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-400 to-amber-600 flex items-center justify-center shadow-[0_0_20px_-4px_rgba(245,158,11,0.6)]">
                            <Target size={17} className="text-black" strokeWidth={2.5} />
                        </div>
                        <span className="font-display text-lg font-bold text-white tracking-tight">
                            Speculative <span className="text-amber-400">Alpha</span>
                        </span>
                    </Link>
                    <div className="flex items-center gap-2">
                        {user ? (
                            <>
                                <span className="hidden sm:inline-flex items-center gap-2 text-[12px] text-gray-300 px-3 py-2 rounded-2xl border border-white/10 bg-white/[0.04]">
                                    <UserCircle2 size={14} className="text-amber-400" />
                                    {user.email}
                                </span>
                                <button
                                    data-testid="landing-go-dashboard"
                                    onClick={goDashboard}
                                    className="px-4 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-bold uppercase tracking-[0.18em] flex items-center gap-2"
                                >
                                    Dashboard
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
                                onClick={() => setShowAuth(true)}
                                className="px-5 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black text-[12px] font-bold uppercase tracking-[0.18em] flex items-center gap-2"
                            >
                                <LogIn size={13} /> Accedi
                            </button>
                        )}
                    </div>
                </div>
            </header>

            <main className="max-w-7xl mx-auto px-6 sm:px-8 py-14 sm:py-20 space-y-16 relative z-10">
                <Hero onCta={onPrimaryCta} />
                <FeaturesMarquee />
                <ZeroDTETeaser />
                <SecondaryCta onCta={onPrimaryCta} hasUser={!!user} />
            </main>

            <footer className="border-t border-white/[0.06] mt-12 py-8">
                <div className="max-w-7xl mx-auto px-6 sm:px-8 flex flex-wrap items-center justify-between gap-3 text-[11px] text-gray-500 uppercase tracking-[0.22em]">
                    <span>© 2026 Speculative Alpha</span>
                    <span className="font-mono">Data · CFTC Commitment of Traders</span>
                </div>
            </footer>

            <AuthModal open={showAuth} onClose={() => setShowAuth(false)} />
        </div>
    );
}

/* --------------------------------- HERO --------------------------------- */
function Hero({ onCta }) {
    return (
        <section data-testid="landing-hero" className="relative">
            <motion.div
                initial={{ opacity: 0, y: 12 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-[36px] border border-white/[0.08] bg-gradient-to-br from-[#13131a] via-[#0c0c10] to-black p-10 sm:p-16"
            >
                <div className="pointer-events-none absolute -top-32 -right-40 w-[480px] h-[480px] rounded-full bg-amber-500/[0.12] blur-3xl" />
                <div className="pointer-events-none absolute -bottom-40 -left-20 w-[400px] h-[400px] rounded-full bg-sky-500/[0.08] blur-3xl" />

                <div className="relative max-w-3xl">
                    <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase font-bold text-amber-300 mb-5 border border-amber-500/30 bg-amber-500/[0.06] rounded-full px-3 py-1.5">
                        <Sparkles size={11} />
                        Speculative Alpha
                    </div>
                    <h1 className="font-display text-4xl sm:text-5xl lg:text-[68px] font-bold text-white tracking-tight leading-[1.02] mb-6">
                        Vedi <span className="text-amber-400">cosa muove</span><br />
                        i mercati prima<br />degli altri.
                    </h1>
                    <p className="text-[15px] sm:text-[17px] text-gray-400 leading-relaxed mb-9 max-w-xl">
                        Sintetizziamo posizionamento <strong className="text-gray-200">COT istituzionale</strong>,
                        opzioni e hedger in un unico segnale: il <strong className="text-amber-300">Confluence Index</strong>.
                        Niente rumore, solo dove i grandi capitali si stanno muovendo davvero.
                    </p>

                    <PremiumCTA onCta={onCta} />

                    <div className="mt-6 flex items-center gap-3 text-[11px] text-gray-500 uppercase tracking-[0.22em] font-mono">
                        <Lock size={11} className="text-amber-400/60" />
                        7 giorni gratis · 18 asset · aggiornato ogni venerdì
                    </div>
                </div>
            </motion.div>
        </section>
    );
}

function PremiumCTA({ onCta }) {
    return (
        <motion.button
            data-testid="landing-cta-btn"
            onClick={onCta}
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            className="group relative inline-flex items-center gap-3 px-8 py-4 rounded-2xl bg-gradient-to-r from-amber-500 to-amber-400 text-black font-bold uppercase tracking-[0.22em] text-[13px] shadow-[0_0_40px_-8px_rgba(245,158,11,0.7)] transition-shadow hover:shadow-[0_0_50px_-4px_rgba(245,158,11,0.9)]"
        >
            <span className="absolute inset-0 rounded-2xl bg-gradient-to-r from-amber-300 to-amber-500 opacity-0 group-hover:opacity-100 transition-opacity" />
            <span className="relative">Entra nella dashboard</span>
            <span className="relative w-7 h-7 rounded-full bg-black/15 flex items-center justify-center group-hover:bg-black/20 transition-colors">
                <ArrowRight size={14} className="transition-transform group-hover:translate-x-0.5" />
            </span>
        </motion.button>
    );
}

/* --------------------------- FEATURES MARQUEE --------------------------- */
const FEATURES = [
    {
        icon: Target,
        title: 'Confluence Index',
        desc: 'Un solo numero 0-100 per capire quando istituzionali, opzioni e hedger sono allineati.',
        tone: 'amber',
    },
    {
        icon: BarChart3,
        title: 'Track Record verificato',
        desc: 'Backtest settimanale su 12 mesi: la direzione è confermata quando il CI è alto.',
        tone: 'sky',
    },
    {
        icon: Activity,
        title: 'Macro & Opzioni live',
        desc: 'Eventi macro 2/3 stelle, max pain, gamma walls, regime GEX — tutto integrato.',
        tone: 'violet',
    },
    {
        icon: LineChart,
        title: 'COT Trend Opportunities',
        desc: 'Ranking settimanale dei setup più forti, ordinati per Confluence Index.',
        tone: 'emerald',
    },
    {
        icon: Layers,
        title: '18 asset coperti',
        desc: 'Forex majors, indici equity, commodities — tutto sotto un unico schermo.',
        tone: 'amber',
    },
    {
        icon: Eye,
        title: 'Heatmap & Currency Strength',
        desc: 'Vedi a colpo d\'occhio quale valuta è forte e quale debole, in tempo reale.',
        tone: 'sky',
    },
    {
        icon: Zap,
        title: 'AI insights settimanali',
        desc: 'Verdetti generati automaticamente ogni sabato dopo il rilascio COT.',
        tone: 'violet',
    },
];

function FeaturesMarquee() {
    // Duplicate the list so the marquee loops seamlessly.
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
                    Tutto in un'unica dashboard
                </div>
                <h2 className="font-display text-3xl sm:text-4xl font-bold text-white">
                    Le funzioni che fanno la differenza
                </h2>
            </div>

            {/* Fade edges */}
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
function ZeroDTETeaser() {
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
                        In arrivo · Q2 2026
                    </div>
                    <h2 className="font-display text-3xl sm:text-4xl font-bold text-white tracking-tight leading-tight mb-4">
                        Il prossimo livello.<br />
                        <span className="text-violet-300">Opzioni 0DTE</span> intraday.
                    </h2>
                    <p className="text-[14px] text-gray-400 leading-relaxed max-w-lg">
                        Stiamo costruendo l'unica vista integrata sui flussi zero-day:
                        <strong className="text-violet-200"> gamma in tempo reale</strong>, walls dinamici, dealer positioning.
                        Una rivoluzione per chi fa scalping di precisione.
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
                        coming soon
                    </span>
                </div>
            </div>
        </motion.section>
    );
}

/* ------------------------------ SECONDARY CTA --------------------------- */
function SecondaryCta({ onCta, hasUser }) {
    return (
        <section className="text-center py-10">
            <h3 className="font-display text-2xl sm:text-3xl font-bold text-white mb-3">
                Pronto a vedere il quadro completo?
            </h3>
            <p className="text-[14px] text-gray-400 mb-7 max-w-md mx-auto">
                {hasUser
                    ? 'La tua dashboard ti aspetta.'
                    : 'Esplora gli asset gratis. 7 giorni di prova, nessuna carta richiesta.'}
            </p>
            <PremiumCTA onCta={onCta} />
        </section>
    );
}
