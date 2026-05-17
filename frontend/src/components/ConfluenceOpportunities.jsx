import React from 'react';
import { Lock, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { cn, formatNumber } from '../utils';

/**
 * Below the cards grid: a recap of the strongest opportunities, ranked by
 * Confluence Index. Blurred + click-to-unlock for anonymous users.
 */
export default function ConfluenceOpportunities({ assets, locked, onUnlock, onPick }) {
    const ranked = (assets || [])
        .filter((a) => typeof a.confluenceIndex === 'number')
        .sort((a, b) => (b.confluenceIndex || 0) - (a.confluenceIndex || 0))
        .slice(0, 8);

    if (!ranked.length) return null;

    return (
        <section data-testid="opportunities-section" className="relative">
            <div className="flex items-center justify-between mb-4">
                <div>
                    <div className="text-[11px] tracking-[0.28em] uppercase font-bold text-amber-400 mb-1">
                        Opportunità in confluenza
                    </div>
                    <h2 className="font-display text-2xl font-bold text-white">
                        COT Trend · ranking settimanale
                    </h2>
                </div>
                <div className="text-[11px] text-gray-500 uppercase tracking-[0.22em] font-mono">
                    Ordinato per Confluence Index
                </div>
            </div>

            <div className={cn('relative', locked && 'pointer-events-none')}>
                <div className={cn(locked && 'blur-[10px] saturate-50 opacity-70')}>
                    <div className="rounded-3xl border border-white/[0.07] bg-[#0b0b10] overflow-hidden">
                        <table className="w-full text-[13px]">
                            <thead className="bg-white/[0.03] text-[10px] uppercase tracking-[0.22em] text-gray-500">
                                <tr>
                                    <th className="text-left px-5 py-3 font-semibold">#</th>
                                    <th className="text-left px-5 py-3 font-semibold">Asset</th>
                                    <th className="text-left px-5 py-3 font-semibold">CI</th>
                                    <th className="text-left px-5 py-3 font-semibold">Direzione</th>
                                    <th className="text-left px-5 py-3 font-semibold">Net Pos.</th>
                                    <th className="text-left px-5 py-3 font-semibold">Δ WoW</th>
                                    <th className="text-left px-5 py-3 font-semibold">Streams</th>
                                </tr>
                            </thead>
                            <tbody>
                                {ranked.map((a, i) => {
                                    const ci = Number(a.confluenceIndex || 0);
                                    const tone = ci >= 70 ? 'amber' : ci >= 40 ? 'sky' : 'violet';
                                    const dir = (a.confluenceDirection || 'neutral').toLowerCase();
                                    const dirIcon = dir === 'long' ? TrendingUp : dir === 'short' ? TrendingDown : Minus;
                                    const dirColor =
                                        dir === 'long'
                                            ? 'text-emerald-300'
                                            : dir === 'short'
                                                ? 'text-rose-300'
                                                : 'text-gray-400';
                                    const ciColor = tone === 'amber'
                                        ? 'bg-amber-500/15 text-amber-200 border-amber-500/40'
                                        : tone === 'sky'
                                            ? 'bg-sky-500/10 text-sky-200 border-sky-500/30'
                                            : 'bg-violet-500/10 text-violet-200 border-violet-500/30';
                                    const DirIcon = dirIcon;
                                    const missing = (a.confluenceMissing && a.confluenceMissing.length) ? a.confluenceMissing : [];
                                    return (
                                        <tr
                                            key={a.assetId}
                                            data-testid={`opportunity-row-${a.assetId}`}
                                            onClick={() => onPick && onPick(a.assetId)}
                                            className="border-t border-white/[0.04] hover:bg-white/[0.02] cursor-pointer transition-colors"
                                        >
                                            <td className="px-5 py-3 font-mono text-gray-500 tnum">{(i + 1).toString().padStart(2, '0')}</td>
                                            <td className="px-5 py-3">
                                                <div className="font-display text-[14px] font-semibold text-white">{a.name}</div>
                                                <div className="text-[10px] uppercase tracking-[0.18em] text-gray-500 font-mono">{a.assetId}</div>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className={cn('inline-flex items-center gap-1.5 font-mono font-bold tnum px-2.5 py-1 rounded-full border text-[12px]', ciColor)}>
                                                    {ci.toFixed(0)}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3">
                                                <span className={cn('inline-flex items-center gap-1.5 text-[11px] uppercase tracking-[0.18em] font-bold', dirColor)}>
                                                    <DirIcon size={12} />
                                                    {dir}
                                                </span>
                                            </td>
                                            <td className="px-5 py-3 font-mono text-white tnum">{formatNumber(a.netPosition)}</td>
                                            <td className={cn('px-5 py-3 font-mono tnum', (a.wowDelta || 0) >= 0 ? 'text-emerald-300' : 'text-rose-300')}>
                                                {(a.wowDelta || 0) >= 0 ? '+' : ''}{formatNumber(a.wowDelta)}
                                            </td>
                                            <td className="px-5 py-3">
                                                <div className="flex items-center gap-1.5">
                                                    {['nonComm', 'options', 'comm'].map((k) => {
                                                        const present = !missing.includes(k);
                                                        return (
                                                            <span
                                                                key={k}
                                                                title={k}
                                                                className={cn(
                                                                    'w-2 h-2 rounded-full',
                                                                    present ? 'bg-amber-400' : 'bg-white/15'
                                                                )}
                                                            />
                                                        );
                                                    })}
                                                </div>
                                            </td>
                                        </tr>
                                    );
                                })}
                            </tbody>
                        </table>
                    </div>
                </div>

                {locked && (
                    <div className="absolute inset-0 flex flex-col items-center justify-center text-center px-6 z-10">
                        <div className="w-12 h-12 rounded-full bg-amber-500/15 border border-amber-500/40 flex items-center justify-center mb-3 shadow-[0_0_30px_-6px_rgba(245,158,11,0.45)]">
                            <Lock size={18} className="text-amber-300" />
                        </div>
                        <button
                            type="button"
                            onClick={onUnlock}
                            className="px-6 py-2.5 rounded-2xl bg-amber-500 hover:bg-amber-400 text-black font-bold uppercase tracking-[0.22em] text-[12px] transition"
                            data-testid="opportunities-unlock-btn"
                        >
                            Sblocca
                        </button>
                    </div>
                )}
            </div>
        </section>
    );
}
