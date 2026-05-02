import React, { useMemo } from 'react';
import { ArrowLeftRight, Scale } from 'lucide-react';
import { cn, formatNumber, formatSigned } from '../utils';

function score(asset) {
    if (!asset) return 0;
    const total = (asset.long || 0) + (asset.short || 0) || 1;
    const netRatio = (asset.netPosition || 0) / total; // -1..+1
    const deltaWeight = (asset.wowDelta || 0) > 0 ? 0.6 : -0.6;
    return netRatio * 1.4 + deltaWeight;
}

export default function PairCompare({ assets }) {
    const [a, setA] = React.useState(null);
    const [b, setB] = React.useState(null);

    React.useEffect(() => {
        if (!assets?.length) return;
        if (!a) setA(assets.find((x) => x.assetId === 'EURUSD')?.assetId || assets[0]?.assetId);
        if (!b) setB(assets.find((x) => x.assetId === 'GBPUSD')?.assetId || assets[1]?.assetId);
    }, [assets, a, b]);

    const pickA = useMemo(() => assets.find((x) => x.assetId === a), [assets, a]);
    const pickB = useMemo(() => assets.find((x) => x.assetId === b), [assets, b]);

    const analysis = useMemo(() => {
        if (!pickA || !pickB) return null;
        const sA = score(pickA);
        const sB = score(pickB);
        const diff = sA - sB;
        const absDiff = Math.abs(diff);

        const tone = absDiff < 0.3 ? 'neutral' : diff > 0 ? 'bullish' : 'bearish';
        const winner = diff > 0 ? pickA : pickB;
        const loser = diff > 0 ? pickB : pickA;

        let title, body, hint;
        if (tone === 'neutral') {
            title = `Equilibrio tra ${pickA.name} e ${pickB.name}`;
            body = `I flussi istituzionali sono speculari o neutrali (score Δ ${absDiff.toFixed(2)}). Non emerge un vantaggio direzionale chiaro tra i due asset.`;
            hint = 'Strategia: attendere break tecnico o nuovo report COT prima di prendere posizione.';
        } else {
            const sentimentA = pickA.netPosition >= 0 ? 'long' : 'short';
            const sentimentB = pickB.netPosition >= 0 ? 'long' : 'short';
            const momentumWinner = (winner.wowDelta || 0) >= 0 ? 'in accumulazione' : 'in distribuzione';
            const momentumLoser = (loser.wowDelta || 0) >= 0 ? 'in accumulazione' : 'in distribuzione';
            title = `${winner.name} domina su ${loser.name}`;
            body = `${winner.name} ha bias ${sentimentA === sentimentB ? sentimentA : (winner === pickA ? sentimentA : sentimentB)} e si trova ${momentumWinner} (Δ ${formatSigned(winner.wowDelta)}), mentre ${loser.name} è ${momentumLoser} (Δ ${formatSigned(loser.wowDelta)}).`;
            hint = `Edge istituzionale: forza relativa di ${winner.assetId} su ${loser.assetId}. Score gap ${absDiff.toFixed(2)}.`;
        }
        return { tone, title, body, hint, winner, loser };
    }, [pickA, pickB]);

    const verdictTone = {
        bullish: 'border-[#10b981]/30 bg-[#10b981]/[0.06]',
        bearish: 'border-[#f43f5e]/30 bg-[#f43f5e]/[0.06]',
        neutral: 'border-white/10 bg-white/[0.02]',
    };

    return (
        <section
            data-testid="pair-compare"
            className="bg-gradient-to-b from-[#10101a] to-[#0a0a10] border border-white/[0.07] rounded-[32px] overflow-hidden relative soft-shadow"
        >
            <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-amber-500/40 to-transparent" />
            <div className="p-7 sm:p-10">
                <div className="flex flex-wrap items-center justify-between gap-4 mb-7">
                    <div className="flex items-center gap-4">
                        <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center">
                            <Scale className="text-amber-400" size={20} />
                        </div>
                        <div>
                            <div className="text-[12px] tracking-[0.3em] uppercase font-bold text-amber-400 mb-1">
                                Pair Comparison
                            </div>
                            <h2 className="font-display text-2xl font-bold text-white">Confronto Diretto</h2>
                            <p className="text-[14px] text-gray-400 mt-1.5 max-w-xl">
                                Selezionando due asset il sistema calcola un punteggio relativo basato su net
                                position, intensità e momentum settimanale.
                            </p>
                        </div>
                    </div>
                    <div className="flex items-center gap-2 bg-black/30 border border-white/10 p-1.5 rounded-2xl">
                        <select
                            data-testid="pair-asset-a"
                            value={a || ''}
                            onChange={(e) => setA(e.target.value)}
                            className="bg-transparent text-white font-mono text-[13px] font-semibold px-3 py-2 outline-none cursor-pointer rounded-xl hover:bg-white/5"
                        >
                            {assets.map((x) => (
                                <option key={x.assetId} value={x.assetId} className="bg-[#0a0a0d]">
                                    {`${x.assetId} • ${x.name}`}
                                </option>
                            ))}
                        </select>
                        <span className="text-gray-500 text-[12px] font-bold tracking-widest">VS</span>
                        <select
                            data-testid="pair-asset-b"
                            value={b || ''}
                            onChange={(e) => setB(e.target.value)}
                            className="bg-transparent text-white font-mono text-[13px] font-semibold px-3 py-2 outline-none cursor-pointer rounded-xl hover:bg-white/5"
                        >
                            {assets.map((x) => (
                                <option key={x.assetId} value={x.assetId} className="bg-[#0a0a0d]">
                                    {`${x.assetId} • ${x.name}`}
                                </option>
                            ))}
                        </select>
                    </div>
                </div>

                {pickA && pickB && analysis && (
                    <div className={cn('rounded-[28px] border p-7', verdictTone[analysis.tone])}>
                        <div className="flex items-start gap-4 mb-6">
                            <div className="w-12 h-12 rounded-2xl border border-white/10 bg-black/30 flex items-center justify-center shrink-0 text-amber-400">
                                <ArrowLeftRight size={20} />
                            </div>
                            <div className="flex-1">
                                <h3 className="font-display text-xl font-bold text-white mb-2">{analysis.title}</h3>
                                <p className="text-[15px] leading-relaxed text-gray-300 mb-2">{analysis.body}</p>
                                <p className="text-[13.5px] leading-relaxed text-amber-300/80 italic">
                                    {analysis.hint}
                                </p>
                            </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 pt-5 border-t border-white/5">
                            {[
                                { meta: pickA, accent: '#34d399', label: pickA?.assetId },
                                { meta: pickB, accent: '#fb7185', label: pickB?.assetId },
                            ].map((x, i) => (
                                <div
                                    key={i}
                                    className="bg-black/25 rounded-2xl p-4 border border-white/[0.05]"
                                >
                                    <div className="flex items-center justify-between mb-3">
                                        <div className="flex items-center gap-2">
                                            <div className="w-2 h-2 rounded-full" style={{ background: x.accent }} />
                                            <span className="text-[12px] uppercase tracking-[0.22em] text-gray-300 font-semibold">
                                                {x.label}
                                            </span>
                                        </div>
                                        <span className="text-[11px] text-gray-500 font-mono">{x.meta?.name}</span>
                                    </div>
                                    <div className="font-mono text-[26px] font-semibold text-white tnum mb-2">
                                        {formatNumber(x.meta?.netPosition)}
                                    </div>
                                    <div className="grid grid-cols-3 gap-2 text-[12px]">
                                        <div>
                                            <div className="text-gray-500 uppercase tracking-widest font-semibold text-[10.5px]">
                                                Δ WoW
                                            </div>
                                            <div className={cn('font-mono font-semibold tnum', (x.meta?.wowDelta || 0) >= 0 ? 'text-[#34d399]' : 'text-[#fb7185]')}>
                                                {formatSigned(x.meta?.wowDelta)}
                                            </div>
                                        </div>
                                        <div>
                                            <div className="text-gray-500 uppercase tracking-widest font-semibold text-[10.5px]">
                                                Long
                                            </div>
                                            <div className="font-mono text-[#34d399] tnum">{formatNumber(x.meta?.long)}</div>
                                        </div>
                                        <div>
                                            <div className="text-gray-500 uppercase tracking-widest font-semibold text-[10.5px]">
                                                Short
                                            </div>
                                            <div className="font-mono text-[#fb7185] tnum">{formatNumber(x.meta?.short)}</div>
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
