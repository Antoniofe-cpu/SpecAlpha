import React from 'react';
import { Flame } from 'lucide-react';
import { cn, formatNumber, formatSigned } from '../utils';
import { useT } from '../i18n';

// Heatmap of all assets sorted by net position; only displays assets passed in.
export default function HeatmapStrip({ assets, onPick }) {
    const { t } = useT();
    if (!assets?.length) return null;
    const max = Math.max(...assets.map((a) => Math.abs(a.netPosition || 0)), 1);
    const sorted = [...assets].sort((a, b) => (b.netPosition || 0) - (a.netPosition || 0));

    return (
        <section
            data-testid="heatmap-strip"
            className="bg-gradient-to-b from-[#10101a] to-[#0a0a10] border border-white/[0.07] rounded-[32px] p-7 sm:p-10 relative overflow-hidden soft-shadow"
        >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
            <div className="flex items-center gap-4 mb-6">
                <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                    <Flame className="text-amber-400" size={20} />
                </div>
                <div>
                    <div className="text-[12px] tracking-[0.3em] uppercase font-bold text-amber-400 mb-1">
                        {t('heat.kicker')}
                    </div>
                    <h2 className="font-display text-2xl font-bold text-white">
                        {t('heat.title')}
                    </h2>
                    <p className="text-[14px] text-gray-400 mt-1.5 max-w-xl">
                        {t('heat.body')}
                    </p>
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {sorted.map((a) => {
                    const intensity = Math.min(1, Math.abs(a.netPosition || 0) / max);
                    const positive = (a.netPosition || 0) >= 0;
                    const bg = positive
                        ? `rgba(16, 185, 129, ${0.06 + intensity * 0.32})`
                        : `rgba(244, 63, 94, ${0.06 + intensity * 0.32})`;
                    const border = positive
                        ? `rgba(16, 185, 129, ${0.22 + intensity * 0.4})`
                        : `rgba(244, 63, 94, ${0.22 + intensity * 0.4})`;
                    return (
                        <button
                            data-testid={`heatmap-${a.assetId}`}
                            key={a.assetId}
                            onClick={() => onPick?.(a.assetId)}
                            style={{ background: bg, borderColor: border }}
                            className="text-left rounded-3xl border p-4 hover:scale-[1.02] transition-transform"
                        >
                            <div className="text-[11px] uppercase tracking-[0.22em] text-gray-300 font-semibold mb-1">
                                {a.type}
                            </div>
                            <div className="font-display text-[15px] font-bold text-white truncate">
                                {a.name}
                            </div>
                            <div
                                className={cn(
                                    'font-mono text-[18px] font-semibold tnum mt-1.5',
                                    positive ? 'text-[#34d399]' : 'text-[#fb7185]'
                                )}
                            >
                                {formatNumber(a.netPosition)}
                            </div>
                            <div className="text-[12px] font-mono text-gray-300 mt-0.5">
                                Δ {formatSigned(a.wowDelta)}
                            </div>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
