import React from 'react';
import { Flame } from 'lucide-react';
import { cn, formatNumber, formatSigned, getTrendAnalysis } from '../utils';

// Renders a heatmap-like strip of all assets sorted by net position intensity
export default function HeatmapStrip({ assets, onPick }) {
    if (!assets?.length) return null;
    const max = Math.max(...assets.map((a) => Math.abs(a.netPosition || 0)), 1);
    const sorted = [...assets].sort((a, b) => (b.netPosition || 0) - (a.netPosition || 0));

    return (
        <section
            data-testid="heatmap-strip"
            className="bg-[#0a0a0a] border border-white/8 rounded-2xl p-6 sm:p-8 relative overflow-hidden"
        >
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-500/40 to-transparent" />
            <div className="flex items-center gap-3 mb-5">
                <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                    <Flame className="text-amber-400" size={18} />
                </div>
                <div>
                    <div className="text-[10px] tracking-[0.3em] uppercase font-bold text-amber-400 mb-1">
                        Institutional Heatmap
                    </div>
                    <h2 className="font-display text-lg font-semibold text-white">
                        Forza Relativa Net Position
                    </h2>
                </div>
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {sorted.map((a) => {
                    const intensity = Math.min(1, Math.abs(a.netPosition || 0) / max);
                    const positive = (a.netPosition || 0) >= 0;
                    const bg = positive
                        ? `rgba(16, 185, 129, ${0.05 + intensity * 0.3})`
                        : `rgba(244, 63, 94, ${0.05 + intensity * 0.3})`;
                    const border = positive
                        ? `rgba(16, 185, 129, ${0.2 + intensity * 0.4})`
                        : `rgba(244, 63, 94, ${0.2 + intensity * 0.4})`;
                    return (
                        <button
                            data-testid={`heatmap-${a.assetId}`}
                            key={a.assetId}
                            onClick={() => onPick?.(a.assetId)}
                            style={{ background: bg, borderColor: border }}
                            className="text-left rounded-lg border p-3 hover:scale-[1.02] transition-transform"
                        >
                            <div className="text-[9px] uppercase tracking-[0.25em] text-gray-400 font-bold mb-1">
                                {a.type}
                            </div>
                            <div className="font-display text-sm font-semibold text-white truncate">{a.name}</div>
                            <div
                                className={cn(
                                    'font-mono text-base font-semibold tnum mt-1',
                                    positive ? 'text-[#34d399]' : 'text-[#fb7185]'
                                )}
                            >
                                {formatNumber(a.netPosition)}
                            </div>
                            <div className="text-[10px] font-mono text-gray-400 mt-0.5">
                                Δ {formatSigned(a.wowDelta)}
                            </div>
                        </button>
                    );
                })}
            </div>
        </section>
    );
}
