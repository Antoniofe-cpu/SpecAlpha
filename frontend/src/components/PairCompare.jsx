import React, { useMemo } from 'react';
import { ArrowLeftRight, Scale } from 'lucide-react';
import { cn, formatNumber, formatSigned } from '../utils';

function score(asset) {
    if (!asset) return 0;
    const dWeight = (asset.wowDelta || 0) > 0 ? 1.5 : -1.5;
    const nWeight = (asset.netPosition || 0) > 0 ? 1 : -1;
    return dWeight + nWeight;
}

export default function PairCompare({ assets }) {
    // Build asset selection: any asset can be picked
    const [a, setA] = React.useState(null);
    const [b, setB] = React.useState(null);

    React.useEffect(() => {
        if (!assets?.length) return;
        if (!a) setA(assets.find((x) => x.assetId === 'EURUSD')?.assetId || assets[0]?.assetId);
        if (!b) setB(assets.find((x) => x.assetId === 'GBPUSD')?.assetId || assets[1]?.assetId);
    }, [assets, a, b]);

    const pickA = useMemo(() => assets.find((x) => x.assetId === a), [assets, a]);
    const pickB = useMemo(() => assets.find((x) => x.assetId === b), [assets, b]);

    const verdict = useMemo(() => {
        if (!pickA || !pickB) return null;
        const sA = score(pickA);
        const sB = score(pickB);
        const diff = sA - sB;
        if (Math.abs(diff) < 0.5)
            return {
                tone: 'neutral',
                title: `Equilibrio fra ${pickA.name} e ${pickB.name}`,
                desc: 'I flussi istituzionali sono speculari o neutrali. Niente edge direzionale chiaro.',
            };
        if (diff > 0)
            return {
                tone: 'bullish',
                title: `${pickA.name} domina su ${pickB.name}`,
                desc: 'Forte accumulo Non-Commercial sul primo asset. Il secondo riceve flussi distributivi.',
            };
        return {
            tone: 'bearish',
            title: `${pickB.name} domina su ${pickA.name}`,
            desc: 'I flussi istituzionali stanno spostando capitale verso il secondo asset.',
        };
    }, [pickA, pickB]);

    const verdictTone = {
        bullish: 'border-[#10b981]/30 bg-[#10b981]/5 text-[#34d399]',
        bearish: 'border-[#f43f5e]/30 bg-[#f43f5e]/5 text-[#fb7185]',
        neutral: 'border-white/10 bg-white/[0.02] text-gray-300',
    };

    return (
        <section
            data-testid="pair-compare"
            className="bg-[#0a0a0a] border border-white/8 rounded-2xl overflow-hidden relative"
        >
            <div className="absolute left-0 top-0 bottom-0 w-1 bg-gradient-to-b from-amber-500/40 to-transparent" />
            <div className="p-6 sm:p-8">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
                    <div className="flex items-center gap-3">
                        <div className="w-10 h-10 rounded-lg bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                            <Scale className="text-amber-400" size={18} />
                        </div>
                        <div>
                            <div className="text-[10px] tracking-[0.3em] uppercase font-bold text-amber-400 mb-1">
                                Relative Strength Monitor
                            </div>
                            <h2 className="font-display text-lg font-semibold text-white">Pair Comparison</h2>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 bg-black/40 border border-white/8 p-1 rounded-md">
                        <select
                            data-testid="pair-asset-a"
                            value={a || ''}
                            onChange={(e) => setA(e.target.value)}
                            className="bg-transparent text-white font-mono text-xs font-bold px-3 py-1.5 outline-none cursor-pointer"
                        >
                            {assets.map((x) => (
                                <option key={x.assetId} value={x.assetId} className="bg-[#0a0a0a]">
                                    {`${x.assetId} • ${x.name}`}
                                </option>
                            ))}
                        </select>
                        <span className="text-gray-700 text-[10px] font-bold">VS</span>
                        <select
                            data-testid="pair-asset-b"
                            value={b || ''}
                            onChange={(e) => setB(e.target.value)}
                            className="bg-transparent text-white font-mono text-xs font-bold px-3 py-1.5 outline-none cursor-pointer"
                        >
                            {assets.map((x) => (
                                <option key={x.assetId} value={x.assetId} className="bg-[#0a0a0a]">
                                    {`${x.assetId} • ${x.name}`}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {pickA && pickB && (
                    <div className={cn('rounded-xl border p-6', verdictTone[verdict?.tone || 'neutral'])}>
                        <div className="flex items-start gap-4">
                            <div className="w-10 h-10 rounded-lg border border-current bg-black/30 flex items-center justify-center shrink-0">
                                <ArrowLeftRight size={18} />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-display text-lg font-semibold text-white mb-1">
                                    {verdict?.title}
                                </h3>
                                <p className="text-xs leading-relaxed text-gray-400">{verdict?.desc}</p>
                            </div>
                        </div>
                        <div className="mt-6 grid grid-cols-2 gap-4 sm:gap-8 pt-5 border-t border-white/5">
                            {[
                                { meta: pickA, accent: '#34d399', label: pickA?.assetId },
                                { meta: pickB, accent: '#fb7185', label: pickB?.assetId },
                            ].map((x, i) => (
                                <div key={i}>
                                    <div className="flex items-center gap-2 mb-2">
                                        <div className="w-1.5 h-1.5 rounded-full" style={{ background: x.accent }} />
                                        <span className="text-[9px] uppercase tracking-[0.3em] text-gray-500 font-bold">{x.label}</span>
                                    </div>
                                    <div className="font-mono text-2xl font-semibold text-white tnum">
                                        {formatNumber(x.meta?.netPosition)}
                                    </div>
                                    <div className="flex gap-3 text-[11px] mt-1">
                                        <span className="text-gray-500">Δ:</span>
                                        <span className={cn('font-mono', (x.meta?.wowDelta || 0) >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]')}>
                                            {formatSigned(x.meta?.wowDelta)}
                                        </span>
                                        <span className="text-gray-500">OI:</span>
                                        <span className="font-mono text-gray-300">{x.meta?.openInterestShare}%</span>
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
