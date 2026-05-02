import React, { useMemo, useState, useEffect } from 'react';
import { motion } from 'framer-motion';
import {
    Compass,
    TrendingUp,
    TrendingDown,
    Zap,
    ArrowRight,
    AlertTriangle,
    Scale,
    ArrowLeftRight,
} from 'lucide-react';
import { cn, formatNumber, formatSigned } from '../utils';

// Map currency assetId -> display data. NO emoji/flags.
const CURRENCY_LABELS = {
    EURUSD: { code: 'EUR', name: 'Euro' },
    GBPUSD: { code: 'GBP', name: 'Sterlina' },
    USDJPY: { code: 'JPY', name: 'Yen Giapponese' },
    AUDUSD: { code: 'AUD', name: 'Dollaro Australiano' },
    USDCAD: { code: 'CAD', name: 'Dollaro Canadese' },
    USDCHF: { code: 'CHF', name: 'Franco Svizzero' },
    NZDUSD: { code: 'NZD', name: 'Dollaro Neozelandese' },
};

const PAIR_MAP = {
    EUR_GBP: 'EURGBP', EUR_JPY: 'EURJPY', EUR_AUD: 'EURAUD', EUR_CAD: 'EURCAD',
    EUR_CHF: 'EURCHF', EUR_NZD: 'EURNZD', GBP_JPY: 'GBPJPY', GBP_AUD: 'GBPAUD',
    GBP_CAD: 'GBPCAD', GBP_CHF: 'GBPCHF', GBP_NZD: 'GBPNZD', AUD_JPY: 'AUDJPY',
    AUD_NZD: 'AUDNZD', AUD_CAD: 'AUDCAD', AUD_CHF: 'AUDCHF', CAD_JPY: 'CADJPY',
    CHF_JPY: 'CHFJPY', NZD_JPY: 'NZDJPY', NZD_CAD: 'NZDCAD', NZD_CHF: 'NZDCHF',
    CAD_CHF: 'CADCHF',
    EUR_USD: 'EURUSD', GBP_USD: 'GBPUSD', AUD_USD: 'AUDUSD', NZD_USD: 'NZDUSD',
    USD_JPY: 'USDJPY', USD_CAD: 'USDCAD', USD_CHF: 'USDCHF',
};

function suggestPair(strongCode, weakCode) {
    const direct = PAIR_MAP[`${strongCode}_${weakCode}`];
    if (direct) return { pair: direct, side: 'LONG' };
    const reverse = PAIR_MAP[`${weakCode}_${strongCode}`];
    if (reverse) return { pair: reverse, side: 'SHORT' };
    return null;
}

// Strength score combining net position ratio and momentum
function strengthScore(c) {
    if (!c) return 0;
    const total = (c.long || 0) + (c.short || 0) || 1;
    const netRatio = (c.netPosition || 0) / total;          // -1..+1
    const deltaRatio = (c.wowDelta || 0) / total;            // momentum
    return netRatio * 1.0 + deltaRatio * 1.4;
}

// Significance of weekly momentum: |delta| / |net|, capped 0..1
function momentumSignificance(c) {
    const abs = Math.abs(c.netPosition || 0) || 1;
    return Math.min(1, Math.abs(c.wowDelta || 0) / abs);
}

