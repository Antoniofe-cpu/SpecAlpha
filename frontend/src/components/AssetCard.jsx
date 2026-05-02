import React from 'react';
import { motion } from 'framer-motion';
import { Maximize2, Activity, RefreshCw, Star } from 'lucide-react';
import { cn, formatNumber, formatSigned, getTrendAnalysis, TONE_CLASSES } from '../utils';

const tonePill = {
    bullish: 'border-[#10b981]/30 text-[#34d399] bg-[#10b981]/10',
    bearish: 'border-[#f43f5e]/30 text-[#fb7185] bg-[#f43f5e]/10',
    accumulation: 'border-amber-400/30 text-amber-300 bg-amber-400/10',
    distribution: 'border-orange-400/30 text-orange-300 bg-orange-400/10',
    neutral: 'border-white/10 text-gray-400 bg-white/5',
};

export default function AssetCard({ asset, isLoading, isFavorite, onClick, onToggleFav, index = 0 }) {
    const trend = getTrendAnalysis(asset);
    const total = (asset?.long || 0) + (asset?.short || 0) || 1;
    const longRatio = ((asset?.long || 0) / total) * 100;

    return (
        <motion.div
            data-testid={`asset-card-${asset.assetId}`}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.45, delay: index * 0.05, ease: [0.22, 1, 0.36, 1] }}
            whileHover={{ y: -4 }}
            onClick={onClick}
            className="relative bg-[#0e0e0e] border border-white/10 rounded-xl p-6 cursor-pointer overflow-hidden hover:border-amber-500/30 hover:bg-[#141414] transition-colors group"
        >
            {/* top accent line on hover */}
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent opacity-0 group-hover:opacity-100 transition-opacity" />

            <div className="flex items-start justify-between mb-5">
                <div>
                    <div className="text-[10px] tracking-[0.3em] uppercase font-bold text-amber-400/80 mb-1">
                        {asset.type}
                    </div>
                    <h3 className="font-display text-xl font-bold text-white">{asset.name}</h3>
                    <div className="text-[10px] tracking-widest uppercase text-gray-600 mt-1 font-mono">
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
                            'p-2 rounded-md transition-colors',
                            isFavorite ? 'text-amber-400 bg-amber-400/10' : 'text-gray-600 hover:text-amber-400 hover:bg-white/5'
                        )}
                        aria-label="favorite"
                    >
                        <Star size={14} fill={isFavorite ? '#fcd34d' : 'transparent'} />
                    </button>
                    <div className="p-2 text-gray-600 group-hover:text-amber-400 transition-colors">
                        <Maximize2 size={14} />
                    </div>
                </div>
            </div>

            <div
                className={cn(
                    'inline-flex items-center px-2.5 py-1 rounded-md border text-[10px] font-bold tracking-[0.18em] uppercase mb-5',
                    tonePill[trend.tone]
                )}
            >
                {trend.signal}
            </div>

            <div className="grid grid-cols-2 gap-3 mb-5">
                <div>
                    <div className="text-[9px] uppercase tracking-[0.25em] text-gray-500 font-bold mb-1">Net Position</div>
                    <div className="font-mono text-2xl font-semibold text-white tnum tracking-tight">
                        {formatNumber(asset.netPosition)}
                    </div>
                </div>
                <div className="text-right">
                    <div className="text-[9px] uppercase tracking-[0.25em] text-gray-500 font-bold mb-1">Δ WoW</div>
                    <div
                        className={cn(
                            'font-mono text-2xl font-semibold tnum tracking-tight',
                            (asset.wowDelta || 0) >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]'
                        )}
                    >
                        {formatSigned(asset.wowDelta)}
                    </div>
                </div>
            </div>

            {/* Long/Short bar */}
            <div className="mb-5">
                <div className="flex items-center justify-between text-[10px] mb-1.5">
                    <span className="text-[#34d399] font-mono font-semibold">L {formatNumber(asset.long)}</span>
                    <span className="text-[#fb7185] font-mono font-semibold">S {formatNumber(asset.short)}</span>
                </div>
                <div className="h-1.5 w-full bg-white/5 rounded-full overflow-hidden flex">
                    <div className="h-full bg-gradient-to-r from-[#10b981]/60 to-[#34d399]" style={{ width: `${longRatio}%` }} />
                    <div className="h-full bg-gradient-to-r from-[#f43f5e] to-[#fb7185]/60" style={{ width: `${100 - longRatio}%` }} />
                </div>
            </div>

            {/* AI insight */}
            <div className="border-l-2 border-amber-500/60 bg-gradient-to-r from-amber-500/[0.05] to-transparent rounded-r-md pl-3 pr-2 py-3 mb-5">
                <div className="flex items-center gap-1.5 mb-1.5">
                    <Activity size={10} className="text-amber-400" />
                    <span className="text-[9px] font-bold uppercase tracking-[0.25em] text-amber-300">
                        Institutional Analysis
                    </span>
                    {isLoading && <RefreshCw size={9} className="animate-spin text-amber-400/60 ml-auto" />}
                </div>
                <p className={cn('text-[11px] leading-relaxed text-gray-300 italic', isLoading && 'opacity-40')}>
                    {asset.macro || 'Sincronizzazione flussi…'}
                </p>
            </div>

            <div className="flex items-center justify-between border-t border-white/5 pt-4">
                <div>
                    <div className="text-[9px] uppercase tracking-[0.25em] text-gray-600 font-bold">OI Share</div>
                    <div className="font-mono text-sm text-white tnum">{asset.openInterestShare ?? '—'}%</div>
                </div>
                <div className="text-right">
                    <div className="text-[9px] uppercase tracking-[0.25em] text-gray-600 font-bold">Intensity</div>
                    <div className="font-mono text-sm text-white tnum">{asset.intensityIndex ?? '—'}/100</div>
                </div>
            </div>
        </motion.div>
    );
}
