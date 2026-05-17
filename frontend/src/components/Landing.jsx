import React from 'react';
import { motion } from 'framer-motion';
import {
    ArrowRight,
    BarChart3,
    Layers,
    Activity,
    Sparkles,
    Lock,
    Target,
    TrendingUp,
} from 'lucide-react';

/**
 * Short, evocative landing shown above the dashboard for anonymous visitors.
 * Designed to live in-line with the existing dashboard aesthetic (amber + black).
 */
export default function Landing({ onCta }) {
    return (
        <section data-testid="landing-hero" className="relative -mt-4 mb-12">
            {/* Hero */}
            <motion.div
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.7, ease: [0.22, 1, 0.36, 1] }}
                className="relative overflow-hidden rounded-[32px] border border-white/[0.08] bg-gradient-to-br from-[#13131a] via-[#0c0c10] to-black p-10 sm:p-14"
            >
                {/* Decorative gradient */}
                <div className="pointer-events-none absolute -top-20 -right-32 w-[420px] h-[420px] rounded-full bg-amber-500/[0.08] blur-3xl" />
                <div className="pointer-events-none absolute -bottom-32 -left-20 w-[360px] h-[360px] rounded-full bg-sky-500/[0.06] blur-3xl" />

                <div className="relative max-w-2xl">
                    <div className="inline-flex items-center gap-2 text-[10px] tracking-[0.3em] uppercase font-bold text-amber-300 mb-4 border border-amber-500/30 bg-amber-500/[0.06] rounded-full px-3 py-1.5">
                        <Sparkles size={11} />
                        Institutional COT Intelligence
                    </div>
                    <h1 className="font-display text-4xl sm:text-5xl lg:text-6xl font-bold text-white tracking-tight leading-[1.05] mb-5">
                        Vedi <span className="text-amber-400">cosa muove</span><br />
                        i mercati prima degli altri.
                    </h1>
                    <p className="text-[15px] sm:text-base text-gray-400 leading-relaxed mb-7 max-w-xl">
                        Speculative Alpha sintetizza posizionamento <strong className="text-gray-200">COT istituzionale</strong>,
                        opzioni e sentiment dei commercials in un unico segnale 0-100 — il <strong className="text-amber-300">Confluence Index</strong>.
                        Niente rumore, solo dove i grandi capitali si stanno muovendo davvero.
                    </p>

                    <div className="flex flex-wrap items-center gap-3">
                        <button
                            data-testid="landing-cta-btn"
                            onClick={onCta}
                            className="group px-6 py-3 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-[0.18em] text-[12px] transition flex items-center gap-2"
                        >
                            Esplora gli asset
                            <ArrowRight size={14} className="transition-transform group-hover:translate-x-1" />
                        </button>
                        <div className="text-[11px] text-gray-500 uppercase tracking-[0.22em] font-mono">
                            18 asset · 3 stream · aggiornato ogni venerdì
                        </div>
                    </div>
                </div>
            </motion.div>

            {/* Feature strip */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-6">
                <Feature
                    icon={Target}
                    title="Confluence Index"
                    desc="Un solo numero 0-100 per capire quando istituzionali, opzioni e hedger sono allineati."
                />
                <Feature
                    icon={BarChart3}
                    title="Track Record verificato"
                    desc="Backtest settimanale su 12 mesi: la direzione è confermata quando il CI è alto."
                />
                <Feature
                    icon={Activity}
                    title="Macro & Opzioni live"
                    desc="Eventi macro 2/3 stelle, max pain, gamma walls, regime GEX — tutto integrato."
                />
            </div>

            {/* 0DTE teaser */}
            <motion.div
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.5, delay: 0.2 }}
                className="mt-6 rounded-3xl border border-violet-400/25 bg-gradient-to-r from-violet-500/[0.07] via-indigo-500/[0.04] to-transparent p-5 flex flex-wrap items-center justify-between gap-4"
            >
                <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-violet-500/20 border border-violet-400/40 flex items-center justify-center">
                        <TrendingUp size={16} className="text-violet-200" />
                    </div>
                    <div>
                        <div className="text-[10px] tracking-[0.3em] uppercase font-bold text-violet-200 mb-0.5">
                            Prossimamente
                        </div>
                        <div className="text-[14px] text-white font-semibold">
                            <span className="font-mono text-violet-200">0DTE</span> · Signal Stream sulle opzioni zero-day di SPX & QQQ
                        </div>
                        <div className="text-[12px] text-gray-400 mt-0.5">
                            Gamma exposure intraday e walls dinamici per scalping di precisione.
                        </div>
                    </div>
                </div>
                <span className="text-[10px] uppercase tracking-[0.22em] font-bold text-violet-200 border border-violet-400/30 rounded-full px-3 py-1.5">
                    Q2 2026
                </span>
            </motion.div>

            {/* Inline reassurance */}
            <div className="mt-7 flex items-center justify-center gap-2 text-[11px] text-gray-500 uppercase tracking-[0.22em]">
                <Lock size={11} className="text-amber-400/60" />
                7 giorni di prova gratuita · nessuna carta richiesta per esplorare
            </div>
        </section>
    );
}

function Feature({ icon: Icon, title, desc }) {
    return (
        <div className="rounded-2xl border border-white/[0.07] bg-[#0b0b10] p-5">
            <div className="w-9 h-9 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center mb-3">
                <Icon size={15} className="text-amber-300" />
            </div>
            <div className="text-[13px] font-semibold text-white mb-1">{title}</div>
            <p className="text-[12px] text-gray-400 leading-relaxed">{desc}</p>
        </div>
    );
}