export default function CurrencyStrengthIndex({ assets, onPick }) {
    // Filter only currencies present in CURRENCY_LABELS
    const currencies = useMemo(
        () =>
            assets
                .filter((a) => CURRENCY_LABELS[a.assetId])
                .map((a) => ({
                    ...a,
                    code: CURRENCY_LABELS[a.assetId].code,
                    ccyName: CURRENCY_LABELS[a.assetId].name,
                })),
        [assets]
    );

    // USD synthetic strength: opposite of average currency net (net long currencies => USD weak)
    const usdSynth = useMemo(() => {
        if (!currencies.length) return null;
        const avgNet = currencies.reduce((s, c) => s + (c.netPosition || 0), 0) / currencies.length;
        const avgDelta = currencies.reduce((s, c) => s + (c.wowDelta || 0), 0) / currencies.length;
        // For score normalization, give it a synthetic long/short proxy
        const longSyn = Math.max(0, -avgNet);
        const shortSyn = Math.max(0, avgNet);
        return {
            assetId: 'USD',
            code: 'USD',
            ccyName: 'Dollaro USA (sintetico)',
            netPosition: -Math.round(avgNet),
            wowDelta: -Math.round(avgDelta),
            long: Math.round(longSyn),
            short: Math.round(shortSyn),
            synthetic: true,
        };
    }, [currencies]);

    const ranked = useMemo(() => {
        const list = usdSynth ? [...currencies, usdSynth] : [...currencies];
        return list
            .map((c) => ({ ...c, _score: strengthScore(c), _mom: momentumSignificance(c) }))
            .sort((a, b) => (b.netPosition || 0) - (a.netPosition || 0));
    }, [currencies, usdSynth]);

    const maxAbs = useMemo(
        () => Math.max(1, ...ranked.map((c) => Math.abs(c.netPosition || 0))),
        [ranked]
    );

    const strongest = ranked[0];
    const weakest = ranked[ranked.length - 1];

    // Trade Ideas: ALL currency pairs with significant divergence (score gap or strong momentum on either side)
    const tradeIdeas = useMemo(() => {
        const list = ranked;
        const ideas = [];
        for (let i = 0; i < list.length; i++) {
            for (let j = i + 1; j < list.length; j++) {
                const a = list[i];
                const b = list[j];
                const strong = a._score >= b._score ? a : b;
                const weak = a._score >= b._score ? b : a;
                const pair = suggestPair(strong.code, weak.code);
                if (!pair) continue;
                const scoreGap = Math.abs(a._score - b._score);
                const maxMomentum = Math.max(a._mom, b._mom);
                // Significance threshold: opportunity if either there is meaningful score gap OR
                // at least one currency has momentum > 50% of its absolute position.
                const isSignificant = scoreGap > 0.5 || maxMomentum > 0.5;
                if (!isSignificant) continue;
                // Filter out trivial duplicates
                ideas.push({
                    strong,
                    weak,
                    pair: pair.pair,
                    side: pair.side,
                    scoreGap,
                    momentum: maxMomentum,
                    rank: scoreGap * 0.7 + maxMomentum * 0.6,
                });
            }
        }
        const seen = new Set();
        return ideas
            .filter((x) => {
                if (seen.has(x.pair)) return false;
                seen.add(x.pair);
                return true;
            })
            .sort((x, y) => y.rank - x.rank)
            .slice(0, 6);
    }, [ranked]);

    // Strong absolute trends: currencies with abs(net) > 60% maxAbs
    const trendAlerts = useMemo(() => {
        return ranked
            .filter((c) => Math.abs(c.netPosition || 0) > maxAbs * 0.55)
            .map((c) => ({
                ...c,
                bias: (c.netPosition || 0) > 0 ? 'BULLISH' : 'BEARISH',
                aligned: Math.sign(c.netPosition || 0) === Math.sign(c.wowDelta || 0),
            }))
            .slice(0, 4);
    }, [ranked, maxAbs]);

    const narrative = useMemo(() => {
        if (!strongest || !weakest) return '';
        const sName = strongest.code;
        const wName = weakest.code;
        const sNet = formatSigned(strongest.netPosition);
        const wNet = formatSigned(weakest.netPosition);
        const spread = Math.abs((strongest.netPosition || 0) - (weakest.netPosition || 0));
        const dominance =
            spread > maxAbs * 1.6 ? 'estrema' : spread > maxAbs * 0.9 ? 'forte' : 'moderata';
        let momentum;
        if ((strongest.wowDelta || 0) > 0 && (weakest.wowDelta || 0) < 0) {
            momentum = `Momentum settimanale conferma la divergenza: ${sName} continua ad accumulare flussi long, ${wName} viene ulteriormente venduto.`;
        } else if ((strongest.wowDelta || 0) < 0 && (weakest.wowDelta || 0) > 0) {
            momentum = `Attenzione: il momentum è in inversione (${sName} perde flussi, ${wName} viene ricoperto). Possibile rotazione in atto.`;
        } else {
            momentum = `Momentum misto: monitorare il prossimo report COT per conferme prima di operare.`;
        }
        return `${sName} è la valuta più forte secondo i flussi Non-Commercial (Net ${sNet}); ${wName} è la più debole (Net ${wNet}). Dominanza relativa ${dominance}. ${momentum}`;
    }, [strongest, weakest, maxAbs]);

    // ---- Confronto Diretto (integrated, currencies only) ----
    const [pickAId, setPickAId] = useState(null);
    const [pickBId, setPickBId] = useState(null);

    useEffect(() => {
        if (!ranked.length) return;
        if (!pickAId) setPickAId(ranked[0]?.assetId);
        if (!pickBId) setPickBId(ranked[ranked.length - 1]?.assetId);
    }, [ranked, pickAId, pickBId]);

    const pickA = useMemo(() => ranked.find((x) => x.assetId === pickAId), [ranked, pickAId]);
    const pickB = useMemo(() => ranked.find((x) => x.assetId === pickBId), [ranked, pickBId]);

    const compareAnalysis = useMemo(() => {
        if (!pickA || !pickB) return null;
        const sA = pickA._score;
        const sB = pickB._score;
        const diff = sA - sB;
        const absDiff = Math.abs(diff);
        const tone = absDiff < 0.3 ? 'neutral' : diff > 0 ? 'bullish' : 'bearish';
        const winner = diff > 0 ? pickA : pickB;
        const loser = diff > 0 ? pickB : pickA;
        const pair = suggestPair(winner.code, loser.code);
        let title, body, hint;
        if (tone === 'neutral') {
            title = `Equilibrio fra ${pickA.code} e ${pickB.code}`;
            body = `I flussi istituzionali sono speculari (score Δ ${absDiff.toFixed(2)}). Non emerge un edge direzionale chiaro.`;
            hint = 'Strategia: attendere break tecnico o nuovo report COT prima di operare.';
        } else {
            const winMomentum = (winner.wowDelta || 0) >= 0 ? 'in accumulazione' : 'in distribuzione';
            const losMomentum = (loser.wowDelta || 0) >= 0 ? 'in accumulazione' : 'in distribuzione';
            title = `${winner.code} domina su ${loser.code}`;
            body = `${winner.code} è ${winMomentum} (Δ ${formatSigned(winner.wowDelta)}, Net ${formatSigned(winner.netPosition)}), mentre ${loser.code} è ${losMomentum} (Δ ${formatSigned(loser.wowDelta)}, Net ${formatSigned(loser.netPosition)}).`;
            hint = pair
                ? `Bias istituzionale: ${pair.side} ${pair.pair} · score gap ${absDiff.toFixed(2)}.`
                : `Edge sulla forza relativa di ${winner.code} su ${loser.code}.`;
        }
        return { tone, title, body, hint, pair };
    }, [pickA, pickB]);

    const compareToneClass = {
        bullish: 'border-[#10b981]/30 bg-[#10b981]/[0.06]',
        bearish: 'border-[#f43f5e]/30 bg-[#f43f5e]/[0.06]',
        neutral: 'border-white/10 bg-white/[0.02]',
    };

    if (!ranked.length) return null;

    return (
        <section
            data-testid="currency-strength-index"
            className="bg-gradient-to-b from-[#10101a] to-[#0a0a10] border border-white/[0.07] rounded-[32px] p-7 sm:p-10 relative soft-shadow"
        >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />

            <div className="flex flex-wrap items-start justify-between gap-4 mb-8">
                <div className="flex items-center gap-4">
                    <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                        <Compass className="text-amber-400" size={22} />
                    </div>
                    <div>
                        <div className="text-[12px] tracking-[0.3em] uppercase font-bold text-amber-400 mb-1">
                            Forex Strength Index
                        </div>
                        <h2 className="font-display text-2xl sm:text-[28px] font-bold text-white">
                            Forza Assoluta delle Valute
                        </h2>
                        <p className="text-[14px] text-gray-400 mt-2 max-w-2xl leading-relaxed">
                            Posizionamento Net Non-Commercial di ogni valuta vs USD. Ranking
                            dal più forte al più debole, con tutte le opportunità di pair forex
                            con divergenza significativa o momentum settimanale &gt; 50%.
                        </p>
                    </div>
                </div>
            </div>

            {/* Top + Bottom highlight cards */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-8">
                {strongest && (
                    <div className="bg-[#10b981]/[0.07] border border-[#10b981]/30 rounded-3xl p-5 flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-[#10b981]/15 border border-[#10b981]/40 flex items-center justify-center text-[#34d399]">
                            <TrendingUp size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[11px] tracking-[0.25em] uppercase font-semibold text-[#34d399] mb-1">
                                Valuta più forte
                            </div>
                            <div className="font-display text-2xl font-bold text-white truncate">
                                {strongest.code}
                                <span className="text-gray-400 text-base font-medium ml-2">
                                    · {strongest.ccyName}
                                </span>
                            </div>
                            <div className="font-mono text-[15px] text-gray-300 tnum mt-1">
                                Net <span className="text-white font-semibold">{formatNumber(strongest.netPosition)}</span>
                                <span className="text-gray-500 mx-2">·</span>
                                Δ <span className={cn(strongest.wowDelta >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]')}>
                                    {formatSigned(strongest.wowDelta)}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
                {weakest && (
                    <div className="bg-[#f43f5e]/[0.07] border border-[#f43f5e]/30 rounded-3xl p-5 flex items-center gap-4">
                        <div className="w-14 h-14 rounded-2xl bg-[#f43f5e]/15 border border-[#f43f5e]/40 flex items-center justify-center text-[#fb7185]">
                            <TrendingDown size={24} />
                        </div>
                        <div className="flex-1 min-w-0">
                            <div className="text-[11px] tracking-[0.25em] uppercase font-semibold text-[#fb7185] mb-1">
                                Valuta più debole
                            </div>
                            <div className="font-display text-2xl font-bold text-white truncate">
                                {weakest.code}
                                <span className="text-gray-400 text-base font-medium ml-2">
                                    · {weakest.ccyName}
                                </span>
                            </div>
                            <div className="font-mono text-[15px] text-gray-300 tnum mt-1">
                                Net <span className="text-white font-semibold">{formatNumber(weakest.netPosition)}</span>
                                <span className="text-gray-500 mx-2">·</span>
                                Δ <span className={cn(weakest.wowDelta >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]')}>
                                    {formatSigned(weakest.wowDelta)}
                                </span>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            <div className="bg-amber-500/[0.05] border border-amber-500/20 rounded-3xl p-5 mb-8">
                <div className="flex items-center gap-2 mb-2">
                    <Zap className="text-amber-400" size={15} />
                    <span className="text-[12px] tracking-[0.25em] uppercase font-semibold text-amber-300">
                        Analisi Macro
                    </span>
                </div>
                <p className="text-[15px] leading-relaxed text-gray-200">{narrative}</p>
            </div>

            {/* Ranking bars */}
            <div className="space-y-2.5 mb-10">
                {ranked.map((c, i) => {
                    const ratio = (c.netPosition || 0) / maxAbs;
                    const positive = (c.netPosition || 0) >= 0;
                    return (
                        <motion.button
                            data-testid={`strength-row-${c.code}`}
                            key={c.code}
                            onClick={() => !c.synthetic && onPick?.(c.assetId)}
                            initial={{ opacity: 0, x: -10 }}
                            animate={{ opacity: 1, x: 0 }}
                            transition={{ delay: i * 0.04 }}
                            className={cn(
                                'w-full text-left grid grid-cols-12 items-center gap-3 px-5 py-3.5 rounded-2xl border transition-colors',
                                c.synthetic
                                    ? 'bg-white/[0.02] border-white/[0.06] cursor-default'
                                    : 'bg-[#0d0d12] border-white/[0.06] hover:bg-[#15151c] hover:border-amber-500/30 cursor-pointer'
                            )}
                        >
                            <div className="col-span-1 flex items-center justify-center">
                                <span className="font-mono text-[13px] text-gray-500 font-semibold">
                                    #{i + 1}
                                </span>
                            </div>
                            <div className="col-span-3 min-w-0">
                                <div className="font-display text-[16px] font-bold text-white leading-tight flex items-center gap-2">
                                    <span>{c.code}</span>
                                    {c.synthetic && (
                                        <span className="text-[10px] text-amber-400/80 font-normal tracking-widest uppercase">
                                            Synth
                                        </span>
                                    )}
                                </div>
                                <div className="text-[12px] text-gray-500 leading-tight truncate">{c.ccyName}</div>
                            </div>
                            <div className="col-span-5 relative h-9 rounded-full bg-white/[0.04] overflow-hidden">
                                <div
                                    className={cn('absolute top-0 bottom-0', positive ? 'left-1/2' : 'right-1/2')}
                                    style={{
                                        width: `${Math.abs(ratio) * 50}%`,
                                        background: positive
                                            ? 'linear-gradient(90deg, rgba(16,185,129,0.3), rgba(52,211,153,0.7))'
                                            : 'linear-gradient(90deg, rgba(251,113,133,0.7), rgba(244,63,94,0.3))',
                                    }}
                                />
                                <div className="absolute inset-y-0 left-1/2 w-px bg-white/10" />
                            </div>
                            <div className="col-span-3 text-right">
                                <div
                                    className={cn(
                                        'font-mono text-[16px] font-semibold tnum',
                                        positive ? 'text-[#34d399]' : 'text-[#fb7185]'
                                    )}
                                >
                                    {formatNumber(c.netPosition)}
                                </div>
                                <div className="font-mono text-[12px] tnum text-gray-500">
                                    Δ {formatSigned(c.wowDelta)}
                                </div>
                            </div>
                        </motion.button>
                    );
                })}
            </div>

            {/* Trade ideas */}
            {tradeIdeas.length > 0 && (
                <div className="mb-10">
                    <div className="flex items-center gap-2 mb-4">
                        <ArrowRight className="text-amber-400" size={18} />
                        <h3 className="font-display text-xl font-bold text-white">
                            Opportunità Pair Forex (Divergenze + Momentum)
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                        {tradeIdeas.map((t, i) => (
                            <div
                                data-testid={`trade-idea-${t.pair}`}
                                key={t.pair}
                                className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-5 hover:border-amber-500/30 transition-colors"
                            >
                                <div className="flex items-center justify-between mb-3">
                                    <span
                                        className={cn(
                                            'inline-flex items-center px-3 py-1 rounded-full text-[11px] font-bold tracking-[0.2em] uppercase',
                                            t.side === 'LONG'
                                                ? 'bg-[#10b981]/15 text-[#34d399] border border-[#10b981]/30'
                                                : 'bg-[#f43f5e]/15 text-[#fb7185] border border-[#f43f5e]/30'
                                        )}
                                    >
                                        {t.side}
                                    </span>
                                    <span className="text-[11px] uppercase tracking-[0.18em] text-gray-500 font-semibold">
                                        Idea #{i + 1}
                                    </span>
                                </div>
                                <div className="font-display text-[26px] font-bold text-white tracking-tight mb-2">
                                    {t.pair}
                                </div>
                                <p className="text-[13.5px] leading-relaxed text-gray-300">
                                    <strong className="text-[#34d399]">{t.strong.code}</strong>{' '}
                                    {t.strong.netPosition >= 0 ? 'long' : 'short'} (Net{' '}
                                    {formatSigned(t.strong.netPosition)}, Δ {formatSigned(t.strong.wowDelta)}){' '}
                                    vs <strong className="text-[#fb7185]">{t.weak.code}</strong>{' '}
                                    {t.weak.netPosition >= 0 ? 'long' : 'short'} (Net{' '}
                                    {formatSigned(t.weak.netPosition)}, Δ {formatSigned(t.weak.wowDelta)}).
                                </p>
                                <div className="mt-3 grid grid-cols-2 gap-2 text-[11.5px]">
                                    <div className="bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                                        <div className="text-gray-500 uppercase tracking-widest font-semibold text-[10px] mb-0.5">
                                            Score gap
                                        </div>
                                        <div className="font-mono text-amber-300 font-semibold tnum">
                                            {t.scoreGap.toFixed(2)}
                                        </div>
                                    </div>
                                    <div className="bg-black/30 border border-white/5 rounded-xl px-3 py-2">
                                        <div className="text-gray-500 uppercase tracking-widest font-semibold text-[10px] mb-0.5">
                                            Momentum
                                        </div>
                                        <div className="font-mono text-amber-300 font-semibold tnum">
                                            {(t.momentum * 100).toFixed(0)}%
                                        </div>
                                    </div>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* Trend Alerts */}
            {trendAlerts.length > 0 && (
                <div className="mb-10">
                    <div className="flex items-center gap-2 mb-4">
                        <AlertTriangle className="text-amber-400" size={18} />
                        <h3 className="font-display text-xl font-bold text-white">
                            Trend Assoluti Rilevanti
                        </h3>
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
                        {trendAlerts.map((c) => {
                            const positive = (c.netPosition || 0) > 0;
                            return (
                                <div
                                    data-testid={`trend-alert-${c.code}`}
                                    key={c.code}
                                    className={cn(
                                        'rounded-3xl p-4 border',
                                        positive
                                            ? 'bg-[#10b981]/[0.05] border-[#10b981]/25'
                                            : 'bg-[#f43f5e]/[0.05] border-[#f43f5e]/25'
                                    )}
                                >
                                    <div className="flex items-center justify-between mb-2">
                                        <span className="font-display text-[18px] font-bold text-white">
                                            {c.code}
                                        </span>
                                        <span
                                            className={cn(
                                                'text-[10px] font-bold tracking-[0.22em] uppercase px-2 py-0.5 rounded-full',
                                                positive
                                                    ? 'text-[#34d399] bg-[#10b981]/15'
                                                    : 'text-[#fb7185] bg-[#f43f5e]/15'
                                            )}
                                        >
                                            {c.bias}
                                        </span>
                                    </div>
                                    <div className="font-mono text-[14px] text-gray-300 tnum mb-1">
                                        Net <span className="text-white font-semibold">{formatNumber(c.netPosition)}</span>
                                    </div>
                                    <div className="text-[12.5px] text-gray-400 leading-snug">
                                        {c.aligned
                                            ? `Trend ${positive ? 'long' : 'short'} confermato dal momentum WoW.`
                                            : 'Possibile inversione: posizione assoluta forte ma momentum opposto.'}
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                </div>
            )}

            {/* Confronto Diretto integrato (solo valute) */}
            <div data-testid="forex-pair-compare">
                <div className="flex flex-wrap items-center justify-between gap-3 mb-4">
                    <div className="flex items-center gap-2">
                        <Scale className="text-amber-400" size={18} />
                        <h3 className="font-display text-xl font-bold text-white">
                            Confronto Diretto Valute
                        </h3>
                    </div>
                    <div className="flex items-center gap-2 bg-black/30 border border-white/10 p-1.5 rounded-2xl">
                        <select
                            data-testid="pair-asset-a"
                            value={pickAId || ''}
                            onChange={(e) => setPickAId(e.target.value)}
                            className="bg-transparent text-white font-mono text-[13px] font-semibold px-3 py-2 outline-none cursor-pointer rounded-xl hover:bg-white/5"
                        >
                            {ranked.map((x) => (
                                <option key={x.assetId} value={x.assetId} className="bg-[#0a0a0d]">
                                    {`${x.code} · ${x.ccyName}`}
                                </option>
                            ))}
                        </select>
                        <span className="text-gray-500 text-[12px] font-bold tracking-widest">VS</span>
                        <select
                            data-testid="pair-asset-b"
                            value={pickBId || ''}
                            onChange={(e) => setPickBId(e.target.value)}
                            className="bg-transparent text-white font-mono text-[13px] font-semibold px-3 py-2 outline-none cursor-pointer rounded-xl hover:bg-white/5"
                        >
                            {ranked.map((x) => (
                                <option key={x.assetId} value={x.assetId} className="bg-[#0a0a0d]">
                                    {`${x.code} · ${x.ccyName}`}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {pickA && pickB && compareAnalysis && (
                    <div className={cn('rounded-[28px] border p-7', compareToneClass[compareAnalysis.tone])}>
                        <div className="flex items-start gap-4 mb-6">
                            <div className="w-12 h-12 rounded-2xl border border-white/10 bg-black/30 flex items-center justify-center shrink-0 text-amber-400">
                                <ArrowLeftRight size={20} />
                            </div>
                            <div className="flex-1">
                                <h4 className="font-display text-xl font-bold text-white mb-2">
                                    {compareAnalysis.title}
                                </h4>
                                <p className="text-[15px] leading-relaxed text-gray-300 mb-2">{compareAnalysis.body}</p>
                                <p className="text-[13.5px] leading-relaxed text-amber-300/80 italic">
                                    {compareAnalysis.hint}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5 border-t border-white/5">
                            {[pickA, pickB].map((x, i) => (
                                <div
                                    key={i}
                                    className="bg-black/25 rounded-2xl p-4 border border-white/[0.05]"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <span className="font-display text-[16px] font-bold text-white">
                                            {x.code}
                                        </span>
                                        <span className="text-[11px] text-gray-500 font-mono">{x.ccyName}</span>
                                    </div>
                                    <div className="font-mono text-[26px] font-semibold text-white tnum mb-2">
                                        {formatNumber(x.netPosition)}
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-[12px]">
                                        <div>
                                            <div className="text-gray-500 uppercase tracking-widest font-semibold text-[10.5px]">
                                                Δ WoW
                                            </div>
                                            <div className={cn('font-mono font-semibold tnum', (x.wowDelta || 0) >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]')}>
                                                {formatSigned(x.wowDelta)}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-gray-500 uppercase tracking-widest font-semibold text-[10.5px]">
                                                Long
                                            </div>
                                            <div className="font-mono text-[#34d399] tnum">{formatNumber(x.long)}</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-500 uppercase tracking-widest font-semibold text-[10.5px]">
                                                Short
                                            </div>
                                            <div className="font-mono text-[#fb7185] tnum">{formatNumber(x.short)}</div>
                                        </div>
                                    </div>
                                </div>
                            ))}
                        </div>
                    </div>
                )}
            </div>
        </section>
    );
}
