import React from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, Legend, Area } from 'recharts';
import { cn } from '../utils';

/**
 * SentimentGauge - Market sentiment display with dual overlapping lines
 */
export default function SentimentGauge({ data, loading, error }) {
    if (loading) {
        return (
            <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-5">
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

    // Calculate gauge position
    const gaugePercent = ((score + 100) / 200) * 100;
    const Icon = score > 10 ? TrendingUp : score < -10 ? TrendingDown : Activity;

    // Prepare dual-line chart data (sentiment + price on same chart, normalized scales)
    const sentimentMap = new Map();
    (history || []).forEach(h => {
        if (h.date) {
            sentimentMap.set(h.date, h.score);
        }
    });

    const priceMap = new Map();
    if (priceHistory && priceHistory.length > 0) {
        priceHistory.forEach(p => {
            if (p.date) {
                priceMap.set(p.date, p.price);
            }
        });
    }

    // Merge data
    const allDates = new Set([...sentimentMap.keys(), ...priceMap.keys()]);
    const chartData = Array.from(allDates).sort().map(date => ({
        date,
        sentiment: sentimentMap.get(date),
        price: priceMap.get(date),
    }));

    // Take last 12 weeks
    const displayData = chartData.slice(-12);

    // Normalize price to sentiment scale (-100 to +100) for visual overlay
    const prices = displayData.map(d => d.price).filter(p => p !== undefined);
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 100;
    const priceRange = maxPrice - minPrice || 1;

    const normalizedData = displayData.map(d => ({
        ...d,
        priceNormalized: d.price ? ((d.price - minPrice) / priceRange) * 200 - 100 : undefined,
    }));

    return (
        <div className="bg-[#0e0e14] border border-white/[0.07] rounded-3xl p-5">
            {/* Header */}
            <div className="flex items-center justify-between mb-4">
                <div className="flex items-center gap-2">
                    <Activity size={14} className="text-purple-400" />
                    <h3 className="text-[11px] uppercase tracking-[0.28em] font-bold text-gray-400">
                        Market Sentiment
                    </h3>
                </div>
                <div className={cn(
                    'flex items-center gap-1.5 px-2.5 py-1 rounded-full border text-[10px] uppercase tracking-wider font-bold',
                    score >= 40 ? 'border-[#10b981]/40 bg-[#10b981]/10 text-[#34d399]' :
                    score >= 10 ? 'border-[#34d399]/40 bg-[#34d399]/10 text-[#34d399]' :
                    score > -10 ? 'border-white/15 bg-white/5 text-gray-300' :
                    score > -40 ? 'border-[#fb7185]/40 bg-[#fb7185]/10 text-[#fb7185]' :
                    'border-[#f43f5e]/40 bg-[#f43f5e]/10 text-[#f43f5e]'
                )}>
                    <Icon size={11} />
                    {interpretation}
                </div>
            </div>

            <div className="grid grid-cols-[auto_1fr] gap-6">
                {/* Left: Gauge */}
                <div className="flex flex-col items-center" style={{ width: '140px' }}>
                    <div className="relative w-full">
                        <svg viewBox="0 0 140 90" className="w-full">
                            {/* Background arc */}
                            <path
                                d="M 20 75 A 50 50 0 0 1 120 75"
                                fill="none"
                                stroke="rgba(255,255,255,0.06)"
                                strokeWidth="10"
                                strokeLinecap="round"
                            />
                            
                            {/* Gradient */}
                            <defs>
                                <linearGradient id="sentGrad" x1="0%" y1="0%" x2="100%" y2="0%">
                                    <stop offset="0%" style={{ stopColor: '#f43f5e', stopOpacity: 0.9 }} />
                                    <stop offset="50%" style={{ stopColor: '#94a3b8', stopOpacity: 0.9 }} />
                                    <stop offset="100%" style={{ stopColor: '#10b981', stopOpacity: 0.9 }} />
                                </linearGradient>
                            </defs>
                            
                            {/* Colored arc */}
                            <path
                                d="M 20 75 A 50 50 0 0 1 120 75"
                                fill="none"
                                stroke="url(#sentGrad)"
                                strokeWidth="10"
                                strokeLinecap="round"
                                strokeDasharray="157"
                                strokeDashoffset={157 - (157 * gaugePercent / 100)}
                                style={{ transition: 'stroke-dashoffset 0.8s ease-out' }}
                            />
                            
                            {/* Needle */}
                            <g transform={`rotate(${-90 + (gaugePercent * 1.8)} 70 75)`}>
                                <circle cx="70" cy="75" r="5" fill={color} />
                                <line 
                                    x1="70" 
                                    y1="75" 
                                    x2="70" 
                                    y2="30" 
                                    stroke={color} 
                                    strokeWidth="2.5" 
                                    strokeLinecap="round"
                                />
                            </g>
                            
                            <circle cx="70" cy="75" r="6" fill="#0e0e14" stroke={color} strokeWidth="2" />
                        </svg>
                    </div>

                    {/* Score centered */}
                    <div className="flex flex-col items-center -mt-2">
                        <div 
                            className="font-mono text-[28px] font-bold tnum leading-none"
                            style={{ color }}
                        >
                            {score > 0 ? '+' : ''}{score}
                        </div>
                        <div className="text-[9px] text-gray-500 uppercase tracking-wider mt-1 font-semibold">
                            Sentiment Score
                        </div>
                    </div>
                    
                    {/* Long/Short */}
                    <div className="w-full mt-4 space-y-2">
                        <div className="bg-black/30 border border-[#10b981]/20 rounded-xl p-2.5">
                            <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-0.5 font-bold">
                                Long
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="font-mono text-[18px] font-bold text-[#34d399]">{longPct.toFixed(1)}</span>
                                <span className="text-[11px] text-gray-400">%</span>
                            </div>
                        </div>
                        <div className="bg-black/30 border border-[#f43f5e]/20 rounded-xl p-2.5">
                            <div className="text-[9px] uppercase tracking-widest text-gray-500 mb-0.5 font-bold">
                                Short
                            </div>
                            <div className="flex items-baseline gap-1">
                                <span className="font-mono text-[18px] font-bold text-[#fb7185]">{shortPct.toFixed(1)}</span>
                                <span className="text-[11px] text-gray-400">%</span>
                            </div>
                        </div>
                    </div>
                </div>

                {/* Right: Overlapping dual-line chart */}
                <div className="min-h-[240px]">
                    {normalizedData.length > 1 ? (
                        <ResponsiveContainer width="100%" height={240}>
                            <ComposedChart data={normalizedData} margin={{ top: 10, right: 10, left: -5, bottom: 5 }}>
                                {/* Area fill for sentiment (subtle background) */}
                                <defs>
                                    <linearGradient id="sentimentGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#a78bfa" stopOpacity={0.3}/>
                                        <stop offset="95%" stopColor="#a78bfa" stopOpacity={0}/>
                                    </linearGradient>
                                    <linearGradient id="priceGradient" x1="0" y1="0" x2="0" y2="1">
                                        <stop offset="5%" stopColor="#60a5fa" stopOpacity={0.2}/>
                                        <stop offset="95%" stopColor="#60a5fa" stopOpacity={0}/>
                                    </linearGradient>
                                </defs>
                                
                                <XAxis 
                                    dataKey="date" 
                                    stroke="#6b7280"
                                    fontSize={10}
                                    tick={{ fontFamily: 'Geist Mono' }}
                                    tickFormatter={(val) => {
                                        const parts = val.split('-');
                                        return parts.length >= 2 ? `${parts[1]}/${parts[2]}` : val;
                                    }}
                                    interval="preserveStartEnd"
                                />
                                
                                <YAxis 
                                    stroke="#6b7280"
                                    fontSize={10}
                                    width={40}
                                    tick={{ fontFamily: 'Geist Mono' }}
                                    domain={[-100, 100]}
                                    label={{ 
                                        value: 'Score / Price (normalized)', 
                                        angle: -90, 
                                        position: 'insideLeft',
                                        style: { fontSize: 10, fill: '#9ca3af' }
                                    }}
                                />
                                
                                <Tooltip
                                    contentStyle={{
                                        backgroundColor: '#0a0a0d',
                                        border: '1px solid rgba(168, 85, 247, 0.3)',
                                        borderRadius: '12px',
                                        fontSize: '11px',
                                        fontFamily: 'Geist Mono',
                                        padding: '8px 12px',
                                    }}
                                    labelStyle={{ color: '#d1d5db', marginBottom: '6px', fontWeight: 'bold' }}
                                    formatter={(value, name) => {
                                        if (name === 'sentiment') {
                                            return [value?.toFixed(1), 'Sentiment'];
                                        }
                                        if (name === 'priceNormalized') {
                                            const original = displayData.find(d => d.priceNormalized === value)?.price;
                                            return [original ? original.toFixed(2) : '—', 'Price'];
                                        }
                                        return [value, name];
                                    }}
                                />
                                
                                <Legend 
                                    wrapperStyle={{ fontSize: '11px', fontFamily: 'Geist Mono', paddingTop: '10px' }}
                                    iconSize={12}
                                    formatter={(value) => {
                                        if (value === 'sentiment') return 'Sentiment Score';
                                        if (value === 'priceNormalized') return 'Asset Price';
                                        return value;
                                    }}
                                />
                                
                                {/* Sentiment area + line */}
                                <Area
                                    type="monotone"
                                    dataKey="sentiment"
                                    fill="url(#sentimentGradient)"
                                    stroke="none"
                                />
                                <Line 
                                    type="monotone" 
                                    dataKey="sentiment" 
                                    stroke="#a78bfa" 
                                    strokeWidth={2.5}
                                    dot={{ r: 4, fill: '#a78bfa', strokeWidth: 2, stroke: '#0e0e14' }}
                                    activeDot={{ r: 6 }}
                                    connectNulls
                                />
                                
                                {/* Price area + line (if available) */}
                                {prices.length > 0 && (
                                    <>
                                        <Area
                                            type="monotone"
                                            dataKey="priceNormalized"
                                            fill="url(#priceGradient)"
                                            stroke="none"
                                        />
                                        <Line 
                                            type="monotone" 
                                            dataKey="priceNormalized" 
                                            stroke="#60a5fa" 
                                            strokeWidth={2.5}
                                            strokeDasharray="5 5"
                                            dot={{ r: 4, fill: '#60a5fa', strokeWidth: 2, stroke: '#0e0e14' }}
                                            activeDot={{ r: 6 }}
                                            connectNulls
                                        />
                                    </>
                                )}
                            </ComposedChart>
                        </ResponsiveContainer>
                    ) : (
                        <div className="h-[240px] flex items-center justify-center text-[11px] text-gray-500">
                            No historical data available
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
