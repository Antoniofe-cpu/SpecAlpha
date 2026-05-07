import React from 'react';
import { TrendingUp, TrendingDown, Activity } from 'lucide-react';
import { ComposedChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid, ReferenceLine } from 'recharts';
import { cn } from '../utils';

/**
 * SentimentGauge - Market sentiment with dual-axis chart
 */
export default function SentimentGauge({ data, loading, error }) {
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

    // Gauge position
    const gaugePercent = ((score + 100) / 200) * 100;
    const Icon = score > 10 ? TrendingUp : score < -10 ? TrendingDown : Activity;

    // Prepare chart data - CRITICAL: Ensure sentiment data is properly mapped
    const sentimentMap = new Map();
    if (history && Array.isArray(history)) {
        history.forEach(h => {
            if (h.date && h.score !== undefined) {
                sentimentMap.set(h.date, h.score);
            }
        });
    }

    const priceMap = new Map();
    if (priceHistory && Array.isArray(priceHistory)) {
        priceHistory.forEach(p => {
            if (p.date && p.price !== undefined) {
                priceMap.set(p.date, p.price);
            }
        });
    }

    // Merge by date - keep ALL dates from both sources
    const allDates = new Set([...sentimentMap.keys(), ...priceMap.keys()]);
    const chartData = Array.from(allDates).sort().map(date => ({
        date,
        sentiment: sentimentMap.has(date) ? sentimentMap.get(date) : undefined,
        price: priceMap.has(date) ? priceMap.get(date) : undefined,
    }));

    // Take all available data (not just last 12)
    const displayData = chartData.length > 12 ? chartData.slice(-50) : chartData;

    // Calculate price domain
    const prices = displayData.map(d => d.price).filter(p => p !== undefined && p !== null);
    const sentiments = displayData.map(d => d.sentiment).filter(s => s !== undefined && s !== null);
    
    const minPrice = prices.length > 0 ? Math.min(...prices) : 0;
    const maxPrice = prices.length > 0 ? Math.max(...prices) : 100;
    const priceRange = maxPrice - minPrice;
    const pricePadding = priceRange * 0.05;

    console.log('SentimentGauge Debug:', {
        historyLength: history?.length,
        priceHistoryLength: priceHistory?.length,
        displayDataLength: displayData.length,
        sentimentsCount: sentiments.length,
        pricesCount: prices.length,
        sampleData: displayData.slice(0, 3)
    });

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
                            Sentiment Score
                        </div>
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
                                
                                {/* Sentiment Line - ALWAYS render if data exists */}
                                {sentiments.length > 0 && (
                                    <Line 
                                        yAxisId="sentiment"
                                        type="monotone" 
                                        dataKey="sentiment" 
                                        stroke="#a78bfa"
                                        strokeWidth={3}
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
