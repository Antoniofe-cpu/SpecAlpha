import React, { useState } from 'react';
import { TrendingUp, TrendingDown, Activity, Info, X } from 'lucide-react';
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { cn } from '../utils';

/**
 * SentimentGauge - Market sentiment with dual-axis chart
 */
export default function SentimentGauge({ data, loading, error }) {
    const [showInfo, setShowInfo] = useState(false);
    
    if (loading) {
        return (
            <div className="bg-gradient-to-br from-[#0e0e14] to-[#1a1a24] border border-white/[0.08] rounded-3xl p-6 shadow-2xl">
                <div className="flex items-center gap-2 mb-3">
                    <Activity size={14} className="text-purple-400 animate-pulse" />
                    <h3 className="text-[11px] uppercase tracking-[0.28em] font-bold text-gray-400">
                        Market Sentiment
                    </h3>
                </div>
                <div className="h-24 flex items-center justify-center">
                    <div className="text-[13px] text-gray-500">Loading...</div>
                </div>
            </div>
        );
    }

    if (error || !data || !data.current) {
        return null;
    }

    const { current, history, priceHistory } = data;
    const score = current.score || 0;
    const interpretation = current.interpretation || 'Neutral';
    const color = current.color || '#94a3b8';
    const longPct = current.longPercentage || 50;
    const shortPct = current.shortPercentage || 50;
    const contrarian = current.contrarian || { signal: 'NEUTRAL', strength: 'None' };
    const crowdLabel = current.crowdLabel || 'Mixed Crowd';

    // Gauge position
    const gaugePercent = ((score + 100) / 200) * 100;
    const Icon = score > 10 ? TrendingUp : score < -10 ? TrendingDown : Activity;

    // Prepare chart data — keep price as full daily series, overlay weekly sentiment on same x-domain
    const sentimentMap = new Map();
    if (history && Array.isArray(history)) {
        history.forEach(h => {
            if (h.date && h.score !== undefined) {
                sentimentMap.set(h.date, h.score);
            }
        });
    }

    // Build chart data from priceHistory (continuous daily series) and overlay sentiment when available
    const sortedPrices = (priceHistory && Array.isArray(priceHistory))
        ? [...priceHistory].sort((a, b) => a.date.localeCompare(b.date))
        : [];

    let displayData = sortedPrices.map(p => ({
        date: p.date,
        price: p.price,
        sentiment: sentimentMap.has(p.date) ? sentimentMap.get(p.date) : undefined,
    }));

    // Forward-fill sentiment so weekly COT data renders as a step line across daily x-domain
    if (displayData.length > 0 && sentimentMap.size > 0) {
        const sortedSentDates = Array.from(sentimentMap.keys()).sort();
        let lastScore = undefined;
        displayData = displayData.map(d => {
            const matched = sortedSentDates.filter(sd => sd <= d.date).pop();
            if (matched) lastScore = sentimentMap.get(matched);
            return { ...d, sentiment: lastScore };
        });
    }

    // If no priceHistory but sentiment exists, fall back to sentiment-only chart
    if (displayData.length === 0 && sentimentMap.size > 0) {
        displayData = Array.from(sentimentMap.keys()).sort().map(date => ({
            date,
            sentiment: sentimentMap.get(date),
            price: undefined,
        }));
    }

    // Calculate price domain
    const prices = displayData.map(d => d.price).filter(p => p !== undefined && p !== null);
    const sentiments = displayData.map(d => d.sentiment).filter(s => s !== undefined && s !== null);
    
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 100;
    const priceRange = maxPrice - minPrice;
    const pricePadding = priceRange * 0.05;

    return (
        <div className="bg-gradient-to-br from-[#0e0e14] via-[#12121a] to-[#0e0e14] border border-white/[0.08] rounded-3xl p-6 shadow-2xl backdrop-blur-xl">
            {/* Header */}
            <div className="flex items-center justify-between mb-5">
                <div className="flex items-center gap-2.5">
                    <div className="p-2 rounded-xl bg-purple-500/10 border border-purple-500/20">
                        <Activity size={16} className="text-purple-400" />
                    </div>
                    <h3 className="text-[12px] uppercase tracking-[0.26em] font-bold text-gray-300">
                        Market Sentiment
                    </h3>
                    {/* Info button for contrarian strategy */}
                    <button
                        onClick={() => setShowInfo(!showInfo)}
                        className="p-1.5 rounded-lg bg-blue-500/10 border border-blue-500/20 hover:bg-blue-500/20 transition-colors"
                        title="Contrarian Strategy Info"
                    >
                        <Info size={14} className="text-blue-400" />
                    </button>
                </div>
                <div className={cn(
                    'flex items-center gap-2 px-3 py-1.5 rounded-full border text-[11px] uppercase tracking-wider font-bold shadow-lg',
                    score >= 40 ? 'border-[#10b981]/50 bg-gradient-to-r from-[#10b981]/20 to-[#10b981]/10 text-[#34d399]' :
                    score >= 10 ? 'border-[#34d399]/50 bg-gradient-to-r from-[#34d399]/20 to-[#34d399]/10 text-[#34d399]' :
                    score > -10 ? 'border-white/20 bg-gradient-to-r from-white/10 to-white/5 text-gray-300' :
                    score > -40 ? 'border-[#fb7185]/50 bg-gradient-to-r from-[#fb7185]/20 to-[#fb7185]/10 text-[#fb7185]' :
                    'border-[#f43f5e]/50 bg-gradient-to-r from-[#f43f5e]/20 to-[#f43f5e]/10 text-[#f43f5e]'
                )}>
                    <Icon size={12} />
                    {interpretation}
                </div>
            </div>

            {/* Contrarian Strategy Info Panel */}
            {showInfo && (
                <div className="mb-5 bg-gradient-to-br from-blue-500/10 to-purple-500/10 border border-blue-500/20 rounded-2xl p-4 backdrop-blur-sm">
                    <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2">
                            <Info size={16} className="text-blue-400 mt-0.5" />
                            <h4 className="text-[13px] font-bold text-blue-300 uppercase tracking-wider">
                                Strategia Contrarian
                            </h4>
                        </div>
                        <button
                            onClick={() => setShowInfo(false)}
                            className="p-1 rounded-lg hover:bg-white/10 transition-colors"
                        >
                            <X size={14} className="text-gray-400" />
                        </button>
                    </div>
                    
                    <div className="space-y-3 text-[11px] text-gray-300">
                        <div className="flex items-start gap-2">
                            <div className="mt-1 w-2 h-2 rounded-full bg-red-400 flex-shrink-0" />
                            <div>
                                <strong className="text-red-300">Long &gt;70%</strong> → <strong className="text-red-300">SELL Signal</strong>
                                <p className="text-gray-400 mt-0.5">Crowd overextended long = smart money inizia a vendere</p>
                            </div>
                        </div>
                        
                        <div className="flex items-start gap-2">
                            <div className="mt-1 w-2 h-2 rounded-full bg-green-400 flex-shrink-0" />
                            <div>
                                <strong className="text-green-300">Long &lt;30%</strong> → <strong className="text-green-300">BUY Signal</strong>
                                <p className="text-gray-400 mt-0.5">Crowd capitulated = smart money accumula</p>
                            </div>
                        </div>
                        
                        <div className="flex items-start gap-2">
                            <div className="mt-1 w-2 h-2 rounded-full bg-gray-400 flex-shrink-0" />
                            <div>
                                <strong className="text-gray-300">40-60%</strong> → <strong className="text-gray-300">NEUTRAL</strong>
                                <p className="text-gray-400 mt-0.5">Equilibrio = usa altri indicatori</p>
                            </div>
                        </div>
                        
                        <div className="mt-3 pt-3 border-t border-white/10">
                            <p className="text-yellow-300 font-semibold mb-1">⚠️ Best Practices:</p>
                            <ul className="space-y-1 text-gray-400">
                                <li>• Combina con analisi tecnica (supporti/resistenze)</li>
                                <li>• Aspetta conferma prima di entrare</li>
                                <li>• Non tradare durante notizie major (Fed, earnings)</li>
                                <li>• Funziona meglio su timeframe daily+</li>
                            </ul>
                        </div>
                        
                        <div className="mt-3 pt-3 border-t border-white/10 text-[10px] text-gray-500">
                            Fonte: MyFxBook Community Outlook (account live verificati)
                        </div>
                    </div>
                </div>
            )}

            <div className="grid grid-cols-[auto_1fr] gap-8">
                {/* Left: Gauge */}
                <div className="flex flex-col items-center" style={{ width: '150px' }}>
                    <div className="relative w-full mb-2">
                        <svg viewBox="0 0 150 95" className="w-full drop-shadow-2xl">
                            <defs>
                                <filter id="glow">
                                    <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
                                    <feMerge>
                                        <feMergeNode in="coloredBlur"/>
                                        <feMergeNode in="SourceGraphic"/>
                                    </feMerge>
                                </filter>
                                <linearGradient id="gaugeGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" style={{ stopColor: '#f43f5e', stopOpacity: 1 }} />
                                    <stop offset="50%" style={{ stopColor: '#94a3b8', stopOpacity: 1 }} />
                                    <stop offset="100%" style={{ stopColor: '#10b981', stopOpacity: 1 }} />
                                </linearGradient>
                            </defs>
                            
                            <path
                                d="M 25 80 A 50 50 0 0 1 125 80"
                                fill="none"
                                stroke="rgba(255,255,255,0.05)"
                                strokeWidth="12"
                                strokeLinecap="round"
                            />
                            
                            <path
                                d="M 25 80 A 50 50 0 0 1 125 80"
                                fill="none"
                                stroke="url(#gaugeGrad)"
                                strokeWidth="12"
                                strokeLinecap="round"
                                strokeDasharray="157"
                                strokeDashoffset={157 - (157 * gaugePercent / 100)}
                                style={{ transition: 'stroke-dashoffset 0.8s cubic-bezier(0.4, 0, 0.2, 1)' }}
                                filter="url(#glow)"
                            />
                            
                            <g transform={`rotate(${-90 + (gaugePercent * 1.8)} 75 80)`} filter="url(#glow)">
                                <circle cx="75" cy="80" r="6" fill={color} opacity="0.3" />
                                <circle cx="75" cy="80" r="5" fill={color} />
                                <line 
                                    x1="75" 
                                    y1="80" 
                                    x2="75" 
                                    y2="35" 
                                    stroke={color} 
                                    strokeWidth="3" 
                                    strokeLinecap="round"
                                />
                            </g>
                            
                            <circle cx="75" cy="80" r="8" fill="#0e0e14" stroke={color} strokeWidth="2.5" />
                            <circle cx="75" cy="80" r="3" fill={color} />
                        </svg>
                    </div>

                    <div className="flex flex-col items-center mb-4">
                        <div 
                            className="font-mono text-[32px] font-bold tnum leading-none drop-shadow-lg"
                            style={{ color }}
                        >
                            {score > 0 ? '+' : ''}{score}
                        </div>
                        <div className="text-[9px] text-gray-500 uppercase tracking-wider mt-1.5 font-semibold">
                            Contrarian Score
                        </div>
                    </div>

                    {/* Contrarian Action Signal */}
                    <div
                        data-testid="contrarian-signal-badge"
                        className={cn(
                            'w-full mb-2 px-3 py-2 rounded-xl border text-center font-bold text-[12px] uppercase tracking-wider',
                            contrarian.signal === 'BUY' ? 'border-[#10b981]/40 bg-[#10b981]/15 text-[#34d399]' :
                            contrarian.signal === 'SELL' ? 'border-[#f43f5e]/40 bg-[#f43f5e]/15 text-[#fb7185]' :
                            'border-white/20 bg-white/5 text-gray-300'
                        )}
                    >
                        {contrarian.signal} {contrarian.strength !== 'None' ? `· ${contrarian.strength}` : ''}
                    </div>

                    {/* Crowd Label */}
                    <div
                        data-testid="crowd-label-badge"
                        className="w-full mb-3 px-3 py-1.5 rounded-lg border border-white/10 bg-white/[0.02] text-center text-[10px] text-gray-400 uppercase tracking-widest"
                    >
                        Crowd: <span className="text-gray-200 font-semibold">{crowdLabel}</span>
                    </div>
                    
                    <div className="w-full space-y-2.5">
                        <div className="bg-gradient-to-br from-[#10b981]/10 to-transparent border border-[#10b981]/30 rounded-xl p-3 backdrop-blur-sm">
                            <div className="text-[9px] uppercase tracking-widest text-gray-400 mb-1 font-bold">
                                Long Positions
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="font-mono text-[20px] font-bold text-[#34d399] drop-shadow-lg">{longPct.toFixed(1)}</span>
                                <span className="text-[12px] text-gray-400">%</span>
                            </div>
                        </div>
                        <div className="bg-gradient-to-br from-[#f43f5e]/10 to-transparent border border-[#f43f5e]/30 rounded-xl p-3 backdrop-blur-sm">
                            <div className="text-[9px] uppercase tracking-widest text-gray-400 mb-1 font-bold">
                                Short Positions
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="font-mono text-[20px] font-bold text-[#fb7185] drop-shadow-lg">{shortPct.toFixed(1)}</span>
                                <span className="text-[12px] text-gray-400">%</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Dual-axis chart */}
                <div className="min-h-[280px] bg-black/20 rounded-2xl p-4 border border-white/[0.05]">
                    {displayData.length > 0 ? (
                        <ResponsiveContainer width="100%" height={280}>
                            <ComposedChart data={displayData} margin={{ top: 10, right: 15, left: 0, bottom: 5 }}>
                                <CartesianGrid 
                                    strokeDasharray="3 3" 
                                    stroke="rgba(255,255,255,0.05)" 
                                    vertical={false}
                                />
                                
                                <XAxis 
                                    dataKey="date" 
                                    stroke="#6b7280"
                                    fontSize={10}
                                    tick={{ fontFamily: 'Geist Mono', fill: '#9ca3af' }}
                                    interval="preserveStartEnd"
                                    minTickGap={40}
                                    tickFormatter={(val) => {
                                        const parts = val.split('-');
                                        return parts.length >= 2 ? `${parts[1]}/${parts[2]}` : val;
                                    }}
                                    axisLine={{ stroke: 'rgba(255,255,255,0.1)' }}
                                    tickLine={false}
                                />
                                
                                {/* Left Y-axis: Sentiment (-100 to +100) */}
                                <YAxis 
                                    yAxisId="sentiment"
                                    stroke="#a78bfa"
                                    fontSize={10}
                                    width={45}
                                    tick={{ fontFamily: 'Geist Mono', fill: '#c4b5fd' }}
                                    domain={[-100, 100]}
                                    axisLine={{ stroke: '#a78bfa', strokeWidth: 2 }}
                                    tickLine={false}
                                    label={{ 
                                        value: 'Sentiment', 
                                        angle: -90, 
                                        position: 'insideLeft',
                                        style: { fontSize: 11, fill: '#c4b5fd', fontWeight: 'bold' }
                                    }}
                                />
                                
                                {/* Right Y-axis: Price */}
                                {prices.length > 0 && (
                                    <YAxis 
                                        yAxisId="price"
                                        orientation="right"
                                        stroke="#60a5fa"
                                        fontSize={10}
                                        width={50}
                                        tick={{ fontFamily: 'Geist Mono', fill: '#93c5fd' }}
                                        domain={[minPrice - pricePadding, maxPrice + pricePadding]}
                                        tickFormatter={(val) => val.toLocaleString('en-US', { maximumFractionDigits: 0 })}
                                        axisLine={{ stroke: '#60a5fa', strokeWidth: 2 }}
                                        tickLine={false}
                                        label={{ 
                                            value: 'Price', 
                                            angle: 90, 
                                            position: 'insideRight',
                                            style: { fontSize: 11, fill: '#93c5fd', fontWeight: 'bold' }
                                        }}
                                    />
                                )}
                                
                                <ReferenceLine 
                                    yAxisId="sentiment" 
                                    y={0} 
                                    stroke="rgba(255,255,255,0.2)" 
                                    strokeDasharray="3 3"
                                />
                                
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: 'rgba(10, 10, 13, 0.95)',
                                        border: '1px solid rgba(168, 85, 247, 0.3)',
                                        borderRadius: '12px',
                                        fontSize: '11px',
                                        fontFamily: 'Geist Mono',
                                        padding: '10px 14px',
                                        boxShadow: '0 10px 40px rgba(0,0,0,0.5)',
                                    }}
                                    labelStyle={{ color: '#e5e7eb', marginBottom: '8px', fontWeight: 'bold', fontSize: '12px' }}
                                />
                                
                                {/* Sentiment Line - step-after for weekly COT data overlaid on daily x-axis */}
                                {sentiments.length > 0 && (
                                    <Line 
                                        yAxisId="sentiment"
                                        type="stepAfter" 
                                        dataKey="sentiment" 
                                        stroke="#a78bfa"
                                        strokeWidth={2.5}
                                        dot={false}
                                        activeDot={{ r: 6, fill: '#a78bfa', stroke: '#0e0e14', strokeWidth: 2 }}
                                        connectNulls
                                        name="Sentiment"
                                    />
                                )}
                                
                                {/* Price Line - ALWAYS render if data exists */}
                                {prices.length > 0 && (
                                    <Line 
                                        yAxisId="price"
                                        type="monotone" 
                                        dataKey="price" 
                                        stroke="#60a5fa"
                                        strokeWidth={3}
                                        dot={false}
                                        activeDot={{ r: 6, fill: '#60a5fa', stroke: '#0e0e14', strokeWidth: 2 }}
                                        connectNulls
                                        name="Price"
                                    />
                                )}
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[280px] flex items-center justify-center text-[11px] text-gray-500">
                            No historical data available
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
