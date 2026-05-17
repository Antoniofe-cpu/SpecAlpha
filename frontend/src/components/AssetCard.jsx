import React, { useState } from 'react';
import ReactDOM from 'react-dom';
import { motion } from 'framer-motion';
import { Maximize2, Activity, RefreshCw, Star, Info, Lock } from 'lucide-react';
import { cn, formatNumber, formatSigned, getTrendAnalysis } from '../utils';
import { useT } from '../i18n';

const tonePill = {
    bullish: 'border-[#10b981]/30 text-[#34d399] bg-[#10b981]/10',
    bearish: 'border-[#f43f5e]/30 text-[#fb7185] bg-[#f43f5e]/10',
    accumulation: 'border-amber-400/30 text-amber-300 bg-amber-400/10',
    distribution: 'border-orange-400/30 text-orange-300 bg-orange-400/10',
    neutral: 'border-white/10 text-gray-300 bg-white/5',
};

function InfoTooltip({ text, label }) {
    const [open, setOpen] = useState(false);
    const ref = React.useRef(null);
    const [pos, setPos] = useState({ top: 0, left: 0 });

    React.useEffect(() => {
        if (!open || !ref.current) return;
        const r = ref.current.getBoundingClientRect();
        setPos({ top: r.bottom + 8, left: Math.min(window.innerWidth - 296, r.right - 280) });
    }, [open]);

    return (
        <span className="relative inline-flex items-center">
            <button
                ref={ref}
                type="button"
                onClick={(e) => {
                    e.stopPropagation();
                    setOpen((o) => !o);
                }}
                onMouseEnter={() => setOpen(true)}
                onMouseLeave={() => setOpen(false)}
                aria-label={label}
                className="text-gray-400 hover:text-amber-400 transition-colors"
            >
                <Info size={14} />
            </button>
            {open &&
                ReactDOM.createPortal(
                    <div
                        onClick={(e) => e.stopPropagation()}
                        onMouseEnter={() => setOpen(true)}
                        onMouseLeave={() => setOpen(false)}
                        style={{ position: 'fixed', top: pos.top, left: pos.left, width: 280 }}
                        className="z-[200] text-[13px] leading-snug font-normal normal-case tracking-normal text-gray-200 bg-[#0a0a0d] border border-white/15 rounded-2xl p-4 shadow-2xl"
                    >
                        {text}
                    </div>,
                    document.body
                )}
        </span>
    );
}

export default function AssetCard({ asset, isLoading, isFavorite, onClick, onToggleFav, index = 0, locked = false }) {
    const { t } = useT();
    const trend = getTrendAnalysis(asset);
    const total = (asset?.long || 0) + (asset?.short || 0) || 1;
    const longRatio = ((asset?.long || 0) / total) * 100;
    const oiText = (
        <span>
            <strong className="text-amber-300">{t('card.oi_share')}</strong> — {t('card.oi_tooltip_html')}
        </span>
    );

    return (
        <motion.div
            data-testid={`asset-card-${asset.assetId}${locked ? '-locked' : ''}`}
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.5, delay: index * 0.04, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -4 }}
            onClick={onClick}
            className="relative bg-gradient-to-b from-[#13131a] to-[#0d0d12] border border-white/[0.08] rounded-[28px] p-7 cursor-pointer hover:border-amber-500/30 hover:from-[#16161e] hover:to-[#101015] transition-colors group soft-shadow overflow-hidden"
        >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

            {/* Inner content — gets blurred when locked */}
            <div className={cn('relative', locked && 'pointer-events-none select-none blur-[10px] saturate-50 opacity-70')}>
                <CardBody
                    asset={asset}
                    isFavorite={isFavorite}
                    onToggleFav={onToggleFav}
                    trend={trend}
                    longRatio={longRatio}
                    oiText={oiText}
                    t={t}
                />
            </div>

            {locked && (
                <div
                    data-testid={`paywall-overlay-${asset.assetId}`}
                    className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-10"
                >
                    <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center mb-3 shadow-[0_0_30px_-6px_rgba(245,158,11,0.45)]">
                        <Lock size={18} className="text-amber-300" />
                    </div>
                    <div className="text-[10px] tracking-[0.28em] uppercase font-bold text-amber-300 mb-1">
                        Premium
                    </div>
                    <div className="font-display text-[16px] font-semibold text-white leading-snug mb-2">
                        {asset.name}
                    </div>
                    <p className="text-[12px] text-gray-400 max-w-[220px] leading-relaxed mb-3">
                        Sblocca questo asset con la prova gratuita di 7 giorni.
                    </p>
                    <span className="text-[11px] uppercase tracking-[0.22em] font-bold text-amber-400">
                        Accedi →
                    </span>
                </div>
            )}
        </motion.div>
    );
}

function CardBody({ asset, isFavorite, onToggleFav, trend, longRatio, oiText, t }) {
    return (
        <>
            <div className="flex items-start justify-between mb-6">
                <div>
                    <div className="text-[11px] tracking-[0.28em] uppercase font-semibold text-amber-400/90 mb-1.5">
                        {asset.type}
                    </div>
                    <h3 className="font-display text-[22px] font-bold text-white leading-tight">
                        {asset.name}
                    </h3>
                    <div className="text-[12px] tracking-[0.18em] uppercase text-gray-500 mt-1.5 font-mono">
                        {asset.assetId}
                    </div>
                </div>
                <div className="flex items-center gap-1">
                    <button
                        data-testid={`fav-toggle-${asset.assetId}`}
                        onClick={(e) => {
                            e.stopPropagation();
                            onToggleFav?.(asset.assetId);
                        }}
                        className={cn(
                            'p-2 rounded-full transition-colors',
                            isFavorite ? 'text-amber-400 bg-amber-400/10' : 'text-gray-500 hover:text-amber-400 hover:bg-white/5'
                        )}
                        aria-label="favorite"
                    >
                        <Star size={16} fill={isFavorite ? '#fcd34d' : 'transparent'} />
                    </button>
                    <div className="p-2 text-gray-500 group-hover:text-amber-400 transition-colors">
                        <Maximize2 size={16} />
                    </div>
                </div>
            </div>

            <div
                className={cn(
                    'inline-flex items-center px-3 py-1.5 rounded-full border text-[11px] font-semibold tracking-[0.22em] uppercase mb-4',
                    tonePill[trend.tone]
                )}
            >
                {t(trend.signalKey)}
            </div>

            {asset.confluenceIndex !== undefined && asset.confluenceIndex !== null && (() => {
                const ci = Number(asset.confluenceIndex);
                const strengthTone = ci >= 80 ? 'veryhigh' : ci >= 60 ? 'high' : ci >= 40 ? 'moderate' : ci >= 20 ? 'low' : 'verylow';
                const strengthStyles = {
                    veryhigh: 'from-amber-400/20 to-amber-500/10 border-amber-400/50 text-amber-200',
                    high: 'from-amber-500/15 to-amber-500/5 border-amber-500/40 text-amber-300',
                    moderate: 'from-white/[0.06] to-transparent border-white/15 text-gray-200',
                    low: 'from-white/[0.04] to-transparent border-white/10 text-gray-400',
                    verylow: 'from-white/[0.02] to-transparent border-white/5 text-gray-500',
                };
                return (
                    <div
                        data-testid={`confluence-index-${asset.assetId}`}
                        className={cn(
                            'rounded-2xl border bg-gradient-to-br p-3.5 mb-6 flex items-center justify-between',
                            strengthStyles[strengthTone]
                        )}
                    >
                        <div className="text-[9.5px] tracking-[0.26em] uppercase text-gray-400 font-bold">
                            Confluence Index
                        </div>
                        <div className="text-right">
                            <div className="font-mono text-[28px] font-bold tnum leading-none">
                                {ci.toFixed(0)}
                                <span className="text-[12px] text-gray-500 font-normal ml-1">/100</span>
                            </div>
                        </div>
                    </div>
                );
            })()}

            <div className="grid grid-cols-2 gap-4 mb-6">
                <div>
                    <div className="text-[11px] uppercase tracking-[0.22em] text-gray-500 font-semibold mb-1.5">
                        {t('modal.net_position')}
                    </div>
                    <div className="font-mono text-[28px] font-semibold text-white tnum tracking-tight leading-none">
                        {formatNumber(asset.netPosition)}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-gray-500 font-semibold mb-1.5">
                        Δ WoW
                    </div>
                    <div
                        className={cn(
                            'font-mono text-[28px] font-semibold tnum tracking-tight leading-none',
                            (asset.wowDelta || 0) >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]'
                        )}
                    >
                        {formatSigned(asset.wowDelta)}
                    </div>
                </div>
            </div>

            <div className="mb-6">
                <div className="h-2 w-full bg-white/[0.06] rounded-full overflow-hidden flex mb-3">
                    <div className="h-full bg-gradient-to-r from-[#10b981]/70 to-[#34d399]" style={{ width: `${longRatio}%` }} />
                    <div className="h-full bg-gradient-to-r from-[#f43f5e] to-[#fb7185]/70" style={{ width: `${100 - longRatio}%` }} />
                </div>
                <div className="grid grid-cols-2 gap-3">
                    <div className="bg-[#10b981]/[0.06] border border-[#10b981]/20 rounded-2xl p-3.5">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#34d399]">Long</span>
                            <span className={cn('font-mono text-[12px] font-semibold tnum', (asset.changeLong || 0) >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]')}>
                                {formatSigned(asset.changeLong)}
                            </span>
                        </div>
                        <div className="font-mono text-[18px] font-semibold text-white tnum">{formatNumber(asset.long)}</div>
                    </div>
                    <div className="bg-[#f43f5e]/[0.06] border border-[#f43f5e]/20 rounded-2xl p-3.5">
                        <div className="flex items-center justify-between mb-1">
                            <span className="text-[11px] font-bold uppercase tracking-[0.18em] text-[#fb7185]">Short</span>
                            <span className={cn('font-mono text-[12px] font-semibold tnum', (asset.changeShort || 0) <= 0 ? 'text-[#34d399]' : 'text-[#fb7185]')}>
                                {formatSigned(asset.changeShort)}
                            </span>
                        </div>
                        <div className="font-mono text-[18px] font-semibold text-white tnum">{formatNumber(asset.short)}</div>
                    </div>
                </div>
            </div>

            <div className="flex items-center justify-between border-t border-white/[0.06] pt-5">
                <div>
                    <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-[0.22em] text-gray-500 font-semibold mb-0.5">
                        {t('card.oi_share')}
                        <InfoTooltip text={oiText} label={t('card.oi_tooltip_label')} />
                    </div>
                    <div className="font-mono text-[16px] text-white tnum font-semibold">{asset.openInterestShare ?? '—'}%</div>
                </div>
                <div className="text-right">
                    <div className="text-[11px] uppercase tracking-[0.22em] text-gray-500 font-semibold mb-0.5">
                        {t('card.intensity')}
                    </div>
                    <div className="font-mono text-[16px] text-white tnum font-semibold">{asset.intensityIndex ?? '—'}/100</div>
                </div>
            </div>
        </>
    );
}
